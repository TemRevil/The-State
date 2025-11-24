
import React, { useState, useEffect } from 'react';
import { db, storage, auth } from '../firebaseConfig';
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { LayoutGrid, FolderOpen, Camera, Settings, LogOut, Search, ShieldAlert, MoreVertical, Trash2, Plus, ArrowLeft, ArrowRight, Upload, X, FileText, Ban, Unlock, Check, BookOpen, Download, List, CheckSquare, Square } from 'lucide-react';

interface AdminDashboardProps { onBack: () => void; }
interface NumberData { id: string; number: string; name: string; quizTimes: number; quizEnabled: boolean; pdfDown: boolean; deviceCount?: number; deviceLimit?: number; screenedCount: number; }
interface BlockedData { id: string; number: string; name: string; reason: string; date: string; time: string; }
interface SnitchData { id: string; loginNumber: string; snitchNumber: string; snitchName: string; date: string; time: string; }
interface FileData { name: string; type: 'file' | 'folder'; fullPath: string; url?: string; }

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState<'tables' | 'files' | 'shots'>('tables');
  const [activeTableTab, setActiveTableTab] = useState<'numbers' | 'blocked' | 'snitches'>('numbers');
  const [numbers, setNumbers] = useState<NumberData[]>([]);
  const [blocked, setBlocked] = useState<BlockedData[]>([]);
  const [snitches, setSnitches] = useState<SnitchData[]>([]);
  const [adminName, setAdminName] = useState('Admin');
  
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
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  
  // Add User Inputs
  const [newNumber, setNewNumber] = useState('');
  const [newPdfDown, setNewPdfDown] = useState(false); // Default Blocked
  
  const [searchTerm, setSearchTerm] = useState('');
  const [globalQuiz, setGlobalQuiz] = useState(true);
  const [globalPdf, setGlobalPdf] = useState(true);

  // Click Outside Handler for Dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.options-menu') && !target.closest('.btn-icon')) {
        setActiveDropdown(null);
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
        setBlocked(s.docs.map(d => ({ 
            id: d.id, 
            number: d.id, 
            name: d.data().Name || 'Unknown', 
            reason: d.data().Reason || 'Unknown', 
            date: d.data()["Blocked Date"] || '', 
            time: d.data()["Blocked Time"] || ''
        })));
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
            screenedCount: d.data()["Screened"]||0 
        })));
    });
    
    const u3 = onSnapshot(collection(db, "Snitches"), s => {
        setSnitches(s.docs.map(d => ({ 
            id: d.id, 
            loginNumber: d.data()["The Login Number"], 
            snitchNumber: d.data()["The Snitch"], 
            snitchName: d.data().Name, 
            date: d.data()["Snitched Date"], 
            time: d.data()["Snitched Time"] 
        })));
    });

    return () => { u1(); u2(); u3(); };
  }, []);

  const handleLogout = async () => { if (confirm("Logout?")) { await signOut(auth); window.location.reload(); } };
  
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

  const handleDeleteNumber = async (id: string) => { if (confirm("Delete?")) { try { await deleteDoc(doc(db, "Numbers", id.trim())); } catch {} finally { setActiveDropdown(null); } } };
  
  const handleBlockNumber = async (item: NumberData) => {
    if (!confirm(`Block ${item.name || item.number}?`)) return;
    const now = new Date();
    try {
      await setDoc(doc(db, "Blocked", item.number), {
         "Blocked Date": now.toLocaleDateString("en-GB"),
         "Blocked Time": now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }),
         "Reason": "Blocked by Admin",
         "Name": item.name
      });
      await deleteDoc(doc(db, "Numbers", item.number));
      setActiveDropdown(null);
    } catch (e) { console.error(e); }
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

  // --- BLOCKED ACTIONS ---
  const handleUnblock = async (item: BlockedData) => {
      if (!confirm(`Unblock ${item.number}?`)) return;
      try {
        await setDoc(doc(db, "Numbers", item.number), {
            "Name": item.name || 'Unknown', "PDF-Down": true, "Quiz-Enabled": true, "Quizi-Times": 0, "Devices": {"Devices Allowed": 1}
        });
        await deleteDoc(doc(db, "Blocked", item.number));
        setActiveDropdown(null);
      } catch (e) { console.error(e); }
  };

  const handleDeleteBlocked = async (id: string) => {
      if(confirm("Delete record?")) {
        await deleteDoc(doc(db, "Blocked", id));
        setActiveDropdown(null);
      }
  };

  // --- SNITCH ACTIONS ---
  const handleBlockSnitch = async (item: SnitchData) => {
      if (!confirm(`Block Snitch ${item.snitchNumber}?`)) return;
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
  };

  const handleDeleteSnitch = async (id: string) => {
      if(confirm("Delete record?")) {
        await deleteDoc(doc(db, "Snitches", id));
        setActiveDropdown(null);
      }
  };

  // Filtering
  const filteredNumbers = numbers.filter(n => n.number?.includes(searchTerm) || n.name?.toLowerCase()?.includes(searchTerm.toLowerCase()));
  const filteredBlocked = blocked.filter(b => b.number?.includes(searchTerm) || b.name?.toLowerCase()?.includes(searchTerm.toLowerCase()));
  const filteredSnitches = snitches.filter(s => s.loginNumber?.includes(searchTerm) || s.snitchNumber?.includes(searchTerm));

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

  const handleCreateFolder = async (name: string) => { try { await uploadBytes(ref(storage, `${currentPath ? currentPath + '/' : ''}${name}/.placeholder`), new Blob([''])); setShowFolderModal(false); loadFiles(currentPath); } catch {} };

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
      if (!confirm(`Delete ${selectedFiles.length} items? This cannot be undone.`)) return;
      
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
  };

  // --- SHOTS LOGIC ---
  const loadShots = async () => { try { const r = await listAll(ref(storage, 'Captured-Shots')); setShots(await Promise.all(r.items.map(async i => ({ fullPath: i.fullPath, url: await getDownloadURL(i), name: i.name })))); } catch {} };
  useEffect(() => { if (activeSection === 'shots') loadShots(); }, [activeSection]);
  const handleDeleteShot = async () => { if (confirm("Delete?")) try { await deleteObject(ref(storage, shots[currentShotIndex].fullPath)); const n = [...shots]; n.splice(currentShotIndex, 1); setShots(n); if (currentShotIndex >= n.length) setCurrentShotIndex(Math.max(0, n.length - 1)); } catch {} };

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* SIDEBAR */}
      <aside className="sidebar z-20 shadow-xl">
        <div className="sidebar-header gap-3">
          <div className="rounded border border-indigo-900/50 flex items-center justify-center text-indigo-500 bg-indigo-500/10" style={{ width: '32px', height: '32px' }}><ShieldAlert size={18} /></div>
          <div><h1 className="font-bold text-white text-sm">The State</h1><p className="text-muted uppercase text-[10px] tracking-wider">System Control</p></div>
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

      {/* MAIN */}
      <main className="main-content">
        <header className="content-header">
           <div className="flex items-center gap-3">
              <div className="rounded-full bg-surface border border-white/10 flex items-center justify-center text-muted font-bold text-xs" style={{ width: '36px', height: '36px' }}>{adminName.charAt(0).toUpperCase()}</div>
              <div><h2 className="text-sm font-semibold text-white">Welcome, {adminName}</h2><p className="text-xs text-success">Online</p></div>
           </div>
           <button onClick={() => setShowSettingsModal(true)} className="btn btn-secondary btn-sm gap-2 text-xs h-9 px-3"><Settings size={14} /> Settings</button>
        </header>

        <div className="content-body">
          {activeSection === 'tables' && (
            <div className="h-full flex flex-col gap-4">
              
              {/* TABLE TOOLBAR */}
              <div className="table-toolbar">
                 <div className="table-nav">
                   {['numbers', 'blocked', 'snitches'].map((tab) => (
                     <button 
                       key={tab} 
                       onClick={() => setActiveTableTab(tab as any)} 
                       className={`table-nav-btn capitalize ${activeTableTab === tab ? 'active' : ''}`}
                     >
                       {tab}
                     </button>
                   ))}
                 </div>
                 <div className="flex gap-3 items-center">
                   <div className="search-container">
                     <Search className="search-icon" size={16} />
                     <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
                   </div>
                   {activeTableTab === 'numbers' && <button onClick={() => setShowAddModal(true)} className="btn btn-primary btn-toolbar"><Plus size={16} /> Add</button>}
                 </div>
              </div>

              <div className="flex-1 bg-surface border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
                <div className="absolute inset-0 overflow-auto custom-scrollbar">
                  <table className="admin-table">
                    <thead>
                      <tr>{activeTableTab === 'numbers' ? (<><th>Number</th><th>Name</th><th>Screened</th><th>Quiz</th><th>PDF</th><th className="text-right">Actions</th></>) : activeTableTab === 'blocked' ? (<><th>Number</th><th>Name</th><th>Reason</th><th>Date</th><th className="text-right">Actions</th></>) : (<><th>Login #</th><th>Snitch #</th><th>Name</th><th>Time</th><th className="text-right">Actions</th></>)}</tr>
                    </thead>
                    <tbody>
                      {(activeTableTab === 'numbers' ? filteredNumbers : activeTableTab === 'blocked' ? filteredBlocked : filteredSnitches).map((item) => (
                        <tr key={item.id}>
                          {activeTableTab === 'numbers' && (
                            <>
                              <td className="font-mono text-muted">{(item as NumberData).number}</td>
                              <td className="font-medium text-white">{(item as NumberData).name}</td>
                              <td><span className={`px-2 py-1 rounded text-xs font-bold ${(item as NumberData).screenedCount > 0 ? 'bg-orange-500/20 text-orange-500 border border-orange-500/20' : 'text-muted'}`}>{(item as NumberData).screenedCount}</span></td>
                              <td><span className={`px-2 py-1 rounded text-xs font-medium ${(item as NumberData).quizEnabled ? 'text-success bg-success/10' : 'text-muted bg-white/5'}`}>{(item as NumberData).quizEnabled ? 'ON' : 'OFF'}</span></td>
                              <td><span className={`px-2 py-1 rounded text-xs font-medium ${(item as NumberData).pdfDown ? 'text-success bg-success/10' : 'text-error bg-error/10'}`}>{(item as NumberData).pdfDown ? 'Allowed' : 'Blocked'}</span></td>
                              <td className="text-right relative">
                                 <div className="flex justify-end">
                                    <button onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === item.id ? null : item.id); }} className="btn-icon w-8 h-8"><MoreVertical size={16} /></button>
                                 </div>
                                 {activeDropdown === item.id && (
                                   <div className="options-menu">
                                     <button onClick={() => handleBlockNumber(item as NumberData)} className="options-item warning"><Ban size={14} /> Block Number</button>
                                     <button onClick={() => handleToggleQuiz(item as NumberData)} className="options-item"><BookOpen size={14} /> Quiz: {(item as NumberData).quizEnabled ? 'ON' : 'OFF'}</button>
                                     <button onClick={() => handleTogglePdf(item as NumberData)} className="options-item"><Download size={14} /> PDF: {(item as NumberData).pdfDown ? 'Allowed' : 'Blocked'}</button>
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
                                <td className="text-right relative">
                                   <div className="flex justify-end">
                                      <button onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === item.id ? null : item.id); }} className="btn-icon w-8 h-8"><MoreVertical size={16} /></button>
                                   </div>
                                   {activeDropdown === item.id && (
                                      <div className="options-menu" style={{ width: '160px' }}>
                                         <button onClick={() => handleBlockSnitch(item as SnitchData)} className="options-item warning"><Ban size={14} /> Block Snitch</button>
                                         <div className="options-divider" />
                                         <button onClick={() => handleDeleteSnitch(item.id)} className="options-item danger"><Trash2 size={14} /> Delete</button>
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
                     <button onClick={() => setShowUploadModal(true)} className="btn btn-primary btn-toolbar"><Upload size={16} /> Upload</button>
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
             <div className="h-full flex flex-col items-center justify-center">
                {shots.length > 0 ? (
                   <div className="w-full max-w-4xl flex flex-col gap-4">
                      <div className="relative bg-black rounded-xl border border-white/10 overflow-hidden shadow-2xl aspect-video flex items-center justify-center">
                         <img src={shots[currentShotIndex]?.url} alt="Shot" className="max-w-full max-h-full" />
                         <button onClick={() => setCurrentShotIndex(p => Math.max(0, p - 1))} className="absolute left-4 top-1/2 -translate-y-1/2 btn-icon bg-black/50 hover:bg-black text-white rounded-full"><ArrowLeft /></button>
                         <button onClick={() => setCurrentShotIndex(p => Math.min(shots.length - 1, p + 1))} className="absolute right-4 top-1/2 -translate-y-1/2 btn-icon bg-black/50 hover:bg-black text-white rounded-full"><ArrowRight /></button>
                      </div>
                      <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-white/10">
                         <span className="text-sm font-mono text-muted">{shots[currentShotIndex]?.name}</span>
                         <div className="flex gap-4 items-center">
                            <span className="text-sm text-muted">{currentShotIndex + 1} / {shots.length}</span>
                            <button onClick={handleDeleteShot} className="btn btn-danger h-8 text-xs px-3">Delete</button>
                         </div>
                      </div>
                   </div>
                ) : <div className="text-muted flex flex-col items-center gap-4"><Camera size={48} className="opacity-20" /><p>No screenshots captured</p></div>}
             </div>
          )}
        </div>
      </main>

      {/* MODALS */}
      {showAddModal && (
        <div className="modal-overlay">
           <div className="modal-content modal-md p-6">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-bold text-white">Add New User</h3>
                 <button onClick={() => setShowAddModal(false)} className="btn-icon"><X size={20} /></button>
              </div>
              <input type="text" value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="Phone Number (11 digits)" className="login-input mb-4" />
              
              <div className="mb-6">
                 <label className="text-xs text-muted mb-2 block uppercase font-bold tracking-wider">PDF Permission</label>
                 <select value={newPdfDown ? "true" : "false"} onChange={e => setNewPdfDown(e.target.value === "true")} className="login-input appearance-none bg-surface cursor-pointer">
                    <option value="false">Blocked (Default)</option>
                    <option value="true">Allowed</option>
                 </select>
              </div>

              <div className="flex justify-end gap-3">
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
                 <h3 className="text-xl font-bold text-white">System Settings</h3>
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
              <div className="flex justify-end">
                 <button onClick={() => setShowSettingsModal(false)} className="btn btn-primary">Save Changes</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
