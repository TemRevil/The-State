import React, { useState, useEffect, useRef } from 'react';
import { storage, auth, db, functions } from '../firebaseConfig';
import { ref, listAll, uploadBytes } from '../utils/firebaseMonitored';
import { getMetadata } from 'firebase/storage';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot } from '../utils/firebaseMonitored';
import { increment } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { LogOut, FileText, FolderOpen, Loader2, LayoutGrid, X, ShieldCheck, Lock, Download, ShieldAlert, EyeOff, BookOpen, ChevronDown, Clock, CheckCircle, XCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { PDFViewer } from './PDFViewer';

interface PDFFile { name: string; url: string; date: string; size: string; path: string; }
interface MainPageProps { onLogout: () => void; onNavigateAdmin: () => void; isAdmin: boolean; }
const ALLOWED_ADMIN_UIDS = ["SveIem0WRcSCKl1IK44dZ1KfalO2", "s5rGItmRedXGhgjKr0hUW256Xor1"];

interface QuizQuestion {
  question: string;
  choices: string[];
  correct_answer: string;
  explanation?: string;
}

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
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [activeSection, setActiveSection] = useState<'weeks' | 'quizzes'>('weeks');
  const [showWeeksDropdown, setShowWeeksDropdown] = useState(true);
  const [lectureTypes, setLectureTypes] = useState<string[]>([]);
  const [userStats, setUserStats] = useState<{ quiziTimes?: number; screened?: number }>({});

  // Quiz States
  const [selectedQuizType, setSelectedQuizType] = useState<string | null>(null);
  const [quizMaps, setQuizMaps] = useState<any[]>([]);
  const [selectedMaps, setSelectedMaps] = useState<Set<number>>(new Set());
  const [quizStarted, setQuizStarted] = useState(false);
  const [currentQuizData, setCurrentQuizData] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
  const [quizTimer, setQuizTimer] = useState(300);
  const [timerActive, setTimerActive] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);

  // Quiz Configuration
  const [quizTimerMinutes, setQuizTimerMinutes] = useState<number | null>(5); // null = no timer
  const [quizQuestionCount, setQuizQuestionCount] = useState<number>(10);
  const [quizChoicesCount, setQuizChoicesCount] = useState<number>(4);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Timer effect for quiz
  useEffect(() => {
    if (timerActive && quizTimer > 0 && !quizFinished) {
      const interval = setInterval(() => {
        setQuizTimer(prev => {
          if (prev <= 1) {
            setTimerActive(false);
            finishQuiz();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timerActive, quizTimer, quizFinished]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    setActiveSection('weeks');
    setShowWeeksDropdown(true);
  }, []);

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

    const fetchLectureTypes = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "quizi"));
        setLectureTypes(querySnapshot.docs.map(doc => doc.id));
      } catch (e) {
        console.error("Failed to fetch lecture types", e);
      }
    };
    fetchLectureTypes();

    const num = localStorage.getItem("Number");
    if (num) {
      const userDocRef = doc(db, "Numbers", num);
      const unsub = onSnapshot(userDocRef, (snap) => {
        if (snap.exists()) setUserStats({ quiziTimes: snap.data()['Quizi-Times'], screened: snap.data()['Screened'] });
      });
      return () => unsub();
    }
  }, []);

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
            getDoc(doc(db, 'Numbers', num)).then(s => { if (s.exists()) setCanDownload(s.data()['PDF-Down'] === true); else setCanDownload(false); }).catch(() => { });
          }
        }
      });
      return () => unsub();
    } catch (e) { }
  }, []);

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

  useEffect(() => {
    const checkNotificationPermission = () => {
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          setShowNotificationModal(false);
        } else {
          setShowNotificationModal(true);
        }
      }
    };
    checkNotificationPermission();
    const interval = setInterval(checkNotificationPermission, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Handle visibility change - just close PDF silently if user switches tabs
    const handleVisibilityChange = () => {
      if (document.hidden && selectedPdf) {
        // User switched tabs/windows - just close PDF silently, no violation
        setSelectedPdf(null);
        setViolation(false);
      } else if (document.hidden) {
        setIsFocusLost(true);
      }
    };
    const handleBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) return;
      if (selectedPdf) {
        // User clicked away - just close PDF silently, no violation
        setSelectedPdf(null);
        setViolation(false);
      } else {
        setIsFocusLost(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [selectedPdf]);

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
            ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, 1280, 720);
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

    // Track volume button presses for mobile screenshot detection
    let volumeUpPressed = false;
    let volumeDownPressed = false;
    let volumeButtonPressTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Standard screenshot shortcuts
      if (e.key === 'PrintScreen' || (e.ctrlKey && (e.key === 'p' || e.key === 's')) || (e.metaKey && (e.key === 'p' || e.key === 's')) || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5'))) {
        e.preventDefault();
        handleViolation();
      }

      // Volume button detection for mobile devices
      if (e.key === 'VolumeUp' || e.key === 'AudioVolumeUp' || e.code === 'VolumeUp') {
        volumeUpPressed = true;
        volumeButtonPressTime = Date.now();
        // Check if volume down is also pressed (screenshot combo)
        if (volumeDownPressed) {
          e.preventDefault();
          handleViolation();
        }
      }

      if (e.key === 'VolumeDown' || e.key === 'AudioVolumeDown' || e.code === 'VolumeDown') {
        volumeDownPressed = true;
        volumeButtonPressTime = Date.now();
        // Check if volume up is also pressed (screenshot combo)
        if (volumeUpPressed) {
          e.preventDefault();
          handleViolation();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') handleViolation();

      // Reset volume button states
      if (e.key === 'VolumeUp' || e.key === 'AudioVolumeUp' || e.code === 'VolumeUp') {
        volumeUpPressed = false;
        // If volume button was held for a while, might be screenshot attempt
        if (Date.now() - volumeButtonPressTime > 200 && volumeDownPressed) {
          handleViolation();
        }
      }

      if (e.key === 'VolumeDown' || e.key === 'AudioVolumeDown' || e.code === 'VolumeDown') {
        volumeDownPressed = false;
        // If volume button was held for a while, might be screenshot attempt
        if (Date.now() - volumeButtonPressTime > 200 && volumeUpPressed) {
          handleViolation();
        }
      }
    };

    // Note: Visibility change is handled separately above to just close PDF silently
    // Only actual screenshot attempts (keys, touches) trigger violations here

    // Media key events (alternative volume button detection)
    const handleMediaKey = (e: any) => {
      if (e.key === 'VolumeUp' || e.key === 'VolumeDown' || e.code === 'VolumeUp' || e.code === 'VolumeDown') {
        if (volumeUpPressed || volumeDownPressed) {
          handleViolation();
        }
      }
    };

    const handleCopy = (e: ClipboardEvent) => { e.preventDefault(); };

    // Enhanced touch detection (three touch method + volume button simulation)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3) {
        handleViolation();
      }
      // If touching while volume buttons might be pressed (heuristic)
      if (e.touches.length >= 2 && (volumeUpPressed || volumeDownPressed)) {
        handleViolation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('copy', handleCopy, true);
    window.addEventListener('touchstart', handleTouchStart, true);

    // Try to capture media keys
    try {
      window.addEventListener('keydown', handleMediaKey, true);
    } catch (e) {
      // Some browsers don't support media key events
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('copy', handleCopy, true);
      window.removeEventListener('touchstart', handleTouchStart, true);
      try {
        window.removeEventListener('keydown', handleMediaKey, true);
      } catch (e) { }
    };
  }, [selectedPdf, violation]);

  const loadWeeks = async () => {
    try {
      const res = await listAll(ref(storage, '/'));
      const w = res.prefixes.map(f => f.name).filter(n => n.startsWith('Week ')).sort((a, b) => parseInt(a.split(' ')[1] || '0') - parseInt(b.split(' ')[1] || '0'));
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
          return { name: i.name.replace('.pdf', ''), url: '', date: new Date(m.timeCreated).toLocaleDateString('en-GB'), size: `${(m.size / (1024 * 1024)).toFixed(2)}mb`, path: i.fullPath };
        } catch { return null; }
      }));
      setPdfs(p.filter((x): x is PDFFile => x !== null));
    } catch { } finally { setLoadingPDFs(false); }
  };

  const handleAdminLoginSubmit = async () => {
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

  // Quiz Functions
  const loadQuizMaps = async (quizType: string) => {
    setLoadingQuiz(true);
    try {
      const docSnap = await getDoc(doc(db, "quizi", quizType));
      if (docSnap.exists()) {
        const data = docSnap.data();
        const maps = Object.keys(data).map(key => ({
          id: key,
          data: data[key]
        }));
        setQuizMaps(maps);
        setSelectedQuizType(quizType);
        setSelectedMaps(new Set());
        setQuizStarted(false);
        setQuizFinished(false);
      }
    } catch (e) {
      console.error("Failed to load quiz maps", e);
    } finally {
      setLoadingQuiz(false);
    }
  };

  const toggleMapSelection = (mapIndex: number) => {
    const newSelected = new Set(selectedMaps);
    if (newSelected.has(mapIndex)) {
      newSelected.delete(mapIndex);
    } else {
      newSelected.add(mapIndex);
    }
    setSelectedMaps(newSelected);
  };

  const startQuizSession = async () => {
    if (selectedMaps.size === 0) {
      alert("Please select at least one section");
      return;
    }

    let allQuestions: QuizQuestion[] = [];
    selectedMaps.forEach(mapIndex => {
      const map = quizMaps[mapIndex];
      if (map && map.data && map.data.quiz) {
        allQuestions = [...allQuestions, ...map.data.quiz];
      }
    });

    if (allQuestions.length === 0) {
      alert("No questions found in selected sections");
      return;
    }

    // Shuffle questions
    allQuestions = allQuestions.sort(() => Math.random() - 0.5);

    // Limit questions to selected count
    const limitedQuestions = allQuestions.slice(0, quizQuestionCount);

    // Filter choices for each question
    const processedQuestions = limitedQuestions.map(q => {
      if (q.choices.length <= quizChoicesCount) {
        return q;
      }
      // Keep correct answer and randomly select other choices
      const correctAnswer = q.correct_answer;
      const otherChoices = q.choices.filter(c => c !== correctAnswer);
      const shuffledOthers = otherChoices.sort(() => Math.random() - 0.5);
      const selectedOthers = shuffledOthers.slice(0, quizChoicesCount - 1);
      const newChoices = [correctAnswer, ...selectedOthers].sort(() => Math.random() - 0.5);

      return {
        ...q,
        choices: newChoices
      };
    });

    setCurrentQuizData(processedQuestions);
    setUserAnswers(new Array(processedQuestions.length).fill(null));
    setCurrentQuestionIndex(0);

    // Set timer based on selection
    if (quizTimerMinutes === null) {
      setQuizTimer(0);
      setTimerActive(false);
    } else {
      setQuizTimer(quizTimerMinutes * 60);
      setTimerActive(true);
    }

    setQuizStarted(true);
    setQuizFinished(false);

    // Increment quiz count
    const num = localStorage.getItem("Number");
    if (num) {
      try {
        await updateDoc(doc(db, "Numbers", num), { 'Quizi-Times': increment(1) });
      } catch (e) {
        console.error("Failed to increment quiz count", e);
      }
    }
  };

  const selectAnswer = (answer: string) => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = answer;
    setUserAnswers(newAnswers);
  };

  const navigateQuestion = (direction: number) => {
    // Prevent moving forward if no answer is selected
    if (direction > 0 && userAnswers[currentQuestionIndex] === null) {
      return;
    }

    const newIndex = currentQuestionIndex + direction;
    if (newIndex >= 0 && newIndex < currentQuizData.length) {
      setCurrentQuestionIndex(newIndex);
    } else if (newIndex >= currentQuizData.length) {
      finishQuiz();
    }
  };

  const finishQuiz = () => {
    setTimerActive(false);
    setQuizFinished(true);
  };

  const calculateScore = () => {
    let correct = 0;
    currentQuizData.forEach((q, i) => {
      if (userAnswers[i] === q.correct_answer) {
        correct++;
      }
    });
    return { correct, total: currentQuizData.length, percentage: Math.round((correct / currentQuizData.length) * 100) };
  };

  const resetQuiz = () => {
    setQuizStarted(false);
    setQuizFinished(false);
    setSelectedMaps(new Set());
    setCurrentQuizData([]);
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setQuizTimer(300);
    setTimerActive(false);
    setQuizTimerMinutes(5);
    setQuizQuestionCount(10);
    setQuizChoicesCount(4);
  };

  const backToQuizTypes = () => {
    setSelectedQuizType(null);
    setQuizMaps([]);
    resetQuiz();
  };

  const getTextDirection = (text: string) => {
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text) ? 'rtl' : 'ltr';
  };

  return (
    <div className="flex flex-row h-screen w-full select-none overflow-hidden bg-app-base">

      {/* SIDEBAR */}
      <aside className={`sidebar z-20 shadow-lg ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg flex items-center justify-center text-white bg-surface border border-white/10" style={{ width: '36px', height: '36px' }}> <LayoutGrid size={18} /> </div>
            <div> <h1 className="font-bold text-white tracking-tight text-base">The State</h1> </div>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-auto px-8 py-8 custom-scrollbar">
          <div className="flex flex-col gap-2 p-4">

            {/* WEEKS DROPDOWN */}
            <div className="flex flex-col">
              <button
                onClick={() => {
                  const newShow = !showWeeksDropdown;
                  setShowWeeksDropdown(newShow);
                  if (newShow) setActiveSection('weeks');
                }}
                className={`nav-btn w-full justify-between group ${activeSection === 'weeks' ? 'active' : 'text-muted hover:text-white'}`}
              >
                <div className="flex items-center gap-3">
                  <FolderOpen size={18} className={activeSection === 'weeks' ? 'text-white' : 'text-muted group-hover:text-white'} />
                  <span className="font-medium">Weeks</span>
                </div>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-300 ${showWeeksDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                  maxHeight: showWeeksDropdown ? `${weeks.length * 40 + 20}px` : '0px',
                  opacity: showWeeksDropdown ? 1 : 0
                }}
              >
                <div className="flex flex-col gap-1 pl-4 ml-3 border-l border-white/10 mt-1">
                  {loadingWeeks ? (
                    <div className="flex justify-center py-2"><Loader2 className="animate-spin text-muted" size={14} /></div>
                  ) : (
                    weeks.map((week) => (
                      <button
                        key={week}
                        onClick={() => { setActiveWeek(week); setActiveSection('weeks'); backToQuizTypes(); }}
                        className={`nav-btn h-9 text-sm w-full justify-start pl-3 ${activeWeek === week && activeSection === 'weeks' ? 'bg-primary/20 text-primary border border-primary/20' : 'text-muted hover:text-white hover:bg-white/5 border border-transparent'}`}
                      >
                        <span className="font-medium truncate">{week}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* QUIZZES BUTTON */}
            <button
              onClick={() => {
                setActiveSection('quizzes');
                setShowWeeksDropdown(false);
                backToQuizTypes();
              }}
              className={`nav-btn w-full justify-start gap-3 ${activeSection === 'quizzes' ? 'active' : 'text-muted hover:text-white'}`}
            >
              <BookOpen size={18} />
              <span className="font-medium">Quizzes</span>
            </button>
          </div>
        </div>

        <div className="p-8 border-t border-white/10 mt-auto">
          {!isMobile && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface/50 mb-3 border border-white/5">
              <div className="rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold" style={{ width: '32px', height: '32px' }}>{userName.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{userName}</p>
                <p className="text-xs text-success">Connected</p>
              </div>
            </div>
          )}
          <button onClick={() => setShowAdminLogin(true)} className="nav-btn mb-1"> <ShieldCheck size={16} /> Management </button>
          <button onClick={onLogout} className="nav-btn mb-1"> <LogOut size={16} /> Logout </button>
        </div>
      </aside>

      {sidebarOpen && <div className="mobile-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="content-header">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(s => !s)} className="mobile-toggle" aria-label="Toggle menu">☰</button>
            <div>
              <h2 className="text-2xl font-bold text-white">
                {activeSection === 'weeks' ? (activeWeek || 'Loading...') : selectedQuizType ? selectedQuizType : 'Quizzes'}
              </h2>
              <p className="text-sm text-muted">
                {activeSection === 'weeks' ? 'Main page' : quizStarted ? 'Quiz in progress' : 'Test your knowledge'}
              </p>
            </div>
          </div>
        </header>

        <div className="content-body custom-scrollbar">
          {activeSection === 'weeks' ? (
            loadingPDFs ? (
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
            )
          ) : !selectedQuizType ? (
            // Quiz Type Selection
            lectureTypes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted gap-4">
                <Loader2 size={32} className="animate-spin opacity-40" />
                <p className="text-sm font-medium">Loading lecture types...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-w-md quiz-container">
                {lectureTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => loadQuizMaps(type)}
                    className="quiz-btn"
                  >
                    <BookOpen size={20} />
                    <span className="font-medium">{type}</span>
                  </button>
                ))}
              </div>
            )
          ) : !quizStarted ? (
            // Quiz Map Selection
            loadingQuiz ? (
              <div className="flex flex-col items-center justify-center h-full text-muted gap-4">
                <Loader2 size={32} className="animate-spin opacity-40" />
                <p className="text-sm font-medium">Loading sections...</p>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto p-6">
                <button
                  onClick={backToQuizTypes}
                  className="back-link-btn mb-6"
                >
                  <ArrowLeft size={16} />
                  <span>Back to Quiz Types</span>
                </button>

                <div className="bg-surface border border-white/10 rounded-xl p-6 mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">Select Sections</h3>
                  <p className="text-sm text-muted mb-4">
                    Choose one or more sections from <span className="text-primary font-medium">{selectedQuizType}</span> to include in this quiz.
                  </p>
                  <div className="flex flex-col gap-3 mb-6">
                    {quizMaps.map((map, index) => {
                      const selected = selectedMaps.has(index);
                      return (
                        <label
                          key={index}
                          className={`quiz-section-card cursor-pointer transition-all ${selected ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleMapSelection(index)}
                            className="hidden"
                          />
                          <div className="flex items-center justify-between w-full">
                            <div className="quiz-section-card-left">
                              <div className="quiz-section-title">
                                {selectedQuizType} - {index + 1}
                              </div>
                              <div className="quiz-section-sub">
                                Section {index + 1}
                              </div>
                            </div>
                            <span className="quiz-section-indicator">
                              {selected ? 'Selected' : `#${index + 1}`}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* Quiz Configuration */}
                  <div className="settings-section">
                    <h4 className="settings-title">Quiz Settings</h4>

                    {/* Timer Selection */}
                    <div className="form-field">
                      <label className="form-label">
                        Timer:{" "}
                        <span className="text-primary">
                          {quizTimerMinutes === null || quizTimerMinutes === 0
                            ? "No timer"
                            : `${quizTimerMinutes} minute${quizTimerMinutes !== 1 ? "s" : ""}`}
                        </span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="15"
                        value={quizTimerMinutes === null ? 0 : quizTimerMinutes}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          setQuizTimerMinutes(v === 0 ? null : Math.max(2, v));
                        }}
                        className="w-full quiz-range-input"
                      />
                      <div className="range-labels">
                        <span>No timer</span>
                        <span>15 min</span>
                      </div>
                    </div>

                    {/* Question Count */}
                    <div className="form-field">
                      <label className="form-label">
                        Number of Questions: <span className="text-primary">{quizQuestionCount}</span>
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="15"
                        value={quizQuestionCount}
                        onChange={(e) => setQuizQuestionCount(parseInt(e.target.value))}
                        className="w-full quiz-range-input"
                      />
                      <div className="range-labels">
                        <span>5</span>
                        <span>15</span>
                      </div>
                    </div>

                    {/* Choices Count */}
                    <div className="form-field">
                      <label className="form-label">
                        Choices per Question:
                      </label>
                      <div className="config-toggle-group">
                        {[3, 4, 5].map((count) => (
                          <button
                            key={count}
                            type="button"
                            onClick={() => setQuizChoicesCount(count)}
                            className={`quiz-config-btn ${quizChoicesCount === count ? "active" : ""}`}
                          >
                            {count} choices
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={startQuizSession}
                    disabled={selectedMaps.size === 0}
                    className="w-full btn btn-primary h-12 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Quiz ({selectedMaps.size} section{selectedMaps.size !== 1 ? 's' : ''} selected)
                  </button>
                </div>
              </div>
            )
          ) : quizFinished ? (
            // Quiz Results
            <div className="max-w-3xl mx-auto p-6">
              <div className="bg-surface border border-white/10 rounded-xl p-8 mb-6">
                <div className="text-center mb-8">
                  <h3 className="text-3xl font-bold text-white mb-4">Quiz Completed!</h3>
                  <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-primary/20 border-4 border-primary mb-4">
                    <span className="text-4xl font-bold text-white">{calculateScore().percentage}%</span>
                  </div>
                  <p className="text-lg text-muted">
                    You got {calculateScore().correct} out of {calculateScore().total} questions correct
                  </p>
                </div>

                <div className="space-y-4 mb-6">
                  {currentQuizData.map((q, i) => {
                    const userAns = userAnswers[i];
                    const isCorrect = userAns === q.correct_answer;
                    const dir = getTextDirection(q.question);

                    return (
                      <div
                        key={i}
                        className={`quiz-result-box ${isCorrect ? 'correct' : 'wrong'}`}
                      >
                        <div className="flex items-start gap-3 mb-4">
                          {isCorrect ? (
                            <div className="quiz-result-icon-wrapper correct">
                              <CheckCircle size={24} className="quiz-result-icon correct" />
                            </div>
                          ) : (
                            <div className="quiz-result-icon-wrapper wrong">
                              <XCircle size={24} className="quiz-result-icon wrong" />
                            </div>
                          )}
                          <p
                            className="quiz-result-question"
                            style={{ direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left' }}
                          >
                            {i + 1}. {q.question}
                          </p>
                        </div>

                        <div className="ml-11 space-y-3">
                          {userAns && (
                            <div className={`quiz-answer-box ${isCorrect ? 'correct' : 'wrong'}`}>
                              <span className={`quiz-answer-label ${isCorrect ? 'correct' : 'wrong'}`}>Your answer: </span>
                              <span
                                className={`quiz-answer-text ${isCorrect ? 'correct' : 'wrong'}`}
                                style={{ direction: getTextDirection(userAns) }}
                              >
                                {userAns}
                              </span>
                            </div>
                          )}
                          {!userAns && (
                            <div className="quiz-answer-box not-answered">
                              <span className="quiz-answer-label not-answered">Not answered</span>
                            </div>
                          )}
                          {!isCorrect && (
                            <div className="quiz-answer-box correct">
                              <span className="quiz-answer-label correct">Correct answer: </span>
                              <span
                                className="quiz-answer-text correct"
                                style={{ direction: getTextDirection(q.correct_answer) }}
                              >
                                {q.correct_answer}
                              </span>
                            </div>
                          )}
                          {q.explanation && (
                            <div className="quiz-explanation-box">
                              <span className="quiz-explanation-label">Explanation: </span>
                              <span
                                className="quiz-explanation-text"
                                style={{ direction: getTextDirection(q.explanation) }}
                              >
                                {q.explanation}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={resetQuiz}
                    className="flex-1 btn btn-primary h-12"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={backToQuizTypes}
                    className="flex-1 btn bg-white/10 hover:bg-white/20 border border-white/10 h-12"
                  >
                    Back to Quizzes
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Active Quiz
            <div className="max-w-4xl mx-auto p-6">
              <div className="bg-surface border border-white/10 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 text-muted">
                    <span className="text-2xl font-bold text-white">{currentQuestionIndex + 1}</span>
                    <span>/</span>
                    <span>{currentQuizData.length}</span>
                  </div>

                  {timerActive && (
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${quizTimer < 60 ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary'
                      }`}>
                      <Clock size={18} />
                      <span className="font-mono font-bold">{formatTime(quizTimer)}</span>
                    </div>
                  )}
                </div>

                <div className="mb-8">
                  <p
                    className="text-xl font-medium text-white leading-relaxed"
                    style={{
                      direction: getTextDirection(currentQuizData[currentQuestionIndex]?.question || ''),
                      textAlign: getTextDirection(currentQuizData[currentQuestionIndex]?.question || '') === 'rtl' ? 'right' : 'left'
                    }}
                  >
                    {currentQuizData[currentQuestionIndex]?.question}
                  </p>
                </div>

                <div className="quiz-choices-container mb-8">
                  {currentQuizData[currentQuestionIndex]?.choices.map((choice, idx) => {
                    const isSelected = userAnswers[currentQuestionIndex] === choice;
                    const dir = getTextDirection(choice);

                    return (
                      <button
                        key={idx}
                        onClick={() => selectAnswer(choice)}
                        className={`quiz-choice${isSelected ? ' selected' : ''}`}
                        style={{
                          direction: dir,
                          textAlign: dir === 'rtl' ? 'right' : 'left'
                        }}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => navigateQuestion(-1)}
                    disabled={currentQuestionIndex === 0}
                    className="btn bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowLeft size={18} />
                    Previous
                  </button>

                  <button
                    onClick={() => navigateQuestion(1)}
                    disabled={userAnswers[currentQuestionIndex] === null}
                    className="flex-1 btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {currentQuestionIndex === currentQuizData.length - 1 ? 'Finish' : 'Next'}
                    {currentQuestionIndex !== currentQuizData.length - 1 && <ArrowRight size={18} />}
                  </button>
                </div>

                {userAnswers[currentQuestionIndex] === null && (
                  <p className="text-sm text-muted text-center mt-2">
                    Please select an answer to continue
                  </p>
                )}
              </div>
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
          <div className="admin-login-modal modal-content p-8 relative">
            <button onClick={() => setShowAdminLogin(false)} className="btn-icon absolute top-4 right-4 z-10"><X size={20} /></button>
            <div className="admin-login-container">
              <div className="admin-login-image">
                <img src="assets/user.jpg" alt="Security" />
              </div>
              <div className="admin-login-form">
                <h2 className="text-3xl font-bold text-white mb-2">Management Access</h2>
                <p className="text-sm text-white mb-6" style={{ lineHeight: '1.6' }}>
                  Getting in while it's none of your business, will cause you trouble!
                </p>
                <div className="flex flex-col gap-4">
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={18} />
                    <input
                      ref={passwordInputRef}
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdminLoginSubmit()}
                      placeholder="Security Code"
                      className="login-input pl-12 w-full"
                    />
                  </div>
                  {adminError && <div className="text-xs text-error py-2 px-4 bg-red-500/10 rounded-lg border border-red-500/20 text-center">{adminError}</div>}
                  <button
                    onClick={handleAdminLoginSubmit}
                    disabled={adminLoading}
                    className="btn btn-primary w-full"
                  >
                    {adminLoading ? <Loader2 size={20} className="animate-spin" /> : 'Authenticate'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNotificationModal && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content modal-md p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">تفعيل الإشعارات</h3>
            </div>
            <div className="text-center">
              <p className="text-muted mb-6 text-lg">
                يجب تفعيل الإشعارات للحصول على تحديثات مهمة حول الملفات والأحداث.
              </p>
              <button
                onClick={async () => {
                  if ('Notification' in window) {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                      setShowNotificationModal(false);
                    }
                  }
                }}
                className="btn btn-primary w-full"
              >
                تفعيل الإشعارات
              </button>
              {Notification.permission === 'denied' && (
                <p className="text-error mt-4 text-sm">
                  تم رفض الإشعارات. يرجى تفعيلها من إعدادات المتصفح.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};