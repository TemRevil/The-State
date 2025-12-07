import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { X, Download, Loader2, AlertCircle, ZoomIn, ZoomOut, FileText } from 'lucide-react';
import { storage } from '../firebaseConfig';
import { ref, getBytes } from 'firebase/storage';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Serve the worker from the local `public/` folder (copied from `node_modules/pdfjs-dist/build`)
// Vite will expose `public/pdf.worker.min.mjs` at `/The-State/pdf.worker.min.mjs`
GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';

interface PDFViewerProps {
  pdf: { name: string; url: string; date: string; size: string; path: string } | null;
  onClose: () => void;
  violation: boolean;
  onViolation: () => void;
  canDownload: boolean;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ pdf, onClose, violation, onViolation, canDownload }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const pageCanvasRefs = useRef<{ [key: number]: HTMLCanvasElement | null }>({});

  const [isMobile, setIsMobile] = useState(false);

  useLayoutEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Additional screenshot detection layer in PDF viewer
  useEffect(() => {
    if (!pdf || violation) return;

    let volumeUpPressed = false;
    let volumeDownPressed = false;
    let volumeButtonPressTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Volume button detection
      if (e.key === 'VolumeUp' || e.key === 'AudioVolumeUp' || e.code === 'VolumeUp') {
        volumeUpPressed = true;
        volumeButtonPressTime = Date.now();
        if (volumeDownPressed) {
          e.preventDefault();
          onViolation();
        }
      }

      if (e.key === 'VolumeDown' || e.key === 'AudioVolumeDown' || e.code === 'VolumeDown') {
        volumeDownPressed = true;
        volumeButtonPressTime = Date.now();
        if (volumeUpPressed) {
          e.preventDefault();
          onViolation();
        }
      }

      // Standard screenshot shortcuts
      if (e.key === 'PrintScreen' || (e.ctrlKey && (e.key === 'p' || e.key === 's')) || (e.metaKey && (e.key === 'p' || e.key === 's'))) {
        e.preventDefault();
        onViolation();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') onViolation();

      if (e.key === 'VolumeUp' || e.key === 'AudioVolumeUp' || e.code === 'VolumeUp') {
        volumeUpPressed = false;
        if (Date.now() - volumeButtonPressTime > 200 && volumeDownPressed) {
          onViolation();
        }
      }

      if (e.key === 'VolumeDown' || e.key === 'AudioVolumeDown' || e.code === 'VolumeDown') {
        volumeDownPressed = false;
        if (Date.now() - volumeButtonPressTime > 200 && volumeUpPressed) {
          onViolation();
        }
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      onViolation();
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3) {
        onViolation();
      }
      if (e.touches.length >= 2 && (volumeUpPressed || volumeDownPressed)) {
        onViolation();
      }
    };

    // Note: Visibility change is handled by parent component to close PDF silently
    // Only actual screenshot attempts (keys, touches) trigger violations here

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('copy', handleCopy, true);
    window.addEventListener('touchstart', handleTouchStart, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('copy', handleCopy, true);
      window.removeEventListener('touchstart', handleTouchStart, true);
    };
  }, [pdf, violation, onViolation]);

  // Load PDF from Firebase
  useEffect(() => {
    if (!pdf) {
      setPdfDoc(null);
      setPdfBytes(null);
      return;
    }

    setLoading(true);
    setError(null);
    setZoom(1);
    pageCanvasRefs.current = {};

    (async () => {
      try {
        let storagePath = pdf.path;

        if (!storagePath && pdf.url) {
          const urlObj = new URL(pdf.url);
          const encodedPath = urlObj.pathname.split('/o/')[1]?.split('?')[0];
          if (encodedPath) {
            storagePath = decodeURIComponent(encodedPath);
          }
        }

        if (!storagePath) {
          throw new Error('Unable to determine file path');
        }

        // Fetch PDF bytes from Firebase
        const fileRef = ref(storage, storagePath);
        const bytes = await getBytes(fileRef);
        // Normalize to a typed array and create a safe copy to avoid detached buffers
        const fetchedU8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes as any);
        const safeCopy = Uint8Array.from(fetchedU8);
        setPdfBytes(safeCopy);

        // Load PDF document directly from the fetched typed array
        const loadedDoc = await getDocument({ data: fetchedU8 }).promise;
        setPdfDoc(loadedDoc);
        setTotalPages(loadedDoc.numPages);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error loading PDF';
        setError(errorMsg);
        console.error('PDF loading error:', err);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        try {
          pdfDoc.destroy();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [pdf]);

  // Render all pages for scrolling view
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc) return;

    try {
      const canvasElement = pageCanvasRefs.current[pageNum];
      if (!canvasElement) return;

      const page = await pdfDoc.getPage(pageNum);

      // Get device pixel ratio for high-DPI displays
      const devicePixelRatio = window.devicePixelRatio || 1;
      // Use a quality multiplier (2x) for extra sharpness
      const qualityMultiplier = 2;

      // Calculate display viewport (what user sees)
      const displayViewport = page.getViewport({ scale: zoom });
      // Calculate render viewport (high resolution for quality)
      const renderScale = zoom * devicePixelRatio * qualityMultiplier;
      const renderViewport = page.getViewport({ scale: renderScale });

      // Set canvas internal size to high resolution
      canvasElement.width = renderViewport.width;
      canvasElement.height = renderViewport.height;

      // Set canvas display size (CSS size) to match zoom level
      canvasElement.style.width = `${displayViewport.width}px`;
      canvasElement.style.height = `${displayViewport.height}px`;

      const context = canvasElement.getContext('2d', {
        alpha: false, // Disable alpha for better performance
        desynchronized: false, // Better quality
        willReadFrequently: false
      });
      if (!context) return;

      // Enable high-quality image smoothing
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      const renderContext = {
        canvasContext: context,
        viewport: renderViewport,
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error(`Error rendering page ${pageNum}:`, err);
    }
  }, [pdfDoc, zoom]);

  // Render pages when they come into view
  useEffect(() => {
    if (!pdfDoc || totalPages === 0) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.getAttribute('data-page') || '0');
          if (pageNum > 0) {
            renderPage(pageNum);
          }
        }
      });
    }, { threshold: 0.1 });

    // Observe all canvas elements
    Object.values(pageCanvasRefs.current).forEach((canvas) => {
      if (canvas) observer.observe(canvas);
    });

  }, [pdfDoc, totalPages, renderPage]);

  // Handle PDF download from Firebase
  const handleDownload = async () => {
    if (!pdf) return;

    setDownloadLoading(true);
    try {
      let downloadU8: Uint8Array | null = pdfBytes;

      // If bytes not present, try to fetch from storage path; fall back to fetching the public URL if available
      if (!downloadU8) {
        // Try to determine storage path
        let storagePath = pdf.path;
        if (!storagePath && pdf.url) {
          try {
            const urlObj = new URL(pdf.url);
            const encodedPath = urlObj.pathname.split('/o/')[1]?.split('?')[0];
            if (encodedPath) storagePath = decodeURIComponent(encodedPath);
          } catch (e) {
            // ignore URL parse errors here; we'll try fetch below
            console.warn('Could not parse storage path from pdf.url', e);
          }
        }

        if (storagePath) {
          try {
            const fileRef = ref(storage, storagePath);
            const fetched = await getBytes(fileRef);
            // Normalize to Uint8Array and keep a safe copy
            const fetchedU8 = fetched instanceof ArrayBuffer ? new Uint8Array(fetched) : new Uint8Array(fetched as any);
            const copyU8 = Uint8Array.from(fetchedU8);
            downloadU8 = copyU8;
            setPdfBytes(copyU8);
          } catch (e) {
            console.warn('getBytes failed, will try fetching via public URL if available', e);
          }
        }

        // If still no bytes, try fetching the pdf.url directly (useful if file is publicly accessible via HTTP)
        if (!downloadU8 && pdf.url) {
          try {
            const resp = await fetch(pdf.url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const arr = await resp.arrayBuffer();
            const fetchedU8 = new Uint8Array(arr);
            const copy = Uint8Array.from(fetchedU8);
            downloadU8 = copy;
            setPdfBytes(copy);
          } catch (e) {
            console.warn('Failed to fetch PDF via pdf.url', e);
          }
        }
      }

      if (!downloadU8) throw new Error('Could not retrieve file bytes (check storage path or access permissions)');

      const pdfBlob = new Blob([downloadU8.buffer as ArrayBuffer], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = pdf.name.endsWith('.pdf') ? pdf.name : `${pdf.name}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 0.5));
  };

  if (!pdf) return null;

  return (
    <div onContextMenu={(e) => e.preventDefault()} className="modal-overlay animate-fade-in select-none">
      {violation ? (
        <div className="modal-content modal-md p-8 flex flex-col items-center text-center border border-error/50 relative overflow-hidden bg-[#09090b] shadow-[0_0_50px_rgba(239,68,68,0.2)]">
          <div className="absolute inset-0 bg-red-900/10 animate-pulse pointer-events-none"></div>

          <div className="relative w-24 h-24 rounded-full bg-error/10 flex items-center justify-center mb-6 text-error shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-bounce">
            <AlertCircle size={48} />
          </div>

          <h2 className="relative text-3xl font-bold text-white mb-2 tracking-tight">Security Alert</h2>
          <p className="relative text-error font-bold text-lg mb-6 uppercase tracking-widest">Screenshot Detected</p>

          <div className="relative bg-white/5 border border-white/10 rounded-lg p-4 mb-8 w-full">
            <p className="text-muted text-sm leading-relaxed">
              A security violation has been logged against your ID <strong>{localStorage.getItem("Number")}</strong>.
              <br /><br />
              This incident has been reported to the administrator. Repeated violations will result in an immediate permanent ban.
            </p>
          </div>

          <button
            onClick={onClose}
            className="relative btn btn-danger w-full justify-center font-bold"
          >
            Close & Acknowledge
          </button>
        </div>
      ) : (
        <div className="modal-content modal-xl relative flex flex-col h-[90vh]">
          {/* Header */}
          <div className={`flex items-center justify-between border-b border-white/10 bg-app-surface/30 backdrop-blur-lg z-10 shrink-0 ${isMobile ? 'px-3 py-3 gap-2' : 'px-10 py-5'}`}>
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <div className={`bg-primary/10 rounded-lg text-primary shrink-0 ${isMobile ? 'p-1.5' : 'p-2.5'}`}>
                <FileText size={isMobile ? 16 : 20} />
              </div>
              <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                <h3
                  className={`font-semibold text-white leading-tight overflow-hidden text-ellipsis whitespace-nowrap ${isMobile ? 'text-sm' : ''}`}
                  title={pdf.name}
                  style={{ maxWidth: '100%' }}
                >
                  {pdf.name}
                </h3>
                {!isMobile && <p className="text-xs text-muted truncate">{pdf.size} - {pdf.date}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {canDownload && (
                <button
                  onClick={handleDownload}
                  disabled={loading || downloadLoading}
                  className={`btn btn-ghost disabled:opacity-50 disabled:cursor-not-allowed group ${isMobile ? 'btn-xs p-1.5' : 'btn-sm'}`}
                  title="Download PDF"
                >
                  {downloadLoading ? (
                    <Loader2 size={isMobile ? 16 : 18} className="animate-spin" />
                  ) : (
                    <Download size={isMobile ? 16 : 18} className="text-muted group-hover:text-primary transition-colors" />
                  )}
                </button>
              )}
              <button onClick={onClose} className={`btn btn-ghost group ${isMobile ? 'btn-xs p-1.5' : 'btn-sm'}`} title="Close">
                <X size={isMobile ? 16 : 18} className="text-muted group-hover:text-white transition-colors" />
              </button>
            </div>
          </div>

          {/* Zoom Controls */}
          {pdfDoc && totalPages > 0 && (
            <div className="flex items-center gap-2 px-6 py-3 border-t border-white/10 bg-surface/50 shrink-0">
              {!isMobile && (
                <>
                  <button
                    onClick={handleZoomOut}
                    disabled={zoom <= 0.5}
                    className="btn-icon disabled:opacity-50 disabled:cursor-not-allowed hover:text-primary"
                    title="Zoom out"
                  >
                    <ZoomOut size={18} />
                  </button>
                  <span className="text-muted text-sm min-w-[60px] text-center">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={handleZoomIn}
                    disabled={zoom >= 3}
                    className="btn-icon disabled:opacity-50 disabled:cursor-not-allowed hover:text-primary"
                    title="Zoom in"
                  >
                    <ZoomIn size={18} />
                  </button>
                </>
              )}
              <div className="flex-1" />
              <span className="text-muted text-xs">{totalPages} pages</span>
            </div>
          )}

          {/* Main Content - Continuous Scroll */}
          <div ref={scrollContainerRef} className="flex-1 bg-black relative overflow-auto flex flex-col items-center justify-start pt-6 pb-6 gap-6">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-primary" />
                  <p className="text-muted text-sm">Loading document...</p>
                </div>
              </div>
            ) : error ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center p-8">
                  <AlertCircle size={32} className="text-error" />
                  <p className="text-error text-sm font-medium">Failed to load PDF</p>
                  <p className="text-muted text-xs">{error}</p>
                  <p className="text-muted text-xs mt-2">Try downloading the file instead or contact support.</p>
                </div>
              </div>
            ) : pdfDoc ? (
              <div className="flex flex-col items-center gap-6 w-full">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <div key={pageNum} className="relative flex flex-col items-center w-full">
                    <canvas
                      ref={(el) => {
                        if (el) pageCanvasRefs.current[pageNum] = el;
                      }}
                      data-page={pageNum}
                      className="max-w-full border border-white/10 rounded-lg shadow-lg bg-white"
                      style={{ maxWidth: '100%', height: 'auto' }}
                    />
                    <div className="text-muted text-xs mt-2">Page {pageNum}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
