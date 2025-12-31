import React, { useState, useEffect, useRef } from 'react';
import { trafficWatcher } from '../utils/firebaseTraffic';
import { db, storage, auth, functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot } from '../utils/firebaseMonitored';
import { query, limit, startAfter, orderBy, getCountFromServer, where, DocumentData, QueryDocumentSnapshot, deleteField, arrayUnion } from 'firebase/firestore';
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject } from '../utils/firebaseMonitored';
import { signOut } from 'firebase/auth';
import { LayoutGrid, FolderOpen, Camera, Settings, LogOut, Search, ShieldAlert, MoreVertical, Trash2, Plus, ArrowLeft, ArrowRight, Upload, X, FileText, Ban, Unlock, Check, BookOpen, Download, List, CheckSquare, Square, ChevronDown, Smartphone, KeyRound, Calendar, Clock, ShieldQuestion, EyeOff, Database, ArrowUp, ArrowDown, Activity, Edit } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AppAlert } from './AppAlert';
import { ContributionModal } from './ContributionModal'; // Assuming this is the new name for the modified modal

interface AdminDashboardProps { onBack: () => void; }
interface NumberData { id: string; number: string; name: string; quizTimes: number; quizEnabled: boolean; pdfDown: boolean; deviceCount?: number; deviceLimit?: number; screenedCount: number; devices?: { Archived?: { [attemptId: string]: { Code: string; Date: string; Time: string; }; } }; }
interface BlockedData { id: string; number: string; name: string; reason: string; date: string; time: string; }
interface SnitchData { id: string; loginNumber: string; snitchNumber: string; snitchName: string; date: string; time: string; }
interface BrokerData { id: string; number: string; count: number; date: string; time: string; attempts: { Date: string; Time: string; Password?: string; }[]; }
interface FileData { name: string; type: 'file' | 'folder'; fullPath: string; url?: string; }
interface LoginAttempt { attemptId: string; deviceId: string; Code: string; Date: string; Time: string; }
interface PendingQuizData {
  id: string;
  ContributorName: string;
  Number: string;
  Quiz: {
    Question: string;
    Choices: { [key: string]: string };
    Subject: string;
    Correct: string;
    Explanation?: string;
  };
}

type ActiveInfo = { type: 'number'; data: NumberData; } | { type: 'broker'; data: BrokerData; };

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {

  // Firebase free tier limits
  const FIREBASE_LIMITS = {
    firestore: { daily: { reads: 50000, writes: 20000, deletes: 20000 } },
    storage: { daily: { bandwidth: 1024 * 1024 * 1024, operations: 20000 }, total: { stored: 5 * 1024 * 1024 * 1024 } }
  };

  const [activeSection, setActiveSection] = useState<'tables' | 'files' | 'shots' | 'firebase' | 'pending-quizzes'>('tables');
  const [activeTableTab, setActiveTableTab] = useState<'numbers' | 'blocked' | 'snitches' | 'brokers'>('numbers');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- NUMBERS DATA STATE ---
  const [numbers, setNumbers] = useState<NumberData[]>([]);

  const [blocked, setBlocked] = useState<BlockedData[]>([]);
  const [snitches, setSnitches] = useState<SnitchData[]>([]);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [activeInfo, setActiveInfo] = useState<ActiveInfo | null>(null);
  const [loginAttemptsData, setLoginAttemptsData] = useState<LoginAttempt[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState<number>(0);
  const [usersWithNamesCount, setUsersWithNamesCount] = useState<number>(0);

  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [adminName, setAdminName] = useState('Admin');
  const [blockedNumbers, setBlockedNumbers] = useState<Set<string>>(new Set());

  // Files State
  const [files, setFiles] = useState<FileData[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [fileViewMode, setFileViewMode] = useState<'grid' | 'table'>('grid');

  // Shots State
  const [shots, setShots] = useState<any[]>([]);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);

  // --- FIREBASE USAGE STATE ---
  const [firebaseUsage, setFirebaseUsage] = useState<any | null>(null);
  const [usageViewMode, setUsageViewMode] = useState<'24h' | '7d' | '30d' | 'billing' | 'quota'>('24h');
  const [showUsageDropdown, setShowUsageDropdown] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(true);
  const [pendingQuizzes, setPendingQuizzes] = useState<PendingQuizData[]>([]);
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [appAlert, setAppAlert] = useState<{ show: boolean; message: string; type?: 'success' | 'error' | 'info' | 'warning'; title?: string }>({ show: false, message: '' });

  // Quiz Contribution/Edit Modal State
  const [showEditQuizModal, setShowEditQuizModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<PendingQuizData | null>(null);
  const [lectureTypes, setLectureTypes] = useState<string[]>([]);


  const showAlert = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', title?: string) => {
    setAppAlert({ show: true, message, type, title });
  };

  // Modals & UI State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [showPdfDropdown, setShowPdfDropdown] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirmAction, setOnConfirmAction] = useState<() => void>(() => { });
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showTableNavMenu, setShowTableNavMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableNavRef = useRef<HTMLDivElement | null>(null);
  const [visibleAttempts, setVisibleAttempts] = useState(10);
  const modalScrollRef = useRef<HTMLDivElement>(null);

  // --- PAGINATION & SORTING STATE ---
  const [numbersPageSize] = useState(20);
  const [numbersLastDoc, setNumbersLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [numbersHasMore, setNumbersHasMore] = useState(true);
  const [numbersLoadingMore, setNumbersLoadingMore] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<'name' | 'quizTimes' | 'screened' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // User Inputs
  const [newNumber, setNewNumber] = useState('');
  const [newPdfDown, setNewPdfDown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [globalQuiz, setGlobalQuiz] = useState(true);
  const [globalPdf, setGlobalPdf] = useState(true);

  // --- NUMBERS LOADING LOGIC ---

  const mapNumberDoc = (d: any): NumberData => ({
    id: d.id,
    number: d.id,
    name: d.data().Name,
    quizTimes: d.data()["Quizi-Times"] || 0,
    quizEnabled: d.data()["Quiz-Enabled"] ?? true,
    pdfDown: d.data()["PDF-Down"] ?? true,
    deviceCount: 0,
    screenedCount: d.data()["Screened"] || 0,
    devices: d.data().Devices
  });

  // 1. Debounce Search (Updated to 2000ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 2000); // Wait 2 seconds before searching
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 2. Load Numbers (Handles Initial Load, Scrolling, Search & Sorting)
  const loadNumbers = async (isLoadMore = false) => {
    if (isLoadMore && numbersLoadingMore) return;
    if (isLoadMore && !numbersHasMore) return;

    setNumbersLoadingMore(true);

    try {
      const collectionRef = collection(db, "Numbers");
      let q;

      if (debouncedSearchTerm) {
        // --- SEARCH MODE ---
        // Search directly in Firestore using prefixes to avoid high reads.
        // We only fetch 20 at a time, even for search results.

        const term = debouncedSearchTerm.trim();
        const isNumeric = /^\d+$/.test(term);

        if (isNumeric) {
          // Search by ID (Number)
          // Note: When using 'where' on __name__, orderBy must also be __name__
          q = query(
            collectionRef,
            where('__name__', '>=', term),
            where('__name__', '<=', term + '\uf8ff'),
            orderBy('__name__'), // Mandatory sort for this where clause
            limit(numbersPageSize)
          );
        } else {
          // Search by Name
          // Firestore requires the first orderBy to match the filter field
          q = query(
            collectionRef,
            where('Name', '>=', term),
            where('Name', '<=', term + '\uf8ff'),
            orderBy('Name'), // Mandatory sort for this where clause
            limit(numbersPageSize)
          );
        }

        // Handle pagination for search results
        if (isLoadMore && numbersLastDoc) {
          q = query(q, startAfter(numbersLastDoc));
        }

      } else {
        // --- DEFAULT MODE ---
        // Efficient Sort & Pagination

        let firestoreOrderBy: any = orderBy('__name__', sortDirection); // Default

        if (sortField === 'name') firestoreOrderBy = orderBy('Name', sortDirection);
        else if (sortField === 'quizTimes') firestoreOrderBy = orderBy('Quizi-Times', sortDirection);
        else if (sortField === 'screened') firestoreOrderBy = orderBy('Screened', sortDirection);

        if (!isLoadMore) {
          q = query(collectionRef, firestoreOrderBy, limit(numbersPageSize));
        } else if (numbersLastDoc) {
          q = query(collectionRef, firestoreOrderBy, startAfter(numbersLastDoc), limit(numbersPageSize));
        } else {
          setNumbersLoadingMore(false);
          return;
        }
      }

      const snapshot = await getDocs(q);
      const newNumbers = snapshot.docs.map(mapNumberDoc);

      if (!isLoadMore) {
        setNumbers(newNumbers);
      } else {
        setNumbers(prev => [...prev, ...newNumbers]);
      }

      // Update cursor for infinite scroll
      if (snapshot.docs.length > 0) {
        setNumbersLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }

      // If we got fewer docs than the limit, we've reached the end
      setNumbersHasMore(snapshot.docs.length === numbersPageSize);

    } catch (error) {
      console.error('Error loading numbers:', error);
    } finally {
      setNumbersLoadingMore(false);
    }
  };

  // 3. Trigger Load on Dependency Change (Sort, Search Term)
  useEffect(() => {
    // Reset List
    setNumbers([]);
    setNumbersLastDoc(null);
    setNumbersHasMore(true);

    // Load fresh data
    loadNumbers(false);

    // Scroll to top
    if (tableContainerRef.current) tableContainerRef.current.scrollTop = 0;
  }, [debouncedSearchTerm, sortField, sortDirection]);

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 50) {
      if (!numbersLoadingMore && numbersHasMore && !debouncedSearchTerm) {
        loadNumbers(true);
      }
    }
  };



  // Sorting Handler
  const handleSort = (field: 'name' | 'quizTimes' | 'screened') => {
    // If we are searching by Name, we can't easily sort by QuizTimes efficiently 
    // without client-side filtering (high reads) or advanced indexes.
    // For this implementation, we allow changing the sort state, which triggers a reload.
    // Note: If searching, loadNumbers logic overrides sortField to match the search query (Name or ID)
    // to keep reads low.

    if (sortField === field) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };


  // --- OTHER DATA WATCHERS (Unchanged) ---
  useEffect(() => {
    getDoc(doc(db, "Dashboard", "Admin")).then(s => s.exists() && setAdminName(s.data().Name || 'Admin'));
    getDoc(doc(db, "Dashboard", "Settings")).then(s => s.exists() && (setGlobalQuiz(s.data()["Quiz-Enabled"]), setGlobalPdf(s.data()["PDF-Down"])));

    const updateTotalCount = async () => {
      try {
        const snapshot = await getCountFromServer(collection(db, "Numbers"));
        setTotalUsersCount(snapshot.data().count);

        // Count users with names (Optimized to not read all docs if possible, but here limit 1000 is used for estimate)
        // To save reads, we could rely on a counter in a dashboard doc, but sticking to existing logic with small limit
        const numbersSnapshot = await getDocs(query(collection(db, "Numbers"), where("Name", "!=", ""), limit(50))); // Reduced check for efficiency
        // Note: Counting accurately requires reads. `getCountFromServer` with query is better
        const namedSnapshot = await getCountFromServer(query(collection(db, "Numbers"), where("Name", ">", "")));
        setUsersWithNamesCount(namedSnapshot.data().count);
      } catch (error) { console.error(error); }
    };
    updateTotalCount();
    const unsubscribeNumbers = onSnapshot(collection(db, "Numbers"), () => updateTotalCount());

    const u1 = onSnapshot(collection(db, "Blocked"), s => {
      const blockedData = s.docs.map(d => ({ id: d.id, number: d.id, name: d.data().Name || 'Unknown', reason: d.data().Reason || 'Unknown', date: d.data()["Blocked Date"] || '', time: d.data()["Blocked Time"] || '' }));
      setBlocked(blockedData);
      setBlockedNumbers(new Set(blockedData.map(b => b.number)));
    });

    const u3 = onSnapshot(collection(db, "Snitches"), async s => {
      const snitchesData = await Promise.all(s.docs.map(async d => {
        const snitchNum = d.data()["The Snitch"];
        let fetchedSnitchName = "Unknown";
        if (snitchNum) { try { const d = await getDoc(doc(db, "Numbers", snitchNum)); if (d.exists()) fetchedSnitchName = d.data().Name || "Unknown"; } catch { } }
        return { id: d.id, loginNumber: d.data()["The Login Number"], snitchNumber: snitchNum, snitchName: fetchedSnitchName, date: d.data()["Snitched Date"], time: d.data()["Snitched Time"] };
      }));
      setSnitches(snitchesData);
    });

    const u4 = onSnapshot(collection(db, "Brokers"), s => {
      setBrokers(s.docs.map(d => {
        const data = d.data();
        const attemptsArray = Object.values(data.Attempts || {}) as { Date: string; Time: string; Password?: string; }[];
        const lastAttempt = attemptsArray.length > 0 ? attemptsArray[attemptsArray.length - 1] : { Date: '', Time: '' };
        return { id: d.id, number: d.id, count: attemptsArray.length, date: lastAttempt.Date, time: lastAttempt.Time, attempts: attemptsArray };
      }));
    });
    return () => { u1(); u3(); u4(); unsubscribeNumbers(); };
  }, []);

  // Fetch lecture types for the quiz modal
  useEffect(() => {
    const fetchLectureTypes = async () => {
      try {
        const docRef = doc(db, "Dashboard", "Admin");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const types = docSnap.data().LectureTypes || [];

          // If LectureTypes is empty, fallback to getting subjects from quizi collection
          if (types.length === 0) {
            try {
              const quiziSnapshot = await getDocs(collection(db, "quizi"));
              const subjects = quiziSnapshot.docs.map(doc => doc.id);
              setLectureTypes(subjects.length > 0 ? subjects : ["مراسلات ومصطلحات اجنبية"]);
            } catch (quiziError) {
              console.error("Error fetching quizi subjects:", quiziError);
              setLectureTypes(["مراسلات ومصطلحات اجنبية"]);
            }
          } else {
            setLectureTypes(types);
          }
        } else {
          // If document doesn't exist, try to get subjects from quizi collection
          try {
            const quiziSnapshot = await getDocs(collection(db, "quizi"));
            const subjects = quiziSnapshot.docs.map(doc => doc.id);
            setLectureTypes(subjects.length > 0 ? subjects : ["مراسلات ومصطلحات اجنبية"]);
          } catch (quiziError) {
            console.error("Error fetching quizi subjects:", quiziError);
            setLectureTypes(["مراسلات ومصطلحات اجنبية"]);
          }
        }
      } catch (error) {
        console.error("Error fetching lecture types:", error);
        setLectureTypes(["مراسلات ومصطلحات اجنبية"]);
      }
    };
    fetchLectureTypes();
  }, []);


  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubscribe = trafficWatcher.subscribeVisibility((visible) => { setIsToastVisible(visible); });
    return unsubscribe;
  }, []);

  // --- CHART TOOLTIP ---
  const CustomTooltip = ({ active, payload, label, limit }: any) => {
    if (active && payload && payload.length && label) {
      const date = new Date(label as number);
      let dateStr = '';
      if (usageViewMode === '24h' || usageViewMode === 'quota') {
        dateStr = date.toLocaleString('en-GB', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (PT)';
      } else {
        dateStr = date.toLocaleString('en-GB', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric' });
      }
      const value = Number(payload[0].value);
      const limitVal = limit || 0;
      const pct = limitVal > 0 ? (value / limitVal) * 100 : 0;
      return (
        <div className="p-4 rounded-xl" style={{ zIndex: 1000, pointerEvents: 'none', backdropFilter: 'blur(20px)', backgroundColor: 'rgba(9, 9, 11, 0.9)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <p className="text-xs font-mono text-muted uppercase tracking-wider mb-1">{dateStr}</p>
          <p style={{ color: payload[0].color, fontSize: '0.875rem', fontWeight: 'bold' }}>{payload[0].name}: {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          {limit && (<div className="mt-2 pt-2 border-t border-white/10"><div className="flex justify-between text-xs text-muted gap-4"><span>Limit:</span> <span>{limitVal.toLocaleString()}</span></div><div className="flex justify-between text-xs font-bold gap-4" style={{ color: value > limitVal ? '#ef476f' : '#06d6a0' }}><span>Used:</span> <span>{pct.toFixed(1)}%</span></div></div>)}
        </div>
      );
    }
    return null;
  };

  const CustomAxisTick = ({ x, y, payload }: any) => {
    if (!payload || payload.value == null) return null;
    const date = new Date(payload.value as number);
    if (usageViewMode === '7d' || usageViewMode === '30d' || usageViewMode === 'billing') {
      const dayStr = date.toLocaleDateString('en-GB', { timeZone: 'America/Los_Angeles', day: 'numeric', month: 'short' });
      return (<g transform={`translate(${x},${y})`}><text x={0} y={0} dy={16} textAnchor="middle" fill="#9ca3af" fontSize={10} fontWeight={500}>{dayStr}</text></g>);
    } else {
      const pacificTime = date.toLocaleTimeString('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit' });
      const cairoTime = date.toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
      return (<g transform={`translate(${x},${y})`}><text x={0} y={0} dy={16} textAnchor="middle" fill="#e5e7eb" fontSize={11} fontWeight={600}>{pacificTime}</text><text x={0} y={0} dy={26} textAnchor="middle" fill="#6b7280" fontSize={8} fontWeight={400}>PT</text><text x={0} y={0} dy={40} textAnchor="middle" fill="#9ca3af" fontSize={10}>{cairoTime}</text><text x={0} y={0} dy={50} textAnchor="middle" fill="#4b5563" fontSize={8}>EG</text></g>);
    }
  };

  // --- ACTIONS ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.options-menu') && !target.closest('.btn-icon') && !target.closest('.btn-secondary')) { setActiveDropdown(null); setShowUsageDropdown(false); }
    };
    document.addEventListener('click', handleClickOutside); return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showInfoModal && activeInfo?.type === 'number') {
      const fetchLoginAttempts = async () => {
        const attempts: LoginAttempt[] = [];
        const numberDocSnap = await getDoc(doc(db, 'Numbers', activeInfo.data.number));
        if (numberDocSnap.exists()) {
          const data = numberDocSnap.data();
          if (data && data.Devices && data.Devices.Archived) {
            Object.keys(data.Devices.Archived).forEach(attemptId => {
              const attemptData = data.Devices.Archived![attemptId];
              if (attemptData) attempts.push({ attemptId: attemptId, deviceId: attemptId, Code: attemptData.Code || 'N/A', Date: attemptData.Date || 'N/A', Time: attemptData.Time || 'N/A' });
            });
          }
        }
        setLoginAttemptsData(attempts.sort((a, b) => parseInt(b.attemptId || '0') - parseInt(a.attemptId || '0')));
        setVisibleAttempts(10);
      };
      fetchLoginAttempts();
    } else { setLoginAttemptsData([]); setVisibleAttempts(10); }
  }, [showInfoModal, activeInfo]);

  useEffect(() => {
    const container = modalScrollRef.current;
    if (!container || !showInfoModal || activeInfo?.type !== 'number') return;
    const handleScroll = () => { if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) setVisibleAttempts(prev => Math.min(prev + 10, loginAttemptsData.length)); };
    container.addEventListener('scroll', handleScroll); return () => container.removeEventListener('scroll', handleScroll);
  }, [showInfoModal, activeInfo, visibleAttempts, loginAttemptsData.length]);

  const showConfirm = (message: string, action: () => void) => { setConfirmMessage(message); setOnConfirmAction(() => action); setShowConfirmModal(true); };
  const handleLogout = async () => { showConfirm("Logout?", async () => { await signOut(auth); window.location.reload(); }); };
  const handleCreateUser = async () => {
    if (!newNumber || newNumber.length !== 11) return alert("Invalid Number");
    try { await setDoc(doc(db, 'Numbers', newNumber), { "Name": "Unknown", "PDF-Down": newPdfDown, "Quiz-Enabled": true, "Quizi-Times": 0, "Devices": {}, "Screened": 0 }); setShowAddModal(false); setNewNumber(''); setNewPdfDown(false); loadNumbers(false); } catch (e: any) { console.error(e); }
  };
  const handleDeleteNumber = async (id: string) => { showConfirm("Delete?", async () => { try { await deleteDoc(doc(db, 'Numbers', id.trim())); setActiveDropdown(null); setNumbers(prev => prev.filter(n => n.id !== id)); } catch (e) { console.error(e); } }); };
  const handleBlockNumber = async (item: NumberData) => { showConfirm(`Block ${item.name || item.number}?`, async () => { try { const now = new Date(); await setDoc(doc(db, 'Blocked', item.number), { "Blocked Date": now.toLocaleDateString("en-GB"), "Blocked Time": now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }), "Reason": "Blocked by Admin", "Name": item.name || 'Unknown' }); setActiveDropdown(null); } catch (e) { console.error(e); } }); };
  const handleToggleQuiz = async (item: NumberData) => { try { await updateDoc(doc(db, 'Numbers', item.number), { "Quiz-Enabled": !item.quizEnabled }); setNumbers(prev => prev.map(n => n.id === item.id ? { ...n, quizEnabled: !n.quizEnabled } : n)); setActiveDropdown(null); } catch (e) { console.error(e); } };
  const handleTogglePdf = async (item: NumberData) => { try { await updateDoc(doc(db, 'Numbers', item.number), { "PDF-Down": !item.pdfDown }); setNumbers(prev => prev.map(n => n.id === item.id ? { ...n, pdfDown: !n.pdfDown } : n)); setActiveDropdown(null); } catch (e) { console.error(e); } };
  const handleClearScreen = async (item: NumberData) => { try { await updateDoc(doc(db, "Numbers", item.number), { Screened: 0 }); setNumbers(prev => prev.map(n => n.id === item.id ? { ...n, screenedCount: 0 } : n)); setActiveDropdown(null); } catch (e) { console.error(e); } };
  const handleClearAllScreened = async () => { showConfirm("Clear all screened counts?", async () => { try { const numbersSnap = await getDocs(collection(db, "Numbers")); await Promise.all(numbersSnap.docs.map(doc => updateDoc(doc.ref, { Screened: 0 }))); loadNumbers(false); } catch (e) { console.error(e); } }); };
  const handleUnblock = async (item: BlockedData) => { showConfirm(`Unblock ${item.number}?`, async () => { try { await deleteDoc(doc(db, "Blocked", item.number)); setActiveDropdown(null); } catch (e) { console.error(e); } }); };
  const handleDeleteBlocked = async (id: string) => { showConfirm("Delete record?", async () => { await deleteDoc(doc(db, "Blocked", id)); setActiveDropdown(null); }); };
  const handleBlockSnitch = async (item: SnitchData) => { showConfirm(`Block Snitch ${item.snitchNumber}?`, async () => { const now = new Date(); try { let name = item.snitchName; await setDoc(doc(db, "Blocked", item.snitchNumber), { "Blocked Date": now.toLocaleDateString("en-GB"), "Blocked Time": now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }), "Reason": `Snitched on ${item.loginNumber}`, "Name": name || 'Unknown' }); try { await deleteDoc(doc(db, "Numbers", item.snitchNumber)); } catch { } setActiveDropdown(null); } catch (e) { console.error(e); } }); };
  const handleDeleteSnitch = async (id: string) => { showConfirm("Delete record?", async () => { await deleteDoc(doc(db, "Snitches", id)); setActiveDropdown(null); }); };
  const handleBlockBroker = async (item: BrokerData) => { showConfirm(`Block Broker ${item.number}?`, async () => { const now = new Date(); try { let name = "Unknown"; try { const d = await getDoc(doc(db, "Numbers", item.number)); if (d.exists()) name = d.data().Name || 'Unknown'; } catch (e) { } await setDoc(doc(db, "Blocked", item.number), { "Blocked Date": now.toLocaleDateString("en-GB"), "Blocked Time": now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }), "Reason": `Blocked as Broker`, "Name": name || 'Unknown' }); await deleteDoc(doc(db, "Brokers", item.id)); try { await deleteDoc(doc(db, "Numbers", item.number)); } catch { } setActiveDropdown(null); } catch (e) { console.error(e); } }); };

  // Filter other tables (Numbers handled via loadNumbers)
  const filteredBlocked = blocked.filter(b => b.number?.includes(searchTerm) || b.name?.toLowerCase()?.includes(searchTerm.toLowerCase()));
  const filteredSnitches = snitches.filter(s => s.loginNumber?.includes(searchTerm) || s.snitchNumber?.includes(searchTerm));
  const filteredBrokers = brokers.filter(b => b.number?.includes(searchTerm));

  // --- FILES LOGIC ---
  const loadFiles = async (path: string) => { try { const r = ref(storage, path); const res = await listAll(r); const fs = res.prefixes.map(p => ({ name: p.name, type: 'folder' as const, fullPath: p.fullPath })); const is = await Promise.all(res.items.map(async i => ({ name: i.name, type: 'file' as const, fullPath: i.fullPath, url: await getDownloadURL(i) }))); setFiles([...fs, ...is]); setSelectedFiles([]); } catch { } };
  useEffect(() => { if (activeSection === 'files') loadFiles(currentPath); }, [activeSection, currentPath]);
  const handleFolderClick = (folderPath: string) => { setPathHistory(prev => [...prev, currentPath]); setCurrentPath(folderPath); };
  const handleNavigateBack = () => { if (pathHistory.length > 0) { const newHistory = [...pathHistory]; const prevPath = newHistory.pop(); setPathHistory(newHistory); setCurrentPath(prevPath || ''); } };
  const handleCreateFolder = async (name: string) => { try { await uploadBytes(ref(storage, `${currentPath ? currentPath + '/' : ''}${name}/.placeholder`), new Blob([''])); setShowFolderModal(false); setFolderName(''); loadFiles(currentPath); } catch { } };
  const handleUploadFile = async (file: File) => { try { const path = `${currentPath ? currentPath + '/' : ''}${file.name}`; await uploadBytes(ref(storage, path), file); loadFiles(currentPath); } catch (e) { console.error(e); } };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file && file.type === 'application/pdf') { await handleUploadFile(file); if ('Notification' in window && Notification.permission === 'granted') { new Notification('PDF Uploaded', { body: `File: ${file.name}`, icon: '/favicon.ico' }); } e.target.value = ''; } };
  const toggleFileSelection = (path: string) => { setSelectedFiles(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]); };
  const handleSelectAll = () => { if (selectedFiles.length === files.length) setSelectedFiles([]); else setSelectedFiles(files.map(f => f.fullPath)); };
  const deleteFolderRecursive = async (path: string) => { try { const list = await listAll(ref(storage, path)); await Promise.all(list.items.map(i => deleteObject(i))); await Promise.all(list.prefixes.map(p => deleteFolderRecursive(p.fullPath))); } catch (e) { console.error("Recursive delete failed", e); } };
  const handleBulkFileDelete = async () => { showConfirm(`Delete ${selectedFiles.length} items? This cannot be undone.`, async () => { for (const path of selectedFiles) { const file = files.find(f => f.fullPath === path); if (file?.type === 'folder') { await deleteFolderRecursive(path); } else { try { await deleteObject(ref(storage, path)); } catch { } } } setSelectedFiles([]); loadFiles(currentPath); }); };

  // --- PENDING QUIZZES LOGIC ---
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "Dashboard", "pending-quizi"), (s) => {
      if (s.exists()) {
        const data = s.data();
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }));
        setPendingQuizzes(list);
      } else {
        setPendingQuizzes([]);
      }
    });
    return unsub;
  }, []);

  const handleApproveQuiz = async (taskId: string, payload: PendingQuizData['Quiz']) => {
    setIsApproving(taskId);
    try {
      const subject = payload.Subject;
      const quiziRef = doc(db, "quizi", subject);
      const quiziSnap = await getDoc(quiziRef);

      let quizzesMap: { [key: string]: any } = {};
      let nextQuizId: number = 1;

      if (quiziSnap.exists()) {
        const data = quiziSnap.data();
        if (data && data.quizzes && Array.isArray(data.quizzes)) {
          // If 'quizzes' is an array, iterate to find the max ID
          const maxId = data.quizzes.reduce((max: number, quiz: any) => Math.max(max, quiz.id || 0), 0);
          nextQuizId = maxId + 1;
        } else if (data) {
          // Fallback for older structure where quizzes might be a map or a different structure
          const keys = Object.keys(data).map(k => parseInt(k)).filter(k => !isNaN(k));
          // Assuming each top-level numeric key holds a 'quizzes' array, find max ID across all
          let currentMaxId = 0;
          keys.forEach(key => {
            if (data[key] && data[key].quizzes && Array.isArray(data[key].quizzes)) {
              currentMaxId = Math.max(currentMaxId, data[key].quizzes.reduce((max: number, quiz: any) => Math.max(max, quiz.id || 0), 0));
            }
          });
          nextQuizId = currentMaxId + 1;
        }
      }

      const isTrueFalse = Object.keys(payload.Choices).length === 2;

      const newQuestion = {
        question: payload.Question,
        options: Object.values(payload.Choices),
        correctAnswer: payload.Choices[payload.Correct],
        explanation: payload.Explanation || "",
        id: nextQuizId, // Use the dynamically determined next ID
        ...(isTrueFalse && { isTrueFalse }), // Conditionally add isTrueFalse
      };

      // Ensure 'quizzes' is treated as an array at the root of the subject document
      await updateDoc(quiziRef, {
        quizzes: arrayUnion(newQuestion)
      });

      // Remove from pending
      const pendingRef = doc(db, "Dashboard", "pending-quizi");
      await updateDoc(pendingRef, {
        [taskId]: deleteField()
      });

      trafficWatcher.logRead(1);
      trafficWatcher.logWrite(2);
      showAlert("Question approved and added to " + subject, "success");
    } catch (e: any) {
      console.error(e);
      showAlert("Approval failed: " + e.message, "error");
    } finally {
      setIsApproving(null);
    }
  };


  const handleRejectQuiz = async (taskId: string) => {
    try {
      const pendingRef = doc(db, "Dashboard", "pending-quizi");
      await updateDoc(pendingRef, {
        [taskId]: deleteField()
      });
      showAlert("Question rejected", "info");
    } catch (e: any) {
      console.error(e);
      showAlert("Rejection failed: " + e.message, "error");
    }
  };

  const handleEditQuiz = (quiz: PendingQuizData) => {
    setEditingQuiz(quiz);
    setShowEditQuizModal(true);
  };

  const handleSaveEditedQuiz = async (updatedQuizData: any) => {
    if (!editingQuiz) return;

    try {
      const pendingRef = doc(db, "Dashboard", "pending-quizi");
      const updatedPayload = {
        [editingQuiz.id]: {
          ...editingQuiz,
          Quiz: {
            Question: updatedQuizData.question,
            Choices: {
              "1": updatedQuizData.choices[0],
              "2": updatedQuizData.choices[1],
              ...(updatedQuizData.choices[2] ? { "3": updatedQuizData.choices[2] } : {}),
              ...(updatedQuizData.choices[3] ? { "4": updatedQuizData.choices[3] } : {}),
            },
            Subject: updatedQuizData.subject,
            Correct: updatedQuizData.correct,
            Explanation: updatedQuizData.explanation,
          }
        }
      };
      await updateDoc(pendingRef, updatedPayload);
      showAlert("Pending quiz updated successfully.", "success");
      setShowEditQuizModal(false);
      setEditingQuiz(null);
    } catch (e: any) {
      console.error("Failed to save edited quiz:", e);
      showAlert("Failed to save edited quiz: " + e.message, "error");
    }
  };


  // --- SHOTS LOGIC ---
  const loadShotsWithOwners = async () => { try { const r = await listAll(ref(storage, 'Captured-Shots')); const raw = await Promise.all(r.items.map(async i => ({ fullPath: i.fullPath, url: await getDownloadURL(i), name: i.name }))); const enhanced = await Promise.all(raw.map(async (s) => { const parts = s.name.split('_'); const ownerNum = parts.length >= 2 ? parts[1] : 'Unknown'; let ownerName = 'Unknown'; try { const d = await getDoc(doc(db, 'Numbers', ownerNum)); if (d.exists()) ownerName = d.data().Name || 'Unknown'; } catch { } return { ...s, ownerNumber: ownerNum, ownerName }; })); setShots(enhanced as any[]); } catch (e) { console.warn('Load shots failed', e); } };
  useEffect(() => { if (activeSection === 'shots') loadShotsWithOwners(); }, [activeSection]);
  useEffect(() => { if (activeSection !== 'shots') return; const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') { setCurrentShotIndex(p => Math.max(0, p - 1)); } else if (e.key === 'ArrowRight') { setCurrentShotIndex(p => Math.min(shots.length - 1, p + 1)); } }; window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [activeSection, shots.length]);
  const handleDeleteShot = async () => { showConfirm("Delete?", async () => { try { await deleteObject(ref(storage, shots[currentShotIndex].fullPath)); const n = [...shots]; n.splice(currentShotIndex, 1); setShots(n); if (currentShotIndex >= n.length) setCurrentShotIndex(Math.max(0, n.length - 1)); } catch { } }); };

  // --- FIREBASE USAGE LOGIC ---
  useEffect(() => {
    if (activeSection === 'firebase') {
      const fetchUsage = async (retryCount = 0) => {
        const MAX_RETRIES = 3;
        const TIMEOUT_MS = 20000;

        setLoadingUsage(true);
        try {
          const getUsage = httpsCallable(functions, 'getFirebaseUsage');

          // Add timeout to prevent hanging
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('TIMEOUT: Cloud Function did not respond. Upgrade to Firebase Blaze plan for external API calls.'));
            }, TIMEOUT_MS);
          });

          const result = await Promise.race([
            getUsage({ mode: usageViewMode }),
            timeoutPromise
          ]) as any;

          const data = result.data as any;
          const shouldAccumulate = usageViewMode === 'quota' || usageViewMode === 'billing';
          const processSeries = (series: any[]) => {
            if (!series) return [];
            if (!shouldAccumulate) return series;
            let sum = 0;
            return series.map(item => { sum += item.value; return { ...item, value: sum }; });
          };
          if (data?.firestore) { data.firestore.reads.data = processSeries(data.firestore.reads.data); data.firestore.writes.data = processSeries(data.firestore.writes.data); }
          if (data?.storage) { data.storage.bandwidth.data = processSeries(data.storage.bandwidth.data); data.storage.requests.data = processSeries(data.storage.requests.data); }
          setFirebaseUsage(data);
          setLastUpdated(new Date());
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Failed to fetch Firebase usage (attempt ${retryCount + 1}/${MAX_RETRIES}):`, errorMessage);

          // Retry logic
          if (retryCount < MAX_RETRIES - 1) {
            console.log('Retrying in 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            return fetchUsage(retryCount + 1);
          }

          console.warn('=== FIREBASE USAGE FETCH FAILED ===');
          console.warn('If you are on Firebase Spark (free) plan, upgrade to Blaze.');
          console.warn('Cloud Functions on Spark plan cannot make external network requests.');
        } finally {
          setLoadingUsage(false);
        }
      };
      fetchUsage();
      const interval = setInterval(() => fetchUsage(), 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [activeSection, usageViewMode]);

  const tableTabs = ['numbers', 'blocked', 'snitches', 'brokers'];

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* SIDEBAR */}
      <aside className={`sidebar z-20 shadow-xl ${sidebarOpen ? 'mobile-open' : ''} p-4`} style={{ maxHeight: '100dvh' }}>
        <div className="sidebar-header gap-3">
          <div className="rounded border border-indigo-900/50 flex items-center justify-center text-indigo-500 bg-indigo-500/10" style={{ width: '32px', height: '32px' }}><ShieldAlert size={18} /></div>
          <div><h1 className="font-bold text-white text-sm">The State</h1></div>
        </div>
        <nav className="flex-1 flex flex-col gap-2 mt-4 overflow-y-auto" style={{ minHeight: 0 }}>
          <button onClick={() => { setActiveSection('tables'); setSidebarOpen(false); }} className={`nav-btn admin-nav-btn ${activeSection === 'tables' ? 'active' : ''}`}><LayoutGrid size={18} /> Tables</button>
          <button onClick={() => { setActiveSection('files'); setSidebarOpen(false); }} className={`nav-btn admin-nav-btn ${activeSection === 'files' ? 'active' : ''}`}><FolderOpen size={18} /> Files</button>
          <button onClick={() => { setActiveSection('shots'); setSidebarOpen(false); }} className={`nav-btn admin-nav-btn ${activeSection === 'shots' ? 'active' : ''}`}><Camera size={18} /> Shots</button>
          <button onClick={() => { setActiveSection('firebase'); setSidebarOpen(false); }} className={`nav-btn admin-nav-btn ${activeSection === 'firebase' ? 'active' : ''}`}><Database size={18} /> Firebase</button>
          <button onClick={() => { setActiveSection('pending-quizzes'); setSidebarOpen(false); }} className={`nav-btn admin-nav-btn ${activeSection === 'pending-quizzes' ? 'active' : ''}`}>
            <List size={18} />
            <span>Pending Quizzes</span>
            {pendingQuizzes.length > 0 && <span className="ml-auto bg-primary text-black text-[10px] font-black px-2 py-0.5 rounded-full">{pendingQuizzes.length}</span>}
          </button>
        </nav>
        <div className="border-t border-white/10 flex flex-col gap-2 pt-4 mt-auto shrink-0">
          {/* Admin User Info */}
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="rounded-full bg-surface border border-white/10 flex items-center justify-center text-muted font-bold text-xs shrink-0" style={{ width: '32px', height: '32px' }}>
              {adminName.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-white truncate">{adminName}</span>
              <span className="text-xs text-success">Admin</span>
            </div>
          </div>
          <button onClick={onBack} className="nav-btn group hover:bg-white/5 transition-all"><ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to User View</button>
          <button onClick={handleLogout} className="nav-btn group hover:bg-error/10 hover:text-error transition-all"><LogOut size={16} className="group-hover:rotate-12 transition-transform" /> Sign Out</button>
        </div>
      </aside>

      {sidebarOpen && <div className="mobile-backdrop" onClick={() => setSidebarOpen(false)} />}

      {/* MAIN */}
      <main className="main-content">
        <header className="content-header p-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(s => !s)} className="mobile-toggle" aria-label="Toggle menu">
              {sidebarOpen ? <X size={20} /> : <List size={20} />}
            </button>
            <div className="rounded-2xl bg-surface border border-white/10 flex items-center justify-center text-primary font-bold shadow-glow" style={{ width: '44px', height: '44px' }}>
              {adminName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Welcome, {adminName.split(' ')[0]}</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></div>
                <p className="text-[10px] font-black uppercase tracking-widest text-success">System Administrator</p>
              </div>
            </div>
          </div>
          <button onClick={() => setShowSettingsModal(true)} className="btn btn-premium-secondary btn-toolbar gap-2"><Settings size={14} /> Settings</button>
        </header>

        <div className="content-body custom-scrollbar">
          {activeSection === 'tables' && (
            <div className="h-full flex flex-col gap-6">
              <div className={`table-toolbar flex items-center justify-between gap-4 ${isMobile ? 'flex-col' : ''}`}>
                {isMobile ? (
                  <div className="relative w-full" ref={tableNavRef}>
                    <button onClick={() => setShowTableNavMenu(!showTableNavMenu)} className="btn btn-secondary w-full justify-between">
                      <span className="capitalize">{activeTableTab}</span>
                      <ChevronDown size={16} className={`transition-transform ${showTableNavMenu ? 'rotate-180' : ''}`} />
                    </button>
                    {showTableNavMenu && (
                      <div className="options-menu w-full" style={{ left: 0 }}>
                        {tableTabs.map((tab) => (
                          <button key={tab} onClick={() => { setActiveTableTab(tab as any); setShowTableNavMenu(false); }} className={`options-item capitalize ${activeTableTab === tab ? 'bg-white/5 active' : ''}`}>
                            <span className="flex-1">{tab}</span>
                            {activeTableTab === tab && <Check size={14} className="text-primary" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="table-nav">
                    {tableTabs.map((tab) => (
                      <button key={tab} onClick={() => setActiveTableTab(tab as any)} className={`table-nav-btn capitalize ${activeTableTab === tab ? 'active' : ''}`}>
                        {tab}
                      </button>
                    ))}
                  </div>
                )}

                <div className={`flex gap-3 items-center ${isMobile ? 'w-full' : ''}`}>
                  <div className={`search-container ${isMobile ? 'flex-1' : ''}`}>
                    <input
                      type="text"
                      placeholder={`Search ${activeTableTab}...`}
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className={`search-input ${isMobile ? 'w-full' : ''}`}
                    />
                    <Search className="search-icon" size={16} />
                  </div>
                  {activeTableTab === 'numbers' && (
                    <button onClick={() => setShowAddModal(true)} className="btn btn-premium-primary btn-toolbar">
                      <Plus size={16} /> <span>Add User</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 bg-surface border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
                <div
                  ref={tableContainerRef}
                  className="absolute inset-0 overflow-auto custom-scrollbar"
                  onScroll={handleTableScroll}
                >
                  <table className="admin-table">
                    <thead>
                      <tr>{activeTableTab === 'numbers' ? (<><th>Number</th><th className="cursor-pointer hover:bg-white/5 select-none" onClick={() => handleSort('name')}><div className="flex items-center gap-2">Name {sortField === 'name' && (sortDirection === 'asc' ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />)}</div></th><th className="cursor-pointer hover:bg-white/5 select-none" onClick={() => handleSort('quizTimes')}><div className="flex items-center gap-2">Quiz Times {sortField === 'quizTimes' && (sortDirection === 'asc' ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />)}</div></th><th className="cursor-pointer hover:bg-white/5 select-none" onClick={() => handleSort('screened')}><div className="flex items-center gap-2">Screened {sortField === 'screened' && (sortDirection === 'asc' ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />)}</div></th><th>Quiz</th><th>PDF</th><th className="text-right">Actions</th></>) : activeTableTab === 'blocked' ? (<><th>Number</th><th>Name</th><th>Reason</th><th>Date</th><th>Status</th><th className="text-right">Actions</th></>) : activeTableTab === 'snitches' ? (<><th>Login #</th><th>Snitch #</th><th>Name</th><th>Time</th><th>Status</th><th className="text-right">Actions</th></>) : (<><th>Number</th><th>Count</th><th>Date</th><th>Time</th><th>Status</th><th className="text-right">Actions</th></>)}</tr>
                    </thead>
                    <tbody>
                      {(activeTableTab === 'numbers' ? numbers : activeTableTab === 'blocked' ? filteredBlocked : activeTableTab === 'snitches' ? filteredSnitches : filteredBrokers).map((item) => (
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
                                  <div className="options-menu" style={{ width: 'max-content', right: 0, left: 'auto' }}>
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
                          {/* Other table rows remain unchanged (Blocked, Snitches, Brokers) */}
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
                                  <div className="options-menu" style={{ width: 'max-content', right: 0, left: 'auto' }}>
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
                                  <div className="options-menu" style={{ width: 'max-content', right: 0, left: 'auto' }}>
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
                                  <div className="options-menu" style={{ width: 'max-content', right: 0, left: 'auto' }}>
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
                      {/* Loading Indicators */}
                      {activeTableTab === 'numbers' && numbersLoadingMore && (
                        <tr>
                          <td colSpan={7} className="text-center py-4">
                            <div className="flex items-center justify-center gap-2 text-muted">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                              <span>{debouncedSearchTerm ? 'Searching...' : 'Loading more users...'}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {activeTableTab === 'numbers' && !numbersLoadingMore && numbers.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-10 text-muted">No users found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>
          )}

          {/* Files, Shots, Firebase Sections (Same as original, abbreviated for brevity) */}
          {activeSection === 'files' && (
            // ... existing file section code ...
            <div className="h-full flex flex-col gap-4">
              {/* Same structure as before, just placeholder here to keep code block valid */}
              <div className="flex items-center justify-between">
                {/* ... header ... */}
                <div className="flex items-center gap-2">
                  <button onClick={handleNavigateBack} disabled={pathHistory.length === 0} className={`btn-icon border border-white/10 bg-surface ${pathHistory.length === 0 ? 'opacity-50' : ''}`}><ArrowLeft size={16} /></button>
                  <div className="flex items-center bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-muted font-mono"><span onClick={() => { setCurrentPath(''); setPathHistory([]); }} className="cursor-pointer hover:text-white">root/</span>{currentPath}</div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedFiles.length > 0 && <button onClick={handleBulkFileDelete} className="btn btn-danger btn-toolbar animate-fade-in"><Trash2 size={16} /> Delete ({selectedFiles.length})</button>}
                  <div className="view-toggle-group mr-2"><button onClick={() => setFileViewMode('grid')} className={`view-toggle-btn ${fileViewMode === 'grid' ? 'active' : ''}`}><LayoutGrid size={16} /></button><button onClick={() => setFileViewMode('table')} className={`view-toggle-btn ${fileViewMode === 'table' ? 'active' : ''}`}><List size={16} /></button></div>
                  <button onClick={() => setShowFolderModal(true)} className="btn btn-secondary btn-toolbar"><FolderOpen size={16} /> New Folder</button>
                  <button onClick={() => uploadInputRef.current?.click()} className="btn btn-primary btn-toolbar"><Upload size={16} /> Upload</button>
                </div>
              </div>
              <div className="flex-1 admin-card overflow-hidden relative">
                {/* File display logic (same as original) */}
                <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
                  {fileViewMode === 'grid' ? (
                    <div className="file-grid-layout">
                      {files.map(file => {
                        const isSelected = selectedFiles.includes(file.fullPath);
                        return (
                          <div key={file.fullPath} onClick={() => file.type === 'folder' && handleFolderClick(file.fullPath)} className={`file-card ${isSelected ? 'selected' : ''}`}>
                            <div onClick={(e) => { e.stopPropagation(); toggleFileSelection(file.fullPath); }} className="absolute top-2 left-2 p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white z-20 cursor-pointer transition-colors">
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
                    // Table view logic
                    <div className="flex flex-col gap-1">
                      <div className="file-table-layout px-4 py-3 text-xs font-bold text-muted uppercase border-b border-white/10 items-center bg-white/5 rounded-t-lg">
                        <div onClick={handleSelectAll} className="cursor-pointer hover:text-white flex items-center">{selectedFiles.length === files.length && files.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}</div>
                        <div className="flex justify-center"><FolderOpen size={14} className="opacity-0" /></div>
                        <span>Name</span>
                        <span className="text-right">Action</span>
                      </div>
                      <div className="flex flex-col">
                        {files.map(file => {
                          const isSelected = selectedFiles.includes(file.fullPath);
                          return (
                            <div key={file.fullPath} onClick={() => file.type === 'folder' && handleFolderClick(file.fullPath)} className={`file-table-layout px-4 py-3 items-center rounded-lg cursor-pointer border-b border-white/5 last:border-0 transition-colors ${isSelected ? 'bg-primary/10 border-primary/20' : 'hover:bg-white/5'}`}>
                              <div onClick={(e) => { e.stopPropagation(); toggleFileSelection(file.fullPath); }} className="cursor-pointer text-muted hover:text-white flex items-center">{isSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}</div>
                              <div className="flex justify-center">{file.type === 'folder' ? <FolderOpen size={18} className="text-amber-500" /> : <FileText size={18} className="text-primary" />}</div>
                              <span className="text-sm text-white truncate pr-4">{file.name}</span>
                              <div className="flex justify-end">{file.type === 'file' && <a href={file.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-2 text-muted hover:text-white"><Download size={14} /></a>}</div>
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
            // ... existing shots code ...
            <div className="h-full flex flex-col gap-4">
              <div className="flex-1 admin-card overflow-hidden relative">
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
                    <div className="text-muted flex flex-col items-center gap-4"><Camera size={48} className="opacity-20" /><p>No screenshots captured</p></div>
                  )}
                </div>
              </div>
              {shots.length > 0 && (
                <div className={`flex justify-between items-center admin-card px-6 py-4 ${isMobile ? 'flex-col gap-4' : ''}`}>
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

          {activeSection === 'firebase' && (
            <div className="h-full flex flex-col gap-6">

              {/* Header & Controls */}
              <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="admin-card p-4 flex items-center gap-4 min-w-[200px]">
                  <div className="p-3 bg-primary/10 rounded-lg text-primary"><Database size={24} /></div>
                  <div className="flex-1">
                    <div className="text-2xl font-bold text-white">
                      {loadingUsage ? '...' : `${usersWithNamesCount.toLocaleString()} / ${totalUsersCount.toLocaleString()}`}
                    </div>
                    <p className="text-xs text-muted">Signed Users / Total Users</p>
                  </div>
                  <button
                    onClick={() => trafficWatcher.toggleToast()}
                    className={`btn btn-sm gap-2 transition-all ${isToastVisible ? 'btn-primary' : 'btn-secondary opacity-60'}`}
                    title={isToastVisible ? 'Monitor is ON' : 'Monitor is OFF'}
                  >
                    <Activity size={14} className={isToastVisible ? 'animate-pulse' : ''} />
                    <span className="text-xs">{isToastVisible ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <div className="flex flex-col gap-2 items-end">
                  <div className="relative w-full sm:w-[220px]">
                    <button onClick={(e) => { e.stopPropagation(); setShowUsageDropdown(!showUsageDropdown); }} className="btn btn-premium-secondary w-full sm:min-w-[220px] justify-between">
                      <span>
                        {usageViewMode === '24h' && 'Last 24 Hours'}
                        {usageViewMode === '7d' && 'Last 7 Days'}
                        {usageViewMode === '30d' && 'Last 30 Days'}
                        {usageViewMode === 'billing' && 'Current Month (Billing)'}
                        {usageViewMode === 'quota' && 'Today\'s Quota (Pacific)'}
                      </span>
                      <ChevronDown size={16} className={`transition-transform ${showUsageDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {showUsageDropdown && (
                      <div className="options-menu w-full md:w-[220px] z-50">
                        <button onClick={() => { setUsageViewMode('24h'); setShowUsageDropdown(false); }} className={`options-item ${usageViewMode === '24h' ? 'bg-white/10' : ''}`}>
                          <Clock size={14} /> Last 24 Hours
                        </button>
                        <button onClick={() => { setUsageViewMode('7d'); setShowUsageDropdown(false); }} className={`options-item ${usageViewMode === '7d' ? 'bg-white/10' : ''}`}>
                          <Calendar size={14} /> Last 7 Days
                        </button>
                        <button onClick={() => { setUsageViewMode('30d'); setShowUsageDropdown(false); }} className={`options-item ${usageViewMode === '30d' ? 'bg-white/10' : ''}`}>
                          <Calendar size={14} /> Last 30 Days
                        </button>
                        <div className="options-divider" />
                        <button onClick={() => { setUsageViewMode('billing'); setShowUsageDropdown(false); }} className={`options-item ${usageViewMode === 'billing' ? 'bg-white/10' : ''}`}>
                          <FileText size={14} /> Billing (Month)
                        </button>
                        <button onClick={() => { setUsageViewMode('quota'); setShowUsageDropdown(false); }} className={`options-item ${usageViewMode === 'quota' ? 'bg-white/10' : ''}`}>
                          <ShieldAlert size={14} /> Today's Quota
                        </button>
                      </div>
                    )}
                  </div>
                  {lastUpdated && <p className="text-xs text-muted">Updated: {lastUpdated.toLocaleTimeString()}</p>}
                </div>
              </div>

              {/* Content */}
              {loadingUsage && !firebaseUsage ? (
                <div className="flex-1 flex items-center justify-center text-muted">
                  <div className="animate-pulse">Loading usage data...</div>
                </div>
              ) : (
                <div className="space-y-8 overflow-y-auto custom-scrollbar pb-10">

                  {/* Row 1: Firestore */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* READS */}
                    <div className="bg-surface border border-white/10 rounded-xl p-6 shadow-2xl">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        Firestore Reads ({firebaseUsage?.firestore?.reads?.total?.toLocaleString() || 0})
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={firebaseUsage?.firestore?.reads?.data || []} margin={{ bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
                          <XAxis
                            dataKey="timestamp"
                            tick={<CustomAxisTick />}
                            minTickGap={isMobile ? 30 : 15}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis stroke="#ccc" fontSize={12} tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val} />
                          <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.1)' }}
                            content={<CustomTooltip limit={usageViewMode === 'quota' ? FIREBASE_LIMITS.firestore.daily.reads : null} />}
                          />
                          <ReferenceLine
                            y={usageViewMode === 'quota' ? FIREBASE_LIMITS.firestore.daily.reads : undefined}
                            stroke="#ef476f"
                            strokeDasharray="5 5"
                            label={usageViewMode === 'quota' ? { value: "Limit: 50k", position: "insideTopRight", fill: "#ef476f" } : undefined}
                            className="limit-line-animated"
                          />
                          <Bar dataKey="value" name="Reads" fill="#ef476f" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* WRITES */}
                    <div className="admin-card p-6 shadow-2xl">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        Firestore Writes ({firebaseUsage?.firestore?.writes?.total?.toLocaleString() || 0})
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={firebaseUsage?.firestore?.writes?.data || []} margin={{ bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
                          <XAxis
                            dataKey="timestamp"
                            tick={<CustomAxisTick />}
                            minTickGap={isMobile ? 30 : 15}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis stroke="#ccc" fontSize={12} tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val} />
                          <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.1)' }}
                            content={<CustomTooltip limit={usageViewMode === 'quota' ? FIREBASE_LIMITS.firestore.daily.writes : null} />}
                          />
                          <ReferenceLine
                            y={usageViewMode === 'quota' ? FIREBASE_LIMITS.firestore.daily.writes : undefined}
                            stroke="#ffd166"
                            strokeDasharray="5 5"
                            label={usageViewMode === 'quota' ? { value: "Limit: 20k", position: "insideTopRight", fill: "#ffd166" } : undefined}
                            className="limit-line-animated"
                          />
                          <Bar dataKey="value" name="Writes" fill="#ffd166" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Row 2: Storage */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* BANDWIDTH */}
                    <div className="admin-card p-6 shadow-2xl">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        Bandwidth ({(firebaseUsage?.storage?.bandwidth?.total / (1024 * 1024)).toFixed(2) || '0'} MB)
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={firebaseUsage?.storage?.bandwidth?.data || []} margin={{ bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
                          <XAxis
                            dataKey="timestamp"
                            tick={<CustomAxisTick />}
                            minTickGap={isMobile ? 30 : 15}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="#ccc"
                            fontSize={12}
                            tickFormatter={(val) => (val / (1024 * 1024)).toFixed(1) + 'MB'}
                          />
                          <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.1)' }}
                            content={<CustomTooltip limit={usageViewMode === 'quota' ? FIREBASE_LIMITS.storage.daily.bandwidth : null} />}
                          />
                          <ReferenceLine
                            y={usageViewMode === 'quota' ? FIREBASE_LIMITS.storage.daily.bandwidth : undefined}
                            stroke="#06d6a0"
                            strokeDasharray="5 5"
                            label={usageViewMode === 'quota' ? { value: "Limit: 1GB", position: "insideTopRight", fill: "#06d6a0" } : undefined}
                            className="limit-line-animated"
                          />
                          <Bar dataKey="value" name="Bandwidth" fill="#06d6a0" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* STORAGE TOTALS & REQUESTS */}
                    <div className="admin-card p-6 shadow-2xl flex flex-col">
                      <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-white">Storage Size</h3>
                          <p className="text-xs text-muted">Total Files Stored</p>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-primary">
                            {(firebaseUsage?.storage?.bytesStored / (1024 * 1024)).toFixed(2) || '0'} MB
                          </div>
                          <div className="text-xs text-white">
                            {firebaseUsage?.storage?.objectCount || 0} Files
                          </div>
                        </div>
                      </div>

                      <h3 className="text-lg font-semibold text-white mb-4">Requests ({firebaseUsage?.storage?.requests?.total?.toLocaleString() || 0})</h3>
                      <div className="flex-1 min-h-[150px]">
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={firebaseUsage?.storage?.requests?.data || []} margin={{ bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
                            <XAxis
                              dataKey="timestamp"
                              tick={<CustomAxisTick />}
                              minTickGap={30}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis stroke="#ccc" fontSize={12} />
                            <Tooltip
                              cursor={{ fill: 'rgba(255,255,255,0.1)' }}
                              content={<CustomTooltip limit={usageViewMode === 'quota' ? FIREBASE_LIMITS.storage.daily.operations : null} />}
                            />
                            <Bar dataKey="value" name="Requests" fill="#118ab2" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {activeSection === 'pending-quizzes' && (
            <div className="h-full flex flex-col gap-6 overflow-y-auto custom-scrollbar pb-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white tracking-tight">Pending Quizi Contributions</h2>
              </div>
              {pendingQuizzes.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted opacity-50">
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <List size={40} />
                  </div>
                  <p className="text-lg font-medium">No pending contributions for review</p>
                  <p className="text-sm">New submissions will appear here for verification</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {pendingQuizzes.map((pq) => (
                    <div key={pq.id} className="admin-card p-6 flex flex-col">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold shadow-glow text-lg">
                            {pq.ContributorName?.charAt(0) || '?'}
                          </div>
                          <div>
                            <div className="text-white font-bold">{pq.ContributorName}</div>
                            <div className="text-[10px] text-muted font-black tracking-widest uppercase">{pq.Number}</div>
                          </div>
                        </div>
                        <div className="px-3 py-1 bg-white/5 rounded-full text-[10px] uppercase font-black text-primary border border-primary/20 tracking-tighter shadow-glow-sm overflow-x-auto max-w-[200px] whitespace-nowrap custom-scrollbar">
                          {pq.Quiz.Subject}
                        </div>
                      </div>
                      <div className="flex-1 space-y-4">
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/10 group-hover:border-primary/20 transition-colors">
                          <div className="text-[9px] text-muted uppercase font-black mb-2 tracking-widest opacity-60">Question Content</div>
                          <div className="text-xl font-arabic text-right text-white leading-relaxed" dir="rtl">{pq.Quiz.Question}</div>
                        </div>
                        {pq.Quiz.Explanation && (
                          <div className="p-5 bg-white/5 rounded-2xl border border-white/10 group-hover:border-primary/20 transition-colors mb-4">
                            <div className="text-[9px] text-muted uppercase font-black mb-2 tracking-widest opacity-60">Explanation</div>
                            <div className="text-sm font-arabic text-right text-white/80 leading-relaxed" dir="rtl">{pq.Quiz.Explanation}</div>
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-4 mb-6">
                          {Object.entries(pq.Quiz.Choices).map(([key, text]) => (
                            <div key={key} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${pq.Quiz.Correct === key ? 'bg-success/5 border-success/30 shadow-glow-sm' : 'bg-black/20 border-white/5'}`}>
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${pq.Quiz.Correct === key ? 'bg-success text-black' : 'bg-white/10 text-muted'}`}>
                                {key}
                              </div>
                              <div className="flex-1 text-base font-arabic text-right text-white/90" dir="rtl">{text as string}</div>
                              {pq.Quiz.Correct === key && <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center"><Check size={12} className="text-success" /></div>}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-4 mt-8 pt-6 border-t border-white/5">
                        <button onClick={() => handleRejectQuiz(pq.id)} className="btn btn-secondary flex-1 text-error hover:bg-error/10 border-error/20 hover:border-error/40 h-12">
                          <X size={18} /> <span>Reject</span>
                        </button>
                        <button onClick={() => handleEditQuiz(pq)} className="btn btn-secondary flex-1 h-12">
                          <Edit size={18} /> <span>Edit</span>
                        </button>
                        <button onClick={() => handleApproveQuiz(pq.id, pq.Quiz)} disabled={isApproving === pq.id} className="btn btn-primary flex-1 h-12 shadow-glow">
                          {isApproving === pq.id ? 'Approving...' : <><Check size={18} /> <span>Approve</span></>}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* INFO MODAL */}
      {showInfoModal && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content modal-md p-0 relative flex flex-col">
            <div className="p-6 md:p-8 flex-shrink-0 border-b border-white/10">
              <button onClick={() => { setShowInfoModal(false); setActiveInfo(null); }} className="btn-icon absolute top-4 right-4 z-10"><X size={20} /></button>
              <div className="flex flex-col items-center w-full">
                <div className="w-20 h-20 rounded-2xl bg-surface border border-white/10 flex items-center justify-center mb-4 text-primary shadow-glow"><BookOpen className="icon-large" /></div>
                <h2 className="text-2xl font-bold text-white mb-2">{activeInfo?.type === 'number' ? 'User Info' : 'Broker Info'}</h2>
                <p className="text-muted text-sm text-center">Data for: <span className="font-mono text-white">{activeInfo?.data.number}</span></p>
              </div>
            </div>
            <div ref={modalScrollRef} className="flex-grow overflow-y-auto custom-scrollbar min-h-0" style={{ overflow: 'scroll' }}>
              <div className="p-6 md:p-8">
                {activeInfo?.type === 'number' && (
                  loginAttemptsData.length > 0 ? (
                    <div className="overflow-x-auto max-h-[200px] overflow-y-auto custom-scrollbar">
                      <table className="admin-table w-full">
                        <thead><tr><th>Device ID</th><th>Code</th><th>Date</th><th>Time</th></tr></thead>
                        <tbody>{loginAttemptsData.slice(0, visibleAttempts).map((attempt) => (<tr key={attempt.attemptId}><td className="font-mono text-muted truncate max-w-xs">{attempt.deviceId}</td><td className="font-mono text-white select-text">{attempt.Code}</td><td className="text-muted">{attempt.Date}</td><td className="text-muted">{attempt.Time}</td></tr>))}</tbody>
                      </table>
                    </div>
                  ) : <div className="text-center text-muted text-sm py-10"><p>No recorded login attempts.</p></div>
                )}
                {activeInfo?.type === 'broker' && (
                  activeInfo.data.attempts.length > 0 ? (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto custom-scrollbar">
                      <table className="admin-table w-full">
                        <thead><tr><th>Password</th><th>Date</th><th>Time</th></tr></thead>
                        <tbody>{activeInfo.data.attempts.map((attempt, index) => (<tr key={index}><td className="font-mono text-white select-text">{attempt.Password || 'N/A'}</td><td className="text-muted">{attempt.Date}</td><td className="text-muted">{attempt.Time}</td></tr>))}</tbody>
                      </table>
                    </div>
                  ) : <div className="text-center text-muted text-sm py-10"><p>No recorded attempts.</p></div>
                )}
              </div>
            </div>
            <div className="p-6 md:p-8 flex-shrink-0 border-t border-white/10"><button onClick={() => { setShowInfoModal(false); setActiveInfo(null); }} className="btn btn-premium-secondary w-full">Close Information Overlay</button></div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {showConfirmModal && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 130000 }}>
          <div className="modal-content modal-sm p-8">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-white">Confirm Action</h3><button onClick={() => setShowConfirmModal(false)} className="btn-icon"><X size={20} /></button></div>
            <p className="text-muted mb-8">{confirmMessage}</p>
            <div className="flex justify-end gap-3"><button onClick={() => setShowConfirmModal(false)} className="btn btn-premium-secondary">Cancel</button><button onClick={() => { onConfirmAction(); setShowConfirmModal(false); }} className="btn btn-premium-primary" style={{ background: 'var(--error)' }}>Confirm</button></div>
          </div>
        </div>
      )}

      {/* FOLDER MODAL */}
      {showFolderModal && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content modal-md p-8">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-white">Create New Folder</h3><button onClick={() => setShowFolderModal(false)} className="btn-icon"><X size={20} /></button></div>
            <div className="space-y-4"><input type="text" value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="Folder name" className="login-input w-full" /></div>
            <div className="flex justify-end gap-3 mt-8"><button onClick={() => setShowFolderModal(false)} className="btn btn-premium-secondary">Cancel</button><button onClick={() => { if (folderName) { handleCreateFolder(folderName); } }} className="btn btn-premium-primary">Create Folder</button></div>
          </div>
        </div>
      )}

      {/* HIDDEN UPLOAD INPUT */}
      <input ref={uploadInputRef} type="file" accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} />

      {/* ADD USER MODAL */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-md p-8">
            <div className="flex justify-between items-center mb-8"><div><h3 className="text-2xl font-bold text-white">Add New User</h3><p className="text-muted text-sm mt-1">Create a new user account</p></div><button onClick={() => setShowAddModal(false)} className="btn-icon"><X size={20} /></button></div>
            <div className="flex flex-col gap-3">
              <div className="form-field"><label className="text-xs text-muted block uppercase font-bold tracking-wider">Phone Number</label><input type="text" value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="Enter 11 digits" className="login-input w-full" /></div>
              <div className="form-field"><label className="text-xs text-muted block uppercase font-bold tracking-wider">PDF Permission</label><div className="relative"><button onClick={() => setShowPdfDropdown(!showPdfDropdown)} className="login-input appearance-none bg-surface cursor-pointer text-left flex items-center justify-between"><span>{newPdfDown ? "Allowed" : "Blocked (Default)"}</span><ChevronDown size={16} className={`text-muted transition-transform ${showPdfDropdown ? 'rotate-180' : ''}`} /></button>{showPdfDropdown && (<div className="pdf-dropdown"><button onClick={() => { setNewPdfDown(false); setShowPdfDropdown(false); }} className="options-item">Blocked (Default)</button><button onClick={() => { setNewPdfDown(true); setShowPdfDropdown(false); }} className="options-item">Allowed</button></div>)}</div></div>
            </div>
            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-white/10"><button onClick={() => setShowAddModal(false)} className="btn btn-premium-secondary">Cancel</button><button onClick={handleCreateUser} className="btn btn-premium-primary">Create User Account</button></div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-md p-6">
            <div className="flex justify-between items-center mb-6"><h3 className={`font-bold text-white ${isMobile ? 'text-lg' : 'text-xl'}`}>System Settings</h3><button onClick={() => setShowSettingsModal(false)} className="btn-icon"><X size={20} /></button></div>
            <div className="space-y-4 mb-8">
              <div className="settings-row"><span className="settings-label">Global Quiz Access</span><button onClick={() => setGlobalQuiz(!globalQuiz)} className={`toggle-switch ${globalQuiz ? 'active' : ''}`}><div className="toggle-thumb" /></button></div>
              <div className="settings-row"><span className="settings-label">Global PDF Downloads</span><button onClick={() => setGlobalPdf(!globalPdf)} className={`toggle-switch ${globalPdf ? 'active' : ''}`}><div className="toggle-thumb" /></button></div>
            </div>
            <div className={`flex items-center gap-4 ${isMobile ? 'flex-col' : 'justify-between'}`}>
              <button onClick={handleClearAllScreened} className={`btn btn-premium-secondary text-error ${isMobile ? 'w-full' : ''}`}>Clear All Screened</button>
              <button
                onClick={async () => { try { await setDoc(doc(db, 'Dashboard', 'Settings'), { 'PDF-Down': globalPdf, 'Quiz-Enabled': globalQuiz }); } catch (e) { console.warn('Failed to save settings', e); } setShowSettingsModal(false); showAlert("Settings saved successfully", "success"); }}
                className={`btn btn-premium-primary ${isMobile ? 'w-full' : ''}`}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT QUIZ MODAL (using ContributionModal component) */}
      {showEditQuizModal && editingQuiz && (
        <ContributionModal
          isOpen={showEditQuizModal}
          onClose={() => { setShowEditQuizModal(false); setEditingQuiz(null); }}
          userName={adminName} // Or current admin's name
          lectureTypes={lectureTypes}
          showAlert={showAlert}
          initialData={{
            question: editingQuiz.Quiz.Question,
            choices: Object.values(editingQuiz.Quiz.Choices),
            correct: editingQuiz.Quiz.Correct,
            subject: editingQuiz.Quiz.Subject,
            explanation: editingQuiz.Quiz.Explanation || ''
          }}
          onSave={handleSaveEditedQuiz}
        />
      )}

      <AppAlert
        isOpen={appAlert.show}
        onClose={() => setAppAlert(prev => ({ ...prev, show: false }))}
        title={appAlert.title}
        message={appAlert.message}
        type={appAlert.type}
      />
    </div>
  );
};