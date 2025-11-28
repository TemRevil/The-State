import React, { useState, useEffect, useRef } from 'react';
import { db, storage, auth } from '../firebaseConfig';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { LayoutGrid, FolderOpen, Camera, Settings, LogOut, Search, ShieldAlert, MoreVertical, Trash2, Plus, ArrowLeft, ArrowRight, Upload, X, FileText, Ban, Unlock, Check, BookOpen, Download, List, CheckSquare, Square, ChevronDown, Smartphone, KeyRound, Calendar, Clock, ShieldQuestion, EyeOff } from 'lucide-react';

interface AdminDashboardProps { onBack: () => void; }
interface NumberData { id: string; number: string; name: string; quizTimes: number; quizEnabled: boolean; pdfDown: boolean; deviceCount?: number; deviceLimit?: number; screenedCount: number; devices?: { Archived?: { [attemptId: string]: { Code: string; Date: string; Time: string; }; } }; }
interface BlockedData { id: string; number: string; name: string; reason: string; date: string; time: string; }
interface SnitchData { id: string; loginNumber: string; snitchNumber: string; snitchName: string; date: string; time: string; }
interface BrokerData { id: string; number: string; count: number; date: string; time: string; attempts: { Date: string; Time: string; Password?: string; }[]; }
interface FileData { name: string; type: 'file' | 'folder'; fullPath: string; url?: string; }

type ActiveInfo = { type: 'number'; data: NumberData; } | { type: 'broker'; data: BrokerData; };

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState<'tables' | 'files' | 'shots'>('tables');
   const [activeTableTab, setActiveTableTab] = useState<'numbers' | 'blocked' | 'snitches' | 'brokers'>('numbers');
   const [sidebarOpen, setSidebarOpen] = useState(false);
  const [numbers, setNumbers] = useState<NumberData[]>([]);  const [blocked, setBlocked] = useState<BlockedData[]>([]);
     const [snitches, setSnitches] = useState<SnitchData[]>([]);
     const [showInfoModal, setShowInfoModal] = useState(false); // Unified modal visibility
     const [activeInfo, setActiveInfo] = useState<ActiveInfo | null>(null); // Holds the data for the active info display
     const [loginAttemptsData, setLoginAttemptsData] = useState<LoginAttempt[]>([]); // New state for login attempts

  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [adminName, setAdminName] = useState('Admin');
  const [blockedNumbers, setBlockedNumbers] = useState<Set<string>>(new Set());
  
  // Files State
  const [files, setFiles] = useState<FileData[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [fileViewMode, setFileViewMode] = useState<'grid' | 'table'>('grid');

  const [shots, setShots] = useState<any[]>([]);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirmAction, setOnConfirmAction] = useState<() => void>(() => {});
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showTableNavMenu, setShowTableNavMenu] = useState(false);
  const [showFileNavMenu, setShowFileNavMenu] = useState(false);
  const tableNavRef = useRef<HTMLDivElement>(null);
  const fileNavRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  
  // Add User Inputs
  const [newNumber, setNewNumber] = useState('');
  const [newPdfDown, setNewPdfDown] = useState(false); // Default Blocked
  
  const [searchTerm, setSearchTerm] = useState('');
  const [globalQuiz, setGlobalQuiz] = useState(true);
  const [globalPdf, setGlobalPdf] = useState(true);

  // Define an interface for a single login attempt to make the code more readable and type-safe
  interface LoginAttempt {
    attemptId: string;
    deviceId: string;
    Code: string;
    Date: string;
    Time: string;
  }

  // Click Outside Handler for Dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.options-menu') && !target.closest('.btn-icon')) {
        setActiveDropdown(null);
      }
      if (tableNavRef.current && !tableNavRef.current.contains(event.target as Node)) {
        setShowTableNavMenu(false);
      }
      if (fileNavRef.current && !fileNavRef.current.contains(event.target as Node)) {
        setShowFileNavMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // --- DATA WATCHERS ---
   useEffect(() => {
    // Admin Name & Settings
    getDoc(doc(db, "Dashboard", "Admin")).then(s => s.exists() && setAdminName(s.data().Name || 'Admin'));
    getDoc(doc(db, "Dashboard", "Settings")).then(s => s.exists() && (setGlobalQuiz(s.data()["Quiz-Enabled"]), setGlobalPdf(s.data()["PDF-Down"])));
    
    // Watch Collections
    const u1 = onSnapshot(collection(db, "Blocked"), s => {
        const blockedData = s.docs.map(d => ({ 
            id: d.id, 
            number: d.id, 
            name: d.data().Name || 'Unknown', 
            reason: d.data().Reason || 'Unknown', 
            date: d.data()["Blocked Date"] || '', 
            time: d.data()["Blocked Time"] || ''
        }));
        setBlocked(blockedData);
        setBlockedNumbers(new Set(blockedData.map(b => b.number)));
    });
    
    const u2 = onSnapshot(collection(db, "Numbers"), s => {
        setNumbers(s.docs.map(d => ({ 
            id: d.id, 
            number: d.id, 
            name: d.data().Name, 
            quizTimes: d.data()["Quizi-Times"]||0, 
            quizEnabled: d.data()["Quiz-Enabled"]??true, 
            pdfDown: d.data()["PDF-Down"]??true, 
            deviceCount: 0, 
                        screenedCount: d.data()["Screened"]||0,
                        devices: d.data().Devices // This will be the top-level 'Devices' map
                    })));    });
    
      const u3 = onSnapshot(collection(db, "Snitches"), async s => {
           const snitchesData = await Promise.all(s.docs.map(async d => {
               const snitchNum = d.data()["The Snitch"];
               let fetchedSnitchName = "Unknown"; // Default name
               if (snitchNum) {
                   const numberDocRef = doc(db, "Numbers", snitchNum);
                   const numberDocSnap = await getDoc(numberDocRef);
                   if (numberDocSnap.exists()) {
                       fetchedSnitchName = numberDocSnap.data().Name || "Unknown";
                   }
               }
   
               return {
                   id: d.id,
                   loginNumber: d.data()["The Login Number"],
                   snitchNumber: snitchNum,
                   snitchName: fetchedSnitchName,
                   date: d.data()["Snitched Date"],
                   time: d.data()["Snitched Time"]
               };
           }));
           setSnitches(snitchesData);
       });
   
   const u4 = onSnapshot(collection(db, "Brokers"), s => {
     setBrokers(s.docs.map(d => {
       const data = d.data();
       const attemptsArray = Object.values(data.Attempts || {}) as { Date: string; Time: string; Password?: string; }[];
       const lastAttempt = attemptsArray.length > 0 ? attemptsArray[attemptsArray.length - 1] : { Date: '', Time: '' };
       return {
         id: d.id,
         number: d.id,
         count: attemptsArray.length,
         date: lastAttempt.Date,
         time: lastAttempt.Time,
         attempts: attemptsArray,
       };
     }));
   });

      return () => { u1(); u2(); u3(); u4(); };
  }, []);

  // Effect for window resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Effect to fetch login attempts when the modal is shown
  useEffect(() => {
    if (showInfoModal && activeInfo?.type === 'number') {
      const fetchLoginAttempts = async () => {
        const attempts: LoginAttempt[] = [];
        const numberDocRef = doc(db, 'Numbers', activeInfo.data.number);
        const numberDocSnap = await getDoc(numberDocRef);

        if (numberDocSnap.exists()) {
          const data = numberDocSnap.data();
          
          if (data && typeof data === 'object' && data.Devices && typeof data.Devices === 'object' && data.Devices.Archived && typeof data.Devices.Archived === 'object') {
            Object.keys(data.Devices.Archived).forEach(attemptId => {
              const attemptData = data.Devices.Archived![attemptId];
              if (attemptData && typeof attemptData === 'object') {
                attempts.push({
                  attemptId: attemptId,
                  deviceId: attemptId, // Use attemptId as deviceId for display
                  Code: attemptData.Code || 'N/A',
                  Date: attemptData.Date || 'N/A',
                  Time: attemptData.Time || 'N/A',
                });
              }
            });
          }
        }
        // Sort attempts by Device ID (attemptId) numerically in ascending order
        setLoginAttemptsData(attempts.sort((a, b) => parseInt(a.attemptId || '0') - parseInt(b.attemptId || '0')));
      };
      fetchLoginAttempts();
    } else {
      setLoginAttemptsData([]);
    }
  }, [showInfoModal, activeInfo]);

  const showConfirm = (message: string, action: () => void) => {
    setConfirmMessage(message);
    setOnConfirmAction(() => action);
    setShowConfirmModal(true);
  };

  const handleLogout = async () => { showConfirm("Logout?", async () => { await signOut(auth); window.location.reload(); }); };
  
  // --- NUMBER ACTIONS ---
  const handleCreateUser = async () => {
    if (!newNumber || newNumber.length !== 11) return alert("Invalid Number");
    try {
        await setDoc(doc(db, "Numbers", newNumber), {
            "Name": "Unknown",
            "PDF-Down": newPdfDown,
            "Quiz-Enabled": true,
            "Quizi-Times": 0,
            "Devices": {"Devices Allowed": 1},
            "Screened": 0
        });
        setShowAddModal(false); setNewNumber(''); setNewPdfDown(false);
    } catch (e) { console.error(e); }
  };

  const handleDeleteNumber = async (id: string) => { showConfirm("Delete?", async () => { try { await deleteDoc(doc(db, "Numbers", id.trim())); } catch {} finally { setActiveDropdown(null); } }); };
  
  const handleBlockNumber = async (item: NumberData) => {
    showConfirm(`Block ${item.name || item.number}?`, async () => {
      const now = new Date();
      try {
        await setDoc(doc(db, "Blocked", item.number), {
           "Blocked Date": now.toLocaleDateString("en-GB"),
           "Blocked Time": now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }),
           "Reason": "Blocked by Admin",
           "Name": item.name
        });
        setActiveDropdown(null);
      } catch (e) { console.error(e); }
    });
  };

  const handleToggleQuiz = async (item: NumberData) => {
      try {
        await updateDoc(doc(db, "Numbers", item.number), { "Quiz-Enabled": !item.quizEnabled });
        setActiveDropdown(null);
      } catch (e) { console.error(e); }
  };

  const handleTogglePdf = async (item: NumberData) => {
      try {
        await updateDoc(doc(db, "Numbers", item.number), { "PDF-Down": !item.pdfDown });
        setActiveDropdown(null);
      } catch (e) { console.error(e); }
  };

  const handleClearScreen = async (item: NumberData) => {
      try {
        await updateDoc(doc(db, "Numbers", item.number), { Screened: 0 });
        setActiveDropdown(null);
      } catch (e) { console.error(e); }
  };

  const handleClearAllScreened = async () => {
    showConfirm("Clear all screened counts for all users?", async () => {
      try {
        const numbersSnap = await getDocs(collection(db, "Numbers"));
        const updates = numbersSnap.docs.map(doc => updateDoc(doc.ref, { Screened: 0 }));
        await Promise.all(updates);
      } catch (e) { console.error(e); }
    });
  };

  // --- BLOCKED ACTIONS ---
  const handleUnblock = async (item: BlockedData) => {
      showConfirm(`Unblock ${item.number}?`, async () => {
        try {
          await setDoc(doc(db, "Numbers", item.number), {
              "Name": item.name || 'Unknown', "PDF-Down": true, "Quiz-Enabled": true, "Quizi-Times": 0, "Devices": {"Devices Allowed": 1}
          });
          await deleteDoc(doc(db, "Blocked", item.number));
          setActiveDropdown(null);
        } catch (e) { console.error(e); }
      });
  };

  const handleDeleteBlocked = async (id: string) => {
      showConfirm("Delete record?", async () => {
        await deleteDoc(doc(db, "Blocked", id));
        setActiveDropdown(null);
      });
  };

  // --- SNITCH ACTIONS ---
  const handleBlockSnitch = async (item: SnitchData) => {
      showConfirm(`Block Snitch ${item.snitchNumber}?`, async () => {
        const now = new Date();
        try {
          let name = item.snitchName;
          if (!name || name === 'Unknown') {
               try {
                   const d = await getDoc(doc(db, "Numbers", item.snitchNumber));
                   if(d.exists()) name = d.data().Name;
               } catch {}
          }
          await setDoc(doc(db, "Blocked", item.snitchNumber), {
              "Blocked Date": now.toLocaleDateString("en-GB"),
              "Blocked Time": now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }),
              "Reason": `Snitched on ${item.loginNumber}`,
              "Name": name || 'Unknown'
          });
          try { await deleteDoc(doc(db, "Numbers", item.snitchNumber)); } catch {}
          setActiveDropdown(null);
        } catch (e) { console.error(e); }
      });
  };

  const handleDeleteSnitch = async (id: string) => {
      showConfirm("Delete record?", async () => {
        await deleteDoc(doc(db, "Snitches", id));
        setActiveDropdown(null);
      });
  };

  // --- BROKER ACTIONS ---
  const handleBlockBroker = async (item: BrokerData) => {
    showConfirm(`Block Broker ${item.number}?`, async () => {
      const now = new Date();
      try {
          let name = "Unknown"; // Brokers table doesn't have name directly, need to fetch if exists in Numbers
          try {
              const d = await getDoc(doc(db, "Numbers", item.number));
              if (d.exists()) name = d.data().Name || "Unknown";
          } catch (e) { console.warn("Failed to get name for broker from Numbers", e); }

          await setDoc(doc(db, "Blocked", item.number), {
              "Blocked Date": now.toLocaleDateString("en-GB"),
              "Blocked Time": now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }),
              "Reason": `Blocked as Broker`,
              "Name": name
          });
          // Also delete from Brokers collection
          await deleteDoc(doc(db, "Brokers", item.id)); // Assuming item.id is the document ID in Brokers
          try { await deleteDoc(doc(db, "Numbers", item.number)); } catch {} // Optional: remove from Numbers too

          setActiveDropdown(null);
      } catch (e) { console.error(e); }
    });
  };


  // Filtering
   const filteredNumbers = numbers.filter(n => n.number?.includes(searchTerm) || n.name?.toLowerCase()?.includes(searchTerm.toLowerCase()));
   const filteredBlocked = blocked.filter(b => b.number?.includes(searchTerm) || b.name?.toLowerCase()?.includes(searchTerm.toLowerCase()));
   const filteredSnitches = snitches.filter(s => s.loginNumber?.includes(searchTerm) || s.snitchNumber?.includes(searchTerm));
   const filteredBrokers = brokers.filter(b => b.number?.includes(searchTerm));

  // --- FILES LOGIC ---
  const loadFiles = async (path: string) => {
    try {
      const r = ref(storage, path);
      const res = await listAll(r);
      const fs = res.prefixes.map(p => ({ name: p.name, type: 'folder' as const, fullPath: p.fullPath }));
      const is = await Promise.all(res.items.map(async i => ({ name: i.name, type: 'file' as const, fullPath: i.fullPath, url: await getDownloadURL(i) })));
      // Folders first
      setFiles([...fs, ...is]);
      setSelectedFiles([]); // Clear selection on path change
    } catch {}
  };
  
  useEffect(() => { if (activeSection === 'files') loadFiles(currentPath); }, [activeSection, currentPath]);
  
  const handleFolderClick = (folderPath: string) => {
      setPathHistory(prev => [...prev, currentPath]);
      setCurrentPath(folderPath);
  };

  const handleNavigateBack = () => {
      if (pathHistory.length > 0) {
          const newHistory = [...pathHistory];
          const prevPath = newHistory.pop();
          setPathHistory(newHistory);
          setCurrentPath(prevPath || '');
      }
  };

  const handleCreateFolder = async (name: string) => { try { await uploadBytes(ref(storage, `${currentPath ? currentPath + '/' : ''}${name}/.placeholder`), new Blob([''])); setShowFolderModal(false); setFolderName(''); loadFiles(currentPath); } catch {} };

  const handleUploadFile = async (file: File) => { try { const path = `${currentPath ? currentPath + '/' : ''}${file.name}`; await uploadBytes(ref(storage, path), file); loadFiles(currentPath); } catch (e) { console.error(e); } };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      await handleUploadFile(file);
      e.target.value = '';
    }
  };

  // File Selection
  const toggleFileSelection = (path: string) => {
      setSelectedFiles(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

  const handleSelectAll = () => {
      if (selectedFiles.length === files.length) setSelectedFiles([]);
      else setSelectedFiles(files.map(f => f.fullPath));
  };

  const deleteFolderRecursive = async (path: string) => {
      try {
          const list = await listAll(ref(storage, path));
          await Promise.all(list.items.map(i => deleteObject(i)));
          await Promise.all(list.prefixes.map(p => deleteFolderRecursive(p.fullPath)));
      } catch (e) { console.error("Recursive delete failed", e); }
  };

  const handleBulkFileDelete = async () => {
      showConfirm(`Delete ${selectedFiles.length} items? This cannot be undone.`, async () => {
        for (const path of selectedFiles) {
            const file = files.find(f => f.fullPath === path);
            if (file?.type === 'folder') {
               await deleteFolderRecursive(path);
            } else {
               try { await deleteObject(ref(storage, path)); } catch {}
            }
        }
        setSelectedFiles([]);
        loadFiles(currentPath);
      });
  };

  // --- SHOTS LOGIC ---
  const loadShots = async () => { try { const r = await listAll(ref(storage, 'Captured-Shots')); setShots(await Promise.all(r.items.map(async i => ({ fullPath: i.fullPath, url: await getDownloadURL(i), name: i.name })))); } catch {} };
   const loadShotsWithOwners = async () => {
      try {
         const r = await listAll(ref(storage, 'Captured-Shots'));
         const raw = await Promise.all(r.items.map(async i => ({ fullPath: i.fullPath, url: await getDownloadURL(i), name: i.name })));
         // Parse owner number from filename like Shot_<number>_<ts>.png
         const enhanced = await Promise.all(raw.map(async (s) => {
            const parts = s.name.split('_');
            const ownerNum = parts.length >= 2 ? parts[1] : 'Unknown';
            let ownerName = 'Unknown';
            try {
               const d = await getDoc(doc(db, 'Numbers', ownerNum));
               if (d.exists()) ownerName = d.data().Name || 'Unknown';
            } catch {}
            return { ...s, ownerNumber: ownerNum, ownerName };
         }));
         setShots(enhanced as any[]);
      } catch (e) { console.warn('Load shots failed', e); }
   };
   useEffect(() => { if (activeSection === 'shots') loadShotsWithOwners(); }, [activeSection]);

   // Keyboard navigation for shots
   useEffect(() => {
     if (activeSection !== 'shots') return;
     const handleKeyDown = (e: KeyboardEvent) => {
       if (e.key === 'ArrowLeft') {
         setCurrentShotIndex(p => Math.max(0, p - 1));
       } else if (e.key === 'ArrowRight') {
         setCurrentShotIndex(p => Math.min(shots.length - 1, p + 1));
       }
     };
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
   }, [activeSection, shots.length]);
  const handleDeleteShot = async () => { showConfirm("Delete?", async () => { try { await deleteObject(ref(storage, shots[currentShotIndex].fullPath)); const n = [...shots]; n.splice(currentShotIndex, 1); setShots(n); if (currentShotIndex >= n.length) setCurrentShotIndex(Math.max(0, n.length - 1)); } catch {} }); };

  const tableTabs = ['numbers', 'blocked', 'snitches', 'brokers'];

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* SIDEBAR */}
      <aside className={`sidebar z-20 shadow-xl ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header gap-3">
          <div className="rounded border border-indigo-900/50 flex items-center justify-center text-indigo-500 bg-indigo-500/10" style={{ width: '32px', height: '32px' }}><ShieldAlert size={18} /></div>
          <div><h1 className="font-bold text-white text-sm">The State</h1></div>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <button onClick={() => setActiveSection('tables')} className={`nav-btn admin-nav-btn ${activeSection === 'tables' ? 'active' : ''}`}><LayoutGrid size={18} /> Tables</button>
          <button onClick={() => setActiveSection('files')} className={`nav-btn admin-nav-btn ${activeSection === 'files' ? 'active' : ''}`}><FolderOpen size={18} /> Files</button>
          <button onClick={() => setActiveSection('shots')} className={`nav-btn admin-nav-btn ${activeSection === 'shots' ? 'active' : ''}`}><Camera size={18} /> Shots</button>
        </nav>
        <div className="p-4 border-t border-white/10 flex flex-col gap-2">
           <button onClick={onBack} className="nav-btn"><ArrowLeft size={16} /> Back to User View</button>
           <button onClick={handleLogout} className="nav-btn hover:text-error hover:bg-red-500/10"><LogOut size={16} /> Sign Out</button>
        </div>
      </aside>

      {/* Mobile backdrop to close sidebar when clicking outside */}
      {sidebarOpen && <div className="mobile-backdrop" onClick={() => setSidebarOpen(false)} />}

      {/* MAIN */}
      <main className="main-content">
        <header className="content-header">
           <div className="flex items-center gap-3">
                   <button onClick={() => setSidebarOpen(s => !s)} className="mobile-toggle" aria-label="Toggle menu">☰</button>
              <div className="rounded-full bg-surface border border-white/10 flex items-center justify-center text-muted font-bold text-xs" style={{ width: '36px', height: '36px' }}>{adminName.charAt(0).toUpperCase()}</div>
              <div><h2 className="text-sm font-semibold text-white">Welcome, {adminName.split(' ')[0]}</h2><p className="text-xs text-success">Online</p></div>
           </div>
           <button onClick={() => setShowSettingsModal(true)} className="btn btn-secondary btn-sm gap-2 text-xs h-9 px-3"><Settings size={14} /> Settings</button>
        </header>

        <div className="content-body">
          {activeSection === 'tables' && (
            <div className="h-full flex flex-col gap-4">
              
              {/* TABLE TOOLBAR */}
              <div className={`table-toolbar justify-between gap-3 ${isMobile ? 'flex-col' : 'flex-row'}`}>
                {isMobile ? (
                  <div className="relative w-full" ref={tableNavRef}>
                    <button onClick={() => setShowTableNavMenu(!showTableNavMenu)} className="btn btn-secondary btn-toolbar capitalize flex items-center w-full justify-center">
                      {activeTableTab} <ChevronDown size={16} className={`ml-2 transition-transform ${showTableNavMenu ? 'rotate-180' : ''}`} />
                    </button>
                    {showTableNavMenu && (
                      <div className="options-menu" style={{ top: '100%', right: 'auto', left: 0, width: '100%', marginTop: '8px', transformOrigin: 'top center' }}>
                        {tableTabs.map((tab) => (
                          <button
                            key={tab}
                            onClick={() => { setActiveTableTab(tab as any); setShowTableNavMenu(false); }}
                            className={`options-item capitalize ${activeTableTab === tab ? 'bg-white/10 text-white' : ''}`}
                          >
                            {activeTableTab === tab && <Check size={14} />}
                            <span className="flex-1">{tab}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="table-nav">
                    {tableTabs.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTableTab(tab as any)}
                        className={`table-nav-btn capitalize ${activeTableTab === tab ? 'active' : ''}`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                )}
                 <div className={`flex gap-3 items-center ${isMobile ? 'flex-col w-full' : 'flex-row'}`}>
                   <div className={`search-container ${isMobile ? 'w-full' : ''}`}>
                     <Search className="search-icon" size={16} />
                     <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
                   </div>
                   {activeTableTab === 'numbers' && <button onClick={() => setShowAddModal(true)} className={`btn btn-primary btn-toolbar ${isMobile ? 'w-full' : ''}`}><Plus size={16} /> <span>{isMobile ? 'Add New User': 'Add'}</span></button>}
                 </div>
              </div>

              <div className="flex-1 bg-surface border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
                <div className="absolute inset-0 overflow-auto custom-scrollbar">
                  <table className="admin-table">
                    <thead>
                       <tr>{activeTableTab === 'numbers' ? (<><th>Number</th><th>Name</th><th>Quiz Times</th><th>Screened</th><th>Quiz</th><th>PDF</th><th className="text-right">Actions</th></>) : activeTableTab === 'blocked' ? (<><th>Number</th><th>Name</th><th>Reason</th><th>Date</th><th>Status</th><th className="text-right">Actions</th></>) : activeTableTab === 'snitches' ? (<><th>Login #</th><th>Snitch #</th><th>Name</th><th>Time</th><th>Status</th><th className="text-right">Actions</th></>) : (<><th>Number</th><th>Count</th><th>Date</th><th>Time</th><th>Status</th><th className="text-right">Actions</th></>)}</tr>
                    </thead>
                    <tbody>
                        {(activeTableTab === 'numbers' ? filteredNumbers : activeTableTab === 'blocked' ? filteredBlocked : activeTableTab === 'snitches' ? filteredSnitches : filteredBrokers).map((item) => (
                        <tr key={item.id}>
                            {activeTableTab === 'numbers' && (
                            <>
                              <td className="font-mono text-muted">{(item as NumberData).number}</td>
                              <td className="font-medium text-white">{(item as NumberData).name}</td>
                              <td><span className="px-2 py-1 rounded text-xs font-bold bg-white/5 text-white">{(item as NumberData).quizTimes}</span></td>
                              <td><span className="px-2 py-1 rounded text-xs font-bold bg-white/5 text-white">{(item as NumberData).screenedCount}</span></td>
                              <td><span className={`px-2 py-1 rounded text-xs font-medium ${(item as NumberData).quizEnabled ? 'text-success bg-success/10' : 'text-muted bg-white/5'}`}>{(item as NumberData).quizEnabled ? 'ON' : 'OFF'}</span></td>
                              <td><span className={`px-2 py-1 rounded text-xs font-medium ${(item as NumberData).pdfDown ? 'text-success bg-success/10' : 'text-error bg-error/10'}`}>{(item as NumberData).pdfDown ? 'Allowed' : 'Blocked'}</span></td>
                              <td className="text-right relative">
                                 <div className="flex justify-end">
                                    <button onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === item.id ? null : item.id); }} className="btn-icon w-8 h-8"><MoreVertical size={16} /></button>
                                 </div>
                                 {activeDropdown === item.id && (
                                   <div className="options-menu">
                                     {!blockedNumbers.has((item as NumberData).number) && <button onClick={() => handleBlockNumber(item as NumberData)} className="options-item warning"><Ban size={14} /> Block Number</button>}
                                     <button onClick={() => handleToggleQuiz(item as NumberData)} className="options-item"><BookOpen size={14} /> Quiz: {(item as NumberData).quizEnabled ? 'ON' : 'OFF'}</button>
                                     <button onClick={() => handleTogglePdf(item as NumberData)} className="options-item"><Download size={14} /> PDF: {(item as NumberData).pdfDown ? 'Allowed' : 'Blocked'}</button>
                                     <button onClick={() => handleClearScreen(item as NumberData)} className="options-item"><EyeOff size={14} /> Clear Screen</button>
                                     <button onClick={() => { setActiveInfo({ type: 'number', data: item as NumberData }); setShowInfoModal(true); setActiveDropdown(null); }} className="options-item"><BookOpen size={14} /> Info</button>
                                     <div className="options-divider" />
                                     <button onClick={() => handleDeleteNumber(item.id)} className="options-item danger"><Trash2 size={14} /> Delete</button>
                                   </div>
                                 )}
                              </td>
                            </>
                          )}
                          {activeTableTab === 'blocked' && (
                             <>
                                <td className="font-mono text-muted">{(item as BlockedData).number}</td>
                                <td className="font-medium text-white">{(item as BlockedData).name}</td>
                                <td className="text-sm text-error">{(item as BlockedData).reason}</td>
                                <td className="text-xs text-muted">{(item as BlockedData).date} {(item as BlockedData).time}</td>
                                <td><span className={`px-2 py-1 rounded text-xs font-medium text-error bg-error/10`}>Blocked</span></td>
                                <td className="text-right relative">
                                   <div className="flex justify-end">
                                      <button onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === item.id ? null : item.id); }} className="btn-icon w-8 h-8"><MoreVertical size={16} /></button>
                                   </div>
                                   {activeDropdown === item.id && (
                                      <div className="options-menu" style={{ width: '160px' }}>
                                         <button onClick={() => handleUnblock(item as BlockedData)} className="options-item text-success"><Unlock size={14} className="text-success" /> Unblock</button>
                                         <div className="options-divider" />
                                         <button onClick={() => handleDeleteBlocked(item.id)} className="options-item danger"><Trash2 size={14} /> Delete</button>
                                      </div>
                                   )}
                                </td>
                             </>
                          )}
                          {activeTableTab === 'snitches' && (
                             <>
                                <td className="font-mono text-muted">{(item as SnitchData).loginNumber}</td>
                                <td className="font-mono text-error">{(item as SnitchData).snitchNumber}</td>
                                <td className="text-white">{(item as SnitchData).snitchName}</td>
                                <td className="text-xs text-muted">{(item as SnitchData).date} {(item as SnitchData).time}</td>
                                <td>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${blockedNumbers.has((item as SnitchData).snitchNumber) ? 'text-error bg-error/10' : 'text-success bg-success/10'}`}>
                                        {blockedNumbers.has((item as SnitchData).snitchNumber) ? 'Blocked' : 'Normal'}
                                    </span>
                                </td>
                                <td className="text-right relative">
                                   <div className="flex justify-end">
                                      <button onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === item.id ? null : item.id); }} className="btn-icon w-8 h-8"><MoreVertical size={16} /></button>
                                   </div>
                                   {activeDropdown === item.id && (
                                      <div className="options-menu" style={{ width: '160px' }}>
                                         {!blockedNumbers.has((item as SnitchData).snitchNumber) && <button onClick={() => handleBlockSnitch(item as SnitchData)} className="options-item warning"><Ban size={14} /> Block Snitch</button>}
                                         <div className="options-divider" />
                                         <button onClick={() => handleDeleteSnitch(item.id)} className="options-item danger"><Trash2 size={14} /> Delete</button>
                                      </div>
                                   )}
                                </td>
                             </>
                          )}
                          {activeTableTab === 'brokers' && (
                             <>
                                <td className="font-mono text-muted">{(item as BrokerData).number}</td>
                                <td className="text-sm text-error">{(item as BrokerData).count}</td>
                                <td className="text-sm text-white">{(item as BrokerData).date}</td>
                                <td className="text-xs text-muted">{(item as BrokerData).time}</td>
                                <td>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${blockedNumbers.has((item as BrokerData).number) ? 'text-error bg-error/10' : 'text-success bg-success/10'}`}>
                                        {blockedNumbers.has((item as BrokerData).number) ? 'Blocked' : 'Normal'}
                                    </span>
                                </td>
                                <td className="text-right relative">
                                   <div className="flex justify-end">
                                      <button onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === item.id ? null : item.id); }} className="btn-icon w-8 h-8"><MoreVertical size={16} /></button>
                                   </div>
                                   {activeDropdown === item.id && (
                                      <div className="options-menu" style={{ width: '160px' }}>
                                       <button onClick={() => { setActiveInfo({ type: 'broker', data: item as BrokerData }); setShowInfoModal(true); setActiveDropdown(null); }} className="options-item"><BookOpen size={14} /> Info</button>
                                         {!blockedNumbers.has((item as BrokerData).number) && <button onClick={() => handleBlockBroker(item as BrokerData)} className="options-item warning"><Ban size={14} /> Block Broker</button>}
                                         <div className="options-divider" />
                                         <button onClick={() => showConfirm('Delete record?', async () => { await deleteDoc(doc(db, 'Brokers', (item as BrokerData).id)); setActiveDropdown(null); })} className="options-item danger"><Trash2 size={14} /> Delete</button>
                                      </div>
                                   )}
                                </td>
                             </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          
          {activeSection === 'files' && (
             <div className="h-full flex flex-col gap-4">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <button onClick={handleNavigateBack} disabled={pathHistory.length === 0} className={`btn-icon border border-white/10 bg-surface ${pathHistory.length === 0 ? 'opacity-50' : ''}`}><ArrowLeft size={16} /></button>
                      <div className="flex items-center bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-muted font-mono"><span onClick={() => { setCurrentPath(''); setPathHistory([]); }} className="cursor-pointer hover:text-white">root/</span>{currentPath}</div>
                   </div>
                   <div className="flex items-center gap-2">
                     {selectedFiles.length > 0 && (
                        <button onClick={handleBulkFileDelete} className="btn btn-danger btn-toolbar animate-fade-in"><Trash2 size={16} /> Delete ({selectedFiles.length})</button>
                     )}
                     <div className="view-toggle-group mr-2">
                        <button onClick={() => setFileViewMode('grid')} className={`view-toggle-btn ${fileViewMode === 'grid' ? 'active' : ''}`}><LayoutGrid size={16} /></button>
                        <button onClick={() => setFileViewMode('table')} className={`view-toggle-btn ${fileViewMode === 'table' ? 'active' : ''}`}><List size={16} /></button>
                     </div>
                     <button onClick={() => setShowFolderModal(true)} className="btn btn-secondary btn-toolbar"><FolderOpen size={16} /> New Folder</button>
                     <button onClick={() => uploadInputRef.current?.click()} className="btn btn-primary btn-toolbar"><Upload size={16} /> Upload</button>
                   </div>
                </div>
                
                <div className="flex-1 bg-surface border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
                  <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
                    
                    {fileViewMode === 'grid' ? (
                       <div className="file-grid-layout">
                           {files.map(file => {
                              const isSelected = selectedFiles.includes(file.fullPath);
                              return (
                                <div key={file.fullPath} onClick={() => file.type === 'folder' && handleFolderClick(file.fullPath)} className={`file-card ${isSelected ? 'selected' : ''}`}>
                                   <div onClick={(e) => { e.stopPropagation(); toggleFileSelection(file.fullPath); }} className="absolute top-2 left-2 p-1 rounded hover:bg-black/50 text-white/50 hover:text-white z-10 cursor-pointer">
                                      {isSelected ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                                   </div>
                                   <div className="flex-1 flex items-center justify-center">
                                      {file.type === 'folder' ? <FolderOpen size={48} className="text-amber-500 drop-shadow-md" /> : <FileText size={48} className="text-primary drop-shadow-md" />}
                                   </div>
                                   <span className="text-xs text-muted truncate w-full text-center px-2 pb-2">{file.name}</span>
                                </div>
                              );
                           })}
                           {files.length === 0 && <div className="col-span-full text-center text-muted py-10 opacity-50">Empty Directory</div>}
                       </div>
                    ) : (
                       <div className="flex flex-col gap-1">
                          {/* File List Header */}
                          <div className="file-table-layout px-4 py-3 text-xs font-bold text-muted uppercase border-b border-white/10 items-center bg-white/5 rounded-t-lg">
                             <div onClick={handleSelectAll} className="cursor-pointer hover:text-white flex items-center">
                                {selectedFiles.length === files.length && files.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                             </div>
                             <div className="flex justify-center"><FolderOpen size={14} className="opacity-0" /></div> {/* Spacer for alignment */}
                             <span>Name</span>
                             <span className="text-right">Action</span>
                          </div>
                          
                          {/* File Rows */}
                          <div className="flex flex-col">
                            {files.map(file => {
                               const isSelected = selectedFiles.includes(file.fullPath);
                               return (
                                 <div key={file.fullPath} onClick={() => file.type === 'folder' && handleFolderClick(file.fullPath)} className={`file-table-layout px-4 py-3 items-center rounded-lg cursor-pointer border-b border-white/5 last:border-0 transition-colors ${isSelected ? 'bg-primary/10 border-primary/20' : 'hover:bg-white/5'}`}>
                                    <div onClick={(e) => { e.stopPropagation(); toggleFileSelection(file.fullPath); }} className="cursor-pointer text-muted hover:text-white flex items-center">
                                       {isSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                                    </div>
                                    <div className="flex justify-center">
                                       {file.type === 'folder' ? <FolderOpen size={18} className="text-amber-500" /> : <FileText size={18} className="text-primary" />}
                                    </div>
                                    <span className="text-sm text-white truncate pr-4">{file.name}</span>
                                    <div className="flex justify-end">
                                       {file.type === 'file' && <a href={file.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-2 text-muted hover:text-white"><Download size={14} /></a>}
                                    </div>
                                 </div>
                               );
                            })}
                          </div>
                          {files.length === 0 && <div className="text-center text-muted py-10 opacity-50">Empty Directory</div>}
                       </div>
                    )}

                  </div>
                </div>
             </div>
          )}
          
          {activeSection === 'shots' && (
             <div className="h-full flex flex-col gap-4">
                <div className="flex-1 bg-surface border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                    {shots.length > 0 ? (
                       <div className="w-full max-w-4xl flex flex-col gap-4" style={{ height: '100%' }}>
                          <div className={`relative bg-black rounded-xl border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center ${isMobile ? 'w-full h-full' : 'aspect-video'}`} style={isMobile ? { width: '100%', height: '100vh' } : { width: '100%', height: '100%' }}>
                             <img src={shots[currentShotIndex]?.url} alt="Shot" className="max-w-full max-h-full" style={isMobile ? { width: '100%' } : { height: '100%' }} />
                             <button onClick={() => setCurrentShotIndex(p => Math.max(0, p - 1))} disabled={currentShotIndex === 0} className="absolute left-4 top-1/2 -translate-y-1/2 btn-icon bg-black/50 hover:bg-black text-white rounded-full disabled:opacity-50"><ArrowLeft /></button>
                             <button onClick={() => setCurrentShotIndex(p => Math.min(shots.length - 1, p + 1))} disabled={currentShotIndex === shots.length - 1} className="absolute right-4 top-1/2 -translate-y-1/2 btn-icon bg-black/50 hover:bg-black text-white rounded-full disabled:opacity-50"><ArrowRight /></button>
                          </div>
                       </div>
                    ) : (
                       <div className="text-muted flex flex-col items-center gap-4">
                          <Camera size={48} className="opacity-20" />
                          <p>No screenshots captured</p>
                       </div>
                    )}
                  </div>
                </div>
                {shots.length > 0 && (
                   <div className={`flex justify-between items-center bg-surface rounded-xl border border-white/10 ${isMobile ? 'p-2 flex-col gap-2' : 'p-4'}`}>
                      <div>
                         <div className={`font-mono text-muted ${isMobile ? 'text-xs' : 'text-sm'}`}>{shots[currentShotIndex]?.name}</div>
                         <div className="text-xs text-muted">Owner: <span className="text-white">{shots[currentShotIndex]?.ownerName || 'Unknown'}</span> <span className="font-mono text-muted">({shots[currentShotIndex]?.ownerNumber || 'Unknown'})</span></div>
                      </div>
                      <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-4'}`}>
                         <span className={`text-muted ${isMobile ? 'text-xs' : 'text-sm'}`}>{currentShotIndex + 1} / {shots.length}</span>
                         <button onClick={handleDeleteShot} className={`btn btn-danger ${isMobile ? 'h-6 text-xs px-2' : 'h-8 text-xs px-3'}`}>Delete</button>
                      </div>
                   </div>
                )}
             </div>
          )}
        </div>
      </main>

      {/* NUMBER INFO MODAL */}
      {showInfoModal && activeInfo?.type === 'number' && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content modal-lg p-0 relative flex flex-col">
            {/* 1. Header */}
            <div className="p-6 md:p-8 flex-shrink-0 border-b border-white/10">
              <button onClick={() => { setShowInfoModal(false); setActiveInfo(null); }} className="btn-icon absolute top-4 right-4 z-10"><X size={20} /></button>
              <div className="flex flex-col items-center w-full">
                <div className="w-14 h-14 rounded-2xl bg-surface border border-white/10 flex items-center justify-center mb-4 text-primary shadow-glow">
                  <BookOpen size={28} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Number Info</h2>
                <p className="text-muted text-sm text-center">Login attempts for: <span className="font-mono text-white">{activeInfo.data.number}</span></p>
              </div>
            </div>

            {/* 2. Scrollable Body */}
            <div className="flex-grow overflow-y-auto custom-scrollbar min-h-0" style={{ overflow: 'scroll' }}>
              <div className="p-6 md:p-8">
                {loginAttemptsData.length > 0 ? (
                  <div className="overflow-x-auto max-h-[200px] overflow-y-auto custom-scrollbar">
                    <table className="admin-table w-full">
                      <thead>
                        <tr>
                          <th>Device ID</th>
                          <th>Code</th>
                          <th>Date</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loginAttemptsData.map((attempt) => (
                          <tr key={attempt.attemptId}>
                            <td className="font-mono text-muted truncate max-w-xs">{attempt.deviceId}</td>
                            <td className="font-mono text-white select-text">{attempt.Code}</td>
                            <td className="text-muted">{attempt.Date}</td>
                            <td className="text-muted">{attempt.Time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center text-muted text-sm py-10">
                    <p>No recorded login attempts.</p>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Footer */}
            <div className="p-6 md:p-8 flex-shrink-0 border-t border-white/10">
              <button onClick={() => { setShowInfoModal(false); setActiveInfo(null); }} className="btn btn-secondary w-full">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BROKER INFO MODAL */}
      {showInfoModal && activeInfo?.type === 'broker' && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content modal-lg p-0 relative flex flex-col">
            {/* 1. Header */}
            <div className="p-6 md:p-8 flex-shrink-0 border-b border-white/10">
              <button onClick={() => { setShowInfoModal(false); setActiveInfo(null); }} className="btn-icon absolute top-4 right-4 z-10"><X size={20} /></button>
              <div className="flex flex-col items-center w-full">
                <div className="w-14 h-14 rounded-2xl bg-surface border border-white/10 flex items-center justify-center mb-4 text-primary shadow-glow">
                  <BookOpen size={28} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Broker Info</h2>
                <p className="text-muted text-sm text-center">Attempts for: <span className="font-mono text-white">{activeInfo.data.number}</span> <span className="text-xs bg-white/10 text-white font-bold px-2 py-1 rounded-md ml-2">{activeInfo.data.count}</span></p>
              </div>
            </div>
            
            {/* 2. Scrollable Body */}
            <div className="flex-grow overflow-y-auto custom-scrollbar min-h-0">
              <div className="p-6 md:p-8">
                {activeInfo.data.attempts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="admin-table w-full">
                      <thead>
                        <tr>
                          <th>Password</th>
                          <th>Date</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...activeInfo.data.attempts].reverse().map((attempt, index) => (
                          <tr key={index}>
                            <td className="font-mono text-white select-text">{attempt.Password || 'N/A'}</td>
                            <td className="text-muted">{attempt.Date}</td>
                            <td className="text-muted">{attempt.Time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center text-muted text-sm py-10">
                    <p>No recorded attempts.</p>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Footer */}
            <div className="p-6 md:p-8 flex-shrink-0 border-t border-white/10">
              <button onClick={() => { setShowInfoModal(false); setActiveInfo(null); }} className="btn btn-secondary w-full">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {showConfirmModal && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 130000 }}>
          <div className="modal-content modal-sm p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Confirm Action</h3>
              <button onClick={() => setShowConfirmModal(false)} className="btn-icon"><X size={20} /></button>
            </div>
            <p className="text-muted mb-8">{confirmMessage}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={() => { onConfirmAction(); setShowConfirmModal(false); }} className="btn btn-danger">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* FOLDER MODAL */}
      {showFolderModal && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content modal-md p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Create New Folder</h3>
              <button onClick={() => setShowFolderModal(false)} className="btn-icon"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input type="text" value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="Folder name" className="login-input w-full" />
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowFolderModal(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={() => { if (folderName) { handleCreateFolder(folderName); } }} className="btn btn-primary">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN UPLOAD INPUT */}
      <input ref={uploadInputRef} type="file" accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} />

      {/* MODALS */}
      {showAddModal && (
        <div className="modal-overlay">
           <div className="modal-content modal-md p-8">
              <div className="flex justify-between items-center mb-8">
                 <div>
                    <h3 className="text-2xl font-bold text-white">Add New User</h3>
                    <p className="text-muted text-sm mt-1">Create a new user account</p>
                 </div>
                 <button onClick={() => setShowAddModal(false)} className="btn-icon"><X size={20} /></button>
              </div>

              <div className="space-y-6">
                 <div>
                    <label className="text-xs text-muted mb-2 block uppercase font-bold tracking-wider">Phone Number</label>
                    <input type="text" value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="Enter 11 digits" className="login-input w-full" />
                 </div>
                 
                 <div>
                    <label className="text-xs text-muted mb-3 block uppercase font-bold tracking-wider">PDF Permission</label>
                    <div className="relative">
                       <select value={newPdfDown ? "true" : "false"} onChange={e => setNewPdfDown(e.target.value === "true")} className="login-input appearance-none bg-surface cursor-pointer">
                          <option value="false">Blocked (Default)</option>
                          <option value="true">Allowed</option>
                       </select>
                       <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-white/10">
                 <button onClick={() => setShowAddModal(false)} className="btn btn-ghost">Cancel</button>
                 <button onClick={handleCreateUser} className="btn btn-primary">Create User</button>
              </div>
           </div>
        </div>
      )}
      
      {showSettingsModal && (
        <div className="modal-overlay">
           <div className="modal-content modal-md p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className={`font-bold text-white ${isMobile ? 'text-lg' : 'text-xl'}`}>System Settings</h3>
                <button onClick={() => setShowSettingsModal(false)} className="btn-icon"><X size={20} /></button>
              </div>
              <div className="space-y-4 mb-8">
                 <div className="settings-row">
                    <span className="settings-label">Global Quiz Access</span>
                    <button onClick={() => setGlobalQuiz(!globalQuiz)} className={`toggle-switch ${globalQuiz ? 'active' : ''}`}>
                       <div className="toggle-thumb" />
                    </button>
                 </div>
                 <div className="settings-row">
                    <span className="settings-label">Global PDF Downloads</span>
                    <button onClick={() => setGlobalPdf(!globalPdf)} className={`toggle-switch ${globalPdf ? 'active' : ''}`}>
                       <div className="toggle-thumb" />
                    </button>
                 </div>
              </div>
              <div className={`flex items-center ${isMobile ? 'flex-col gap-4' : 'justify-between'}`}>
                <button onClick={handleClearAllScreened} className={`btn btn-danger ${isMobile ? 'w-full' : ''}`}>Clear All Screened</button>
                <button onClick={async () => {
                  try { await setDoc(doc(db, 'Dashboard', 'Settings'), { 'PDF-Down': globalPdf, 'Quiz-Enabled': globalQuiz }); }
                  catch (e) { console.warn('Failed to save settings', e); }
                  setShowSettingsModal(false);
                }} className={`btn btn-primary ${isMobile ? 'w-full' : ''}`}>Save Changes</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};