
import React, { useState, useEffect, useRef } from 'react';
import { storage, auth, db } from '../firebaseConfig';
import { ref, listAll, getMetadata, uploadBytes } from 'firebase/storage';
import { collection, doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { LogOut, FileText, FolderOpen, Loader2, LayoutGrid, X, ShieldCheck, Lock, Download, ShieldAlert, EyeOff } from 'lucide-react';
import { PDFViewer } from './PDFViewer';

interface PDFFile { name: string; url: string; date: string; size: string; path: string; }
interface MainPageProps { onLogout: () => void; onNavigateAdmin: () => void; isAdmin: boolean; }
const ALLOWED_ADMIN_UIDS = ["SveIem0WRcSCKl1IK44dZ1KfalO2", "s5rGItmRedXGhgjKr0hUW256Xor1"];

export const MainPage: React.FC<MainPageProps> = ({ onLogout, onNavigateAdmin, isAdmin }) => {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [activeWeek, setActiveWeek] = useState<string | null>(null);
  const [pdfs, setPdfs] = useState<PDFFile[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingPDFs, setLoadingPDFs] = useState(false);
  const [userName, setUserName] = useState('');
  const [canDownload, setCanDownload] = useState(false);
  const [globalPdfSetting, setGlobalPdfSetting] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<PDFFile | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [violation, setViolation] = useState(false);
  const [isFocusLost, setIsFocusLost] = useState(false);
  const [isPermanentlyBlocked, setIsPermanentlyBlocked] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [userStats, setUserStats] = useState<{ quiziTimes?: number; screened?: number }>({});

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUserName(localStorage.getItem("Name") || "User");
    loadWeeks();
     const checkPerms = async () => {
       const num = localStorage.getItem("Number");
       try {
         const s = await getDoc(doc(db, "Dashboard", "Settings"));
         const globalPdf = s.exists() ? (s.data()["PDF-Down"] === true) : null;
         setGlobalPdfSetting(globalPdf);
         if (globalPdf === true) {
          setCanDownload(true);
          return;
         }
       } catch (e) { console.warn('Could not read global PDF settings', e); }

       if (!num) return;
       try {
         const s = await getDoc(doc(db, "Numbers", num));
         if (s.exists()) setCanDownload(s.data()["PDF-Down"] === true);
       } catch (e) { console.warn('Could not read per-number PDF setting', e); }
     };
    checkPerms();

    const num = localStorage.getItem("Number");
    if (num) {
      const userDocRef = doc(db, "Numbers", num);
      const unsub = onSnapshot(userDocRef, (snap) => {
        if (snap.exists()) setUserStats({ quiziTimes: snap.data()['Quizi-Times'], screened: snap.data()['Screened'] });
      });
      return () => unsub();
    }
  }, []);

  // Effect to restrict context menu and developer tools for specific users
  useEffect(() => {
    const userNumber = localStorage.getItem("Number");
    const allowedNumber = "01001308280";

    if (userNumber !== allowedNumber) {
      const handleContextMenu = (e: MouseEvent) => e.preventDefault();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || (e.metaKey && e.altKey && (e.key === 'i' || e.key === 'j' || e.key === 'c')) || (e.ctrlKey && e.key === 'u')) {
          e.preventDefault();
        }
      };
      document.addEventListener('contextmenu', handleContextMenu);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('contextmenu', handleContextMenu);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, []);

  // Listen to global settings changes
  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, 'Dashboard', 'Settings'), (snap) => {
        if (snap.exists()) {
          const globalPdf = snap.data()['PDF-Down'];
          setGlobalPdfSetting(globalPdf === true);
          if (globalPdf === true) setCanDownload(true);
          else {
            const num = localStorage.getItem('Number');
            if (!num) { setCanDownload(false); return; }
            getDoc(doc(db, 'Numbers', num)).then(s => { if (s.exists()) setCanDownload(s.data()['PDF-Down'] === true); else setCanDownload(false); }).catch(() => {});
          }
        }
      });
      return () => unsub();
    } catch (e) { }
  }, []);

  // Real-time block status checker
  useEffect(() => {
    const num = localStorage.getItem("Number");
    if (!num) return;
    const blockedDocRef = doc(db, "Blocked", num);
    const unsubscribe = onSnapshot(blockedDocRef, (docSnap) => {
      setIsPermanentlyBlocked(docSnap.exists());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => { if (activeWeek) loadWeekPDFs(activeWeek); }, [activeWeek]);
  useEffect(() => { if (showAdminLogin) setTimeout(() => passwordInputRef.current?.focus(), 100); }, [showAdminLogin]);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Focus & Visibility Tracking
  useEffect(() => {
    const handleViolation = () => {
      if (violation) return;
      setViolation(true);
    };

    const handleVisibilityChange = () => {
      if (document.hidden && selectedPdf) {
        handleViolation();
      } else if (document.hidden) {
        setIsFocusLost(true);
      }
    };
    const handleBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) return;
      if (selectedPdf) handleViolation();
      else setIsFocusLost(true);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    return () => {
       document.removeEventListener("visibilitychange", handleVisibilityChange);
       window.removeEventListener("blur", handleBlur);
    };
  }, [selectedPdf, violation]);

  // Anti-Screenshot & Copy Protection
  useEffect(() => {
    if (!selectedPdf) { setViolation(false); return; }
    const handleViolation = async () => {
      if (violation) return;
      setViolation(true);
      const num = localStorage.getItem("Number");
      if (num) {
         try { await updateDoc(doc(db, "Numbers", num), { Screened: increment(1) }); } catch (e) { console.error("Failed to log violation", e); }
         try {
           const canvas = document.createElement('canvas');
           canvas.width = 1280; canvas.height = 720;
           const ctx = canvas.getContext('2d');
           if (ctx) {
              ctx.fillStyle = '#09090b'; ctx.fillRect(0,0, 1280, 720);
              ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 10; ctx.strokeRect(50, 50, 1180, 620);
              ctx.fillStyle = '#ef4444'; ctx.font = 'bold 80px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SECURITY VIOLATION', 640, 250);
              ctx.fillStyle = '#ffffff'; ctx.font = '40px sans-serif'; ctx.fillText('SCREENSHOT ATTEMPT DETECTED', 640, 320);
              ctx.fillStyle = '#a1a1aa'; ctx.font = '30px monospace';
              ctx.fillText(`User Name: ${localStorage.getItem("Name") || 'Unknown'}`, 640, 450);
              ctx.fillText(`User ID:   ${num}`, 640, 500);
              ctx.fillText(`Timestamp: ${new Date().toLocaleString()}`, 640, 550);
              ctx.fillText(`Device:    ${localStorage.getItem("DeviceName") || 'Unknown'}`, 640, 600);
              canvas.toBlob(async (blob) => { if (blob) { const fname = `Shot_${num}_${Date.now()}.png`; await uploadBytes(ref(storage, `Captured-Shots/${fname}`), blob); } });
           }
         } catch (e) { console.error("Evidence generation failed", e); }
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ( e.key === 'PrintScreen' || (e.ctrlKey && (e.key === 'p' || e.key === 's')) || (e.metaKey && (e.key === 'p' || e.key === 's')) || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) ) { e.preventDefault(); handleViolation(); } };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'PrintScreen') handleViolation(); };
    const handleCopy = (e: ClipboardEvent) => { e.preventDefault(); };
    const handleTouchStart = (e: TouchEvent) => { if (e.touches.length >= 3) { e.preventDefault(); handleViolation(); } };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp); window.addEventListener('copy', handleCopy); window.addEventListener('touchstart', handleTouchStart);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); window.removeEventListener('copy', handleCopy); window.removeEventListener('touchstart', handleTouchStart); };
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
          return { name: i.name.replace('.pdf', ''), url: '', date: new Date(m.timeCreated).toLocaleDateString('en-GB'), size: `${(m.size/(1024*1024)).toFixed(2)}mb`, path: i.fullPath };
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
      if (c.user.email === 'temrevil+1@gmail.com' || ALLOWED_ADMIN_UIDS.includes(c.user.uid)) {
        setShowAdminLogin(false); setAdminPassword(''); onNavigateAdmin();
      } else { throw new Error('Access Denied'); }
    } catch (err) { setAdminError('Access Denied'); recordFailedLoginAttempt(adminPassword); } finally { setAdminLoading(false); }
  };
  
  const recordFailedLoginAttempt = async (enteredPassword: string) => {
    try {
      const brokerId = localStorage.getItem('Number') || 'Unknown_User';
      const now = new Date();
      try { await updateDoc(doc(db, 'Dashboard', 'Failed Login'), { Count: increment(1) }); } catch (e) { try { await setDoc(doc(db, 'Dashboard', 'Failed Login'), { Count: 1 }); } catch (er) { } }
      try {
        const brokerDocRef = doc(db, 'Brokers', brokerId);
        const docSnap = await getDoc(brokerDocRef);
        let nextAttemptId = 1;
        if (docSnap.exists()) { const data = docSnap.data(); const attemptKeys = Object.keys(data.Attempts || {}).map(Number).filter(k => !isNaN(k)); if (attemptKeys.length > 0) { nextAttemptId = Math.max(...attemptKeys) + 1; } }
        const newAttemptData = { Password: enteredPassword, Date: now.toLocaleDateString('en-GB'), Time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }), };
        await setDoc(brokerDocRef, { Attempts: { [nextAttemptId]: newAttemptData } }, { merge: true });
      } catch (e) { console.warn('Failed to write/update login attempt record', e); }
    } catch (e) { console.warn('Failed to record failed login', e); }
  };

  return (
    <div className="flex flex-row h-screen w-full select-none overflow-hidden bg-app-base">
      <aside className={`sidebar z-20 shadow-lg ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header justify-between">
           <div className="flex items-center gap-3">
             <div className="rounded-lg flex items-center justify-center text-white bg-surface border border-white/10" style={{ width: '36px', height: '36px' }}> <LayoutGrid size={18} /> </div>
             <div> <h1 className="font-bold text-white tracking-tight text-base">The State</h1> </div>
           </div>
         </div>
        <div className="flex-1 overflow-auto px-4 py-14 custom-scrollbar">
          {loadingWeeks ? ( <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted" size={24} /></div> ) : (
            <div className="flex flex-col gap-2">
              {weeks.map((week) => ( <button key={week} onClick={() => setActiveWeek(week)} className={`nav-btn ${activeWeek === week ? 'active' : ''}`} > <FolderOpen size={18} className={activeWeek === week ? 'text-primary' : ''} /> <span className="font-medium">{week}</span> </button> ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-white/10 mt-auto">
            {!isMobile && (
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface/50 mb-3 border border-white/5">
                  <div className="rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold" style={{ width: '32px', height: '32px' }}>{userName.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{userName}</p>
                    <p className="text-xs text-success">Connected</p>
                  </div>
                </div>
            )}
            {(isAdmin || isMobile) && ( <button onClick={() => setShowAdminLogin(true)} className={`nav-btn mb-1 ${!isAdmin && 'hidden'}`}> <ShieldCheck size={16} /> Admin </button> )}
            <button onClick={onLogout} className="nav-btn mb-1"> <LogOut size={16} /> Logout </button>
        </div>
      </aside>
      {sidebarOpen && <div className="mobile-backdrop" onClick={() => setSidebarOpen(false)} />}
      <main className="main-content">
        <header className="content-header">
            <div className="flex items-center gap-3">
                <button onClick={() => setSidebarOpen(s => !s)} className="mobile-toggle" aria-label="Toggle menu">☰</button>
                <div>
                    <h2 className="text-2xl font-bold text-white">{activeWeek || 'Loading...'}</h2>
                    <p className="text-sm text-muted">Main page</p>
                </div>
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
                        <div className="card-icon"> <FileText size={24} /> </div>
                        <h3 className="text-lg font-semibold text-white mb-2 leading-snug line-clamp-2 font-arabic">{pdf.name}</h3>
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
      <PDFViewer pdf={selectedPdf} onClose={() => { setSelectedPdf(null); setViolation(false); }} violation={violation} onViolation={() => setViolation(true)} canDownload={canDownload} />
      {isFocusLost && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center p-8 animate-fade-in select-none" style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', zIndex: 200000 }}>
          <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-glow"> <EyeOff size={48} className="text-muted" /> </div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Session Paused</h2>
          <p className="text-muted text-lg mb-8 max-w-md">Focus has been lost. To ensure security, content is hidden while you are away.</p>
          <button onClick={() => setIsFocusLost(false)} className="btn btn-primary px-8 py-3 h-auto text-lg rounded-full">Resume Session</button>
        </div>
      )}
      {isPermanentlyBlocked && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center p-8 animate-fade-in select-none" style={{ backgroundColor: 'rgba(127, 29, 29, 0.5)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', zIndex: 200001 }}>
          <div className="w-24 h-24 rounded-full bg-error/20 border border-error/30 flex items-center justify-center mb-6 shadow-glow-error"> <ShieldAlert size={48} className="text-error" /> </div>
          <h2 className="text-4xl font-bold text-white mb-2 tracking-tight">Access Revoked</h2>
          <p className="text-red-200 text-lg mb-8 max-w-md">Your account has been blocked by an administrator. Please contact support for further information.</p>
          <button onClick={async () => { await signOut(auth); onLogout(); }} className="btn btn-danger px-8 py-3 h-auto text-lg rounded-full flex items-center gap-2"> <LogOut size={20} /> Acknowledge & Sign Out </button>
        </div>
      )}
      {showAdminLogin && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content modal-sm p-8 relative">
            <button onClick={() => setShowAdminLogin(false)} className="btn-icon absolute top-4 right-4"><X size={20} /></button>
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-surface border border-white/10 flex items-center justify-center mb-6 text-primary shadow-glow"> <ShieldCheck size={28} /> </div>
              <h2 className="text-2xl font-bold text-white mb-2">Admin Access</h2>
              <p className="text-muted text-sm mb-8 text-center">Restricted area. Authentication required.</p>
              <form onSubmit={handleAdminLoginSubmit} className="w-full flex flex-col gap-4">
                <div className="relative">
                   <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={18} />
                   <input ref={passwordInputRef} type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Security Code" className="login-input pl-12" />
                </div>
                {adminError && <div className="text-center text-xs text-error py-2 bg-red-500/10 rounded-lg border border-red-500/20">{adminError}</div>}
                <button type="submit" disabled={adminLoading} className="btn btn-primary w-full"> {adminLoading ? <Loader2 size={20} className="animate-spin" /> : 'Authenticate'} </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
