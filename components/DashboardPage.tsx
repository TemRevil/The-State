
import React, { useState, useEffect, useRef } from 'react';
import { storage, auth, db } from '../firebaseConfig';
import { ref, listAll, getMetadata, getDownloadURL, uploadBytes } from 'firebase/storage';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { LogOut, FileText, FolderOpen, Loader2, LayoutGrid, X, ShieldCheck, Lock, Download, ShieldAlert, EyeOff } from 'lucide-react';
import { PDFViewer } from './PDFViewer';

interface PDFFile { name: string; url: string; date: string; size: string; }
interface DashboardPageProps { onLogout: () => void; onNavigateAdmin: () => void; isAdmin: boolean; }
const ALLOWED_ADMIN_UIDS = ["SveIem0WRcSCKl1IK44dZ1KfalO2", "s5rGItmRedXGhgjKr0hUW256Xor1"];

export const DashboardPage: React.FC<DashboardPageProps> = ({ onLogout, onNavigateAdmin, isAdmin }) => {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [activeWeek, setActiveWeek] = useState<string | null>(null);
  const [pdfs, setPdfs] = useState<PDFFile[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingPDFs, setLoadingPDFs] = useState(false);
  const [userName, setUserName] = useState('');
  const [canDownload, setCanDownload] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<PDFFile | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [violation, setViolation] = useState(false);
  const [isFocusLost, setIsFocusLost] = useState(false);
  
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUserName(localStorage.getItem("Name") || "User");
    loadWeeks();
    const checkPerms = async () => {
       const num = localStorage.getItem("Number");
       if (!num) return;
       try {
          const s = await getDoc(doc(db, "Numbers", num));
          if (s.exists()) setCanDownload(s.data()["PDF-Down"] === true);
       } catch {}
    };
    checkPerms();
  }, []);

  useEffect(() => { if (activeWeek) loadWeekPDFs(activeWeek); }, [activeWeek]);
  useEffect(() => { if (showAdminLogin) setTimeout(() => passwordInputRef.current?.focus(), 100); }, [showAdminLogin]);

  // Focus & Visibility Tracking (Blocker Wall)
  useEffect(() => {
    const handleVisibilityChange = () => {
       if (document.hidden) {
          setIsFocusLost(true);
       }
    };

    const handleBlur = () => {
       // If the active element is an iframe (PDF viewer), ignore blur to allow interaction
       if (document.activeElement instanceof HTMLIFrameElement) {
          return;
       }
       setIsFocusLost(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
       document.removeEventListener("visibilitychange", handleVisibilityChange);
       window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Anti-Screenshot & Copy Protection
  useEffect(() => {
    if (!selectedPdf) { setViolation(false); return; }

    const handleViolation = async () => {
      if (violation) return;
      setViolation(true);
      
      const num = localStorage.getItem("Number");
      if (num) {
         // 1. Increment Screened Count
         try {
           await updateDoc(doc(db, "Numbers", num), { Screened: increment(1) });
         } catch (e) { console.error("Failed to log violation", e); }
         
         // 2. Upload "Evidence" Image
         try {
           const canvas = document.createElement('canvas');
           canvas.width = 1280; canvas.height = 720;
           const ctx = canvas.getContext('2d');
           if (ctx) {
              // Background
              ctx.fillStyle = '#09090b';
              ctx.fillRect(0,0, 1280, 720);
              
              // Warning Box
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 10;
              ctx.strokeRect(50, 50, 1180, 620);
              
              // Text
              ctx.fillStyle = '#ef4444';
              ctx.font = 'bold 80px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('SECURITY VIOLATION', 640, 250);
              
              ctx.fillStyle = '#ffffff';
              ctx.font = '40px sans-serif';
              ctx.fillText('SCREENSHOT ATTEMPT DETECTED', 640, 320);
              
              ctx.fillStyle = '#a1a1aa';
              ctx.font = '30px monospace';
              ctx.fillText(`User Name: ${localStorage.getItem("Name") || 'Unknown'}`, 640, 450);
              ctx.fillText(`User ID:   ${num}`, 640, 500);
              ctx.fillText(`Timestamp: ${new Date().toLocaleString()}`, 640, 550);
              ctx.fillText(`Device:    ${localStorage.getItem("DeviceName") || 'Unknown'}`, 640, 600);
              
              canvas.toBlob(async (blob) => {
                 if (blob) {
                    const fname = `Shot_${num}_${Date.now()}.png`;
                    await uploadBytes(ref(storage, `Captured-Shots/${fname}`), blob);
                 }
              });
           }
         } catch (e) { console.error("Evidence generation failed", e); }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' ||
        (e.ctrlKey && (e.key === 'p' || e.key === 's')) ||
        (e.metaKey && (e.key === 'p' || e.key === 's')) ||
        (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5'))
      ) {
         e.preventDefault();
         handleViolation();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') handleViolation();
    };

    const handleCopy = (e: ClipboardEvent) => {
       // Optional: Block copying text
       e.preventDefault();
       // handleViolation(); // Uncomment if copying text should also trigger the wall
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('copy', handleCopy);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('copy', handleCopy);
    };
  }, [selectedPdf, violation]);

  const loadWeeks = async () => {
    try {
      const res = await listAll(ref(storage, '/'));
      const w = res.prefixes.map(f => f.name).filter(n => n.startsWith('Week ')).sort((a, b) => parseInt(a.split(' ')[1]||'0') - parseInt(b.split(' ')[1]||'0'));
      setWeeks(w); if (w.length > 0) setActiveWeek(w[0]);
    } catch (e) { console.error(e); } finally { setLoadingWeeks(false); }
  };

  const loadWeekPDFs = async (w: string) => {
    setLoadingPDFs(true); setPdfs([]);
    try {
      const res = await listAll(ref(storage, w));
      const p = await Promise.all(res.items.map(async (i) => {
        try {
          const m = await getMetadata(i);
          const u = await getDownloadURL(i);
          return { name: i.name.replace('.pdf', ''), url: u, date: new Date(m.timeCreated).toLocaleDateString('en-GB'), size: `${(m.size/(1024*1024)).toFixed(2)}mb` };
        } catch { return null; }
      }));
      setPdfs(p.filter((x): x is PDFFile => x !== null));
    } catch { } finally { setLoadingPDFs(false); }
  };

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword) return;
    setAdminLoading(true); setAdminError('');
    try {
      const c = await signInWithEmailAndPassword(auth, "temrevil+1@gmail.com", adminPassword);
      if (ALLOWED_ADMIN_UIDS.includes(c.user.uid)) { setShowAdminLogin(false); setAdminPassword(''); onNavigateAdmin(); }
      else throw new Error();
    } catch { setAdminError('Access Denied'); } finally { setAdminLoading(false); }
  };

  return (
    <div className="flex flex-row h-screen w-full select-none overflow-hidden bg-app-base">
      
      {/* SIDEBAR */}
      <aside className="sidebar z-20 shadow-lg">
        <div className="sidebar-header">
          <div className="flex items-center gap-3">
            <div className="rounded-lg flex items-center justify-center text-white bg-surface border border-white/10" style={{ width: '36px', height: '36px' }}>
              <LayoutGrid size={18} />
            </div>
            <div>
              <h1 className="font-bold text-white tracking-tight text-base">The State</h1>
              <p className="text-muted text-xs">Secure Portal</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-14 custom-scrollbar">
          {loadingWeeks ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted" size={24} /></div>
          ) : (
            <div className="flex flex-col gap-2">
              {weeks.map((week) => (
                <button
                  key={week}
                  onClick={() => setActiveWeek(week)}
                  className={`nav-btn ${activeWeek === week ? 'active' : ''}`}
                >
                  <FolderOpen size={18} className={activeWeek === week ? 'text-primary' : ''} />
                  <span className="font-medium">{week}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 mt-auto">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface/50 mb-3 border border-white/5">
              <div className="rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold" style={{ width: '32px', height: '32px' }}>{userName.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{userName}</p>
                <p className="text-xs text-success">Connected</p>
              </div>
            </div>
            {isAdmin && (
               <button onClick={() => setShowAdminLogin(true)} className="nav-btn mb-1">
                 <ShieldCheck size={16} /> Admin
               </button>
            )}
            <button onClick={onLogout} className="nav-btn hover:text-error hover:bg-red-500/10">
              <LogOut size={16} /> Sign Out
            </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="content-header">
          <div>
            <h2 className="text-2xl font-bold text-white">{activeWeek || 'Loading...'}</h2>
            <p className="text-sm text-muted">Document Repository</p>
          </div>
        </header>

        <div className="content-body custom-scrollbar">
          {loadingPDFs ? (
            <div className="flex flex-col items-center justify-center h-full text-muted gap-4">
              <Loader2 size={32} className="animate-spin opacity-40" />
              <p className="text-sm font-medium">Syncing documents...</p>
            </div>
          ) : pdfs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted gap-6 border border-dashed border-white/10 rounded-2xl mx-auto max-w-lg p-12">
              <FolderOpen size={48} className="opacity-20" />
              <p className="text-sm">No documents found in this directory.</p>
            </div>
          ) : (
            <div className="grid-cards">
              {pdfs.map((pdf) => (
                <div key={pdf.name} onClick={() => setSelectedPdf(pdf)} className="resource-card group">
                  <div className="flex-1">
                    <div className="card-icon">
                      <FileText size={24} />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2 leading-snug line-clamp-2">{pdf.name}</h3>
                  </div>
                  <div className="pt-4 flex justify-between items-center text-muted text-xs border-t border-white/5 mt-auto">
                    <span>{pdf.date}</span>
                    <span className="font-mono opacity-70">{pdf.size}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* PDF VIEWER COMPONENT */}
      <PDFViewer
        pdf={selectedPdf}
        onClose={() => { setSelectedPdf(null); setViolation(false); }}
        violation={violation}
        onViolation={() => setViolation(true)}
        canDownload={canDownload}
      />

      {/* FOCUS LOST BLOCKER WALL */}
      {isFocusLost && (
        <div 
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center text-center p-8 animate-fade-in select-none" 
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', zIndex: 50 }}
        >
          <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-glow">
             <EyeOff size={48} className="text-muted" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Session Paused</h2>
          <p className="text-muted text-lg mb-8 max-w-md">Focus has been lost. To ensure security, content is hidden while you are away.</p>
          <button onClick={() => setIsFocusLost(false)} className="btn btn-primary px-8 py-3 h-auto text-lg rounded-full">Resume Session</button>
        </div>
      )}

      {/* ADMIN LOGIN MODAL */}
      {showAdminLogin && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content modal-sm p-8 relative">
            <button onClick={() => setShowAdminLogin(false)} className="absolute top-4 right-4 text-muted hover:text-white transition-colors"><X size={20} /></button>
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-surface border border-white/10 flex items-center justify-center mb-6 text-primary shadow-glow">
                <ShieldCheck size={28} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Admin Access</h2>
              <p className="text-muted text-sm mb-8 text-center">Restricted area. Authentication required.</p>
              
              <form onSubmit={handleAdminLoginSubmit} className="w-full flex flex-col gap-4">
                <div className="relative">
                   <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={18} />
                   <input 
                     ref={passwordInputRef} 
                     type="password" 
                     value={adminPassword} 
                     onChange={(e) => setAdminPassword(e.target.value)} 
                     placeholder="Security Code" 
                     className="login-input pl-12" 
                   />
                </div>
                {adminError && <div className="text-center text-xs text-error py-2 bg-red-500/10 rounded-lg border border-red-500/20">{adminError}</div>}
                <button type="submit" disabled={adminLoading} className="btn btn-primary w-full">
                  {adminLoading ? <Loader2 size={20} className="animate-spin" /> : 'Authenticate'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
