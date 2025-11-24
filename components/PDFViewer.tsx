import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { storage } from '../firebaseConfig';
import { ref, getBytes } from 'firebase/storage';
import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  pdf: { name: string; url: string; date: string; size: string; path: string } | null;
  onClose: () => void;
  violation: boolean;
  onViolation: () => void;
  canDownload: boolean;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ pdf, onClose, violation, onViolation, canDownload }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // Load PDF from Firebase
  useEffect(() => {
    if (!pdf) {
      setPdfDoc(null);
      setBlobUrl(null);
      return;
    }

    setLoading(true);
    setError(null);
    setCurrentPage(1);

    let createdBlobUrl: string | null = null;
    let loadedDoc: any = null;

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

        // Create a blob URL for download/use in the UI, but pass raw bytes to pdf.js
        const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        createdBlobUrl = URL.createObjectURL(pdfBlob);
        setBlobUrl(createdBlobUrl);

        // Load PDF document directly from bytes (avoids any extra network/CORS)
        loadedDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
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
      // cleanup the created blob URL and destroy loaded pdf doc to free memory
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
      if (loadedDoc && typeof loadedDoc.destroy === 'function') {
        try {
          loadedDoc.destroy();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [pdf]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      if (currentPage < 1 || currentPage > totalPages) return;

      setRendering(true);
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;

        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        if (!context) return;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        await page.render(renderContext).promise;
      } catch (err) {
        console.error('Error rendering page:', err);
      } finally {
        setRendering(false);
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, totalPages]);

  const handleDownload = async () => {
    if (!pdf || !blobUrl) return;
    try {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = pdf.name.endsWith('.pdf') ? pdf.name : `${pdf.name}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const goToPage = (pageNum: number) => {
    const newPage = Math.max(1, Math.min(pageNum, totalPages));
    setCurrentPage(newPage);
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
              <br/><br/>
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface z-10 shrink-0">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                <AlertCircle size={18} />
              </div>
              <h3 className="font-semibold text-white truncate">{pdf.name}</h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canDownload && (
                <button 
                  onClick={handleDownload} 
                  disabled={loading || !blobUrl}
                  className="btn-icon disabled:opacity-50 disabled:cursor-not-allowed hover:text-primary"
                  title="Download PDF"
                >
                  <Download size={20} />
                </button>
              )}
              <button onClick={onClose} className="btn-icon hover:text-white">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div ref={containerRef} className="flex-1 bg-black relative overflow-auto flex flex-col items-center justify-start pt-4 pb-4">
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
              <>
                <canvas 
                  ref={canvasRef} 
                  className="max-w-full border border-white/10 rounded-lg shadow-lg"
                  style={{ maxHeight: 'calc(100% - 60px)' }}
                />
                {rendering && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg pointer-events-none">
                    <Loader2 size={24} className="animate-spin text-primary" />
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Footer with Controls */}
          {pdfDoc && totalPages > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-surface shrink-0 gap-4">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="btn-icon disabled:opacity-50 disabled:cursor-not-allowed hover:text-primary"
                title="Previous page"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                  className="w-12 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-center text-sm"
                />
                <span className="text-muted text-sm whitespace-nowrap">/ {totalPages}</span>
              </div>

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="btn-icon disabled:opacity-50 disabled:cursor-not-allowed hover:text-primary"
                title="Next page"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
