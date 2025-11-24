import React, { useEffect, useState } from 'react';
import { X, Download, Loader2, AlertCircle } from 'lucide-react';
import { storage } from '../firebaseConfig';
import { ref, getBytes } from 'firebase/storage';

interface PDFViewerProps {
  pdf: { name: string; url: string; date: string; size: string; path?: string } | null;
  onClose: () => void;
  violation: boolean;
  onViolation: () => void;
  canDownload: boolean;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ pdf, onClose, violation, onViolation, canDownload }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdf) {
      setBlobUrl(null);
      return;
    }

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        // Extract the storage path from the URL or use provided path
        let storagePath = pdf.path;
        
        if (!storagePath && pdf.url) {
          // Parse path from storage URL if not provided
          // URL format: https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Fto%2Ffile.pdf?alt=media&token=...
          const urlObj = new URL(pdf.url);
          const encodedPath = urlObj.pathname.split('/o/')[1]?.split('?')[0];
          if (encodedPath) {
            storagePath = decodeURIComponent(encodedPath);
          }
        }

        if (!storagePath) {
          throw new Error('Unable to determine file path');
        }

        // Use Firebase SDK getBytes() to avoid CORS issues
        const fileRef = ref(storage, storagePath);
        const bytes = await getBytes(fileRef);

        // Create blob with correct MIME type
        const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        setBlobUrl(url);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error loading PDF';
        setError(errorMsg);
        console.error('PDF loading error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [pdf]);

  const handleDownload = () => {
    if (pdf && blobUrl) {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = pdf.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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
            onClick={() => { onClose(); }}
            className="relative btn btn-danger w-full justify-center font-bold"
          >
            Close & Acknowledge
          </button>
        </div>
      ) : (
        <div className="modal-content modal-xl relative flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface z-10">
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
                  className="btn-icon disabled:opacity-50 disabled:cursor-not-allowed"
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
          
          <div className="flex-1 bg-black relative overflow-hidden flex flex-col">
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
            ) : blobUrl ? (
              <iframe 
                src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                className="w-full h-full flex-1 relative z-10" 
                title="Protected Document" 
                sandbox="allow-scripts allow-same-origin"
                style={{ border: 'none' }}
                onError={() => setError('Failed to render PDF in viewer')}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
