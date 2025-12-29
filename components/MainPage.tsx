import React, { useState, useEffect, useRef } from 'react';
import { storage, auth, db } from '../firebaseConfig';
import { ref, listAll, uploadBytes } from '../utils/firebaseMonitored';
import { getMetadata } from 'firebase/storage';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot } from '../utils/firebaseMonitored';
import { increment } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { LogOut, FileText, FolderOpen, Loader2, LayoutGrid, X, ShieldCheck, Lock, BookOpen, ChevronDown, Clock, CheckCircle, XCircle, ArrowLeft, ArrowRight, Play, Plus, Check, EyeOff, ShieldAlert, Trash2 } from 'lucide-react';
import { PDFViewer } from './PDFViewer';
import { AppAlert } from './AppAlert';
import { ContributionModal } from './ContributionModal';

interface PDFFile {
  name: string;
  url: string;
  date: string;
  size: string;
  path: string;
}

interface MainPageProps {
  onLogout: () => void;
  onNavigateAdmin: () => void;
  isAdmin: boolean;
}

interface QuizQuestion {
  question: string;
  choices: string[];
  correct_answer: string;
  explanation?: string;
  translationQuestion?: string;
  translationChoices?: string[];
}

type BlockSummary = {
  start: number;
  end: number;
  correct: number;
  total: number;
  questions: QuizQuestion[];
  answers: (string | null)[]
};

const ALLOWED_ADMIN_UIDS = ["SveIem0WRcSCKl1IK44dZ1KfalO2", "s5rGItmRedXGhgjKr0hUW256Xor1"];

export const MainPage: React.FC<MainPageProps> = ({ onLogout, onNavigateAdmin, isAdmin }) => {
  // State management
  const [weeks, setWeeks] = useState<string[]>([]);
  const [activeWeek, setActiveWeek] = useState<string | null>(null);
  const [pdfs, setPdfs] = useState<PDFFile[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingPDFs, setLoadingPDFs] = useState(false);
  const [userName, setUserName] = useState('');
  const [canDownload, setCanDownload] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<PDFFile | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [violation, setViolation] = useState(false);
  const [isFocusLost, setIsFocusLost] = useState(false);
  const [isPermanentlyBlocked, setIsPermanentlyBlocked] = useState(false);
  const [activeSection, setActiveSection] = useState<'weeks' | 'quizzes'>('weeks');
  const [showWeeksDropdown, setShowWeeksDropdown] = useState(true);
  const [lectureTypes, setLectureTypes] = useState<string[]>([]);

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
  const [showPeriodicAnswerModal, setShowPeriodicAnswerModal] = useState(false);
  const [periodicAnswerIndex, setPeriodicAnswerIndex] = useState<number | null>(null);
  const [periodicBlock, setPeriodicBlock] = useState<BlockSummary | null>(null);
  const [blockSummaries, setBlockSummaries] = useState<BlockSummary[]>([]);
  const [questionTranslationEnabled, setQuestionTranslationEnabled] = useState<Set<number>>(new Set());
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);

  // Quiz Configuration
  const [quizTimerMinutes, setQuizTimerMinutes] = useState<number | null>(5);
  const [showQuestionTranslation, setShowQuestionTranslation] = useState(false);

  // Refs
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const subjectDropdownRef = useRef<HTMLDivElement>(null);

  // AppAlert State
  const [appAlert, setAppAlert] = useState<{
    show: boolean;
    title?: string;
    message: string;
    type?: 'success' | 'error' | 'info' | 'warning';
  }>({
    show: false,
    message: ''
  });

  const showAlert = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', title?: string) => {
    setAppAlert({ show: true, message, type, title });
  };

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

  // Initialize
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
        let querySnapshot = await getDocs(collection(db, "quizzes"));
        if (!querySnapshot || querySnapshot.size === 0) {
          querySnapshot = await getDocs(collection(db, "quizi"));
        }
        const ids = querySnapshot.docs.map(doc => doc.id);
        setLectureTypes(ids);
      } catch (e) {
        console.error("Failed to fetch lecture types", e);
      }
    };
    fetchLectureTypes();
  }, []);

  // Security: Disable dev tools and context menu
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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(event.target as Node)) {
        setShowSubjectDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check for blocked status
  useEffect(() => {
    const num = localStorage.getItem("Number");
    if (!num) return;
    const blockedDocRef = doc(db, "Blocked", num);
    const unsubscribe = onSnapshot(blockedDocRef, (docSnap) => {
      setIsPermanentlyBlocked(docSnap.exists());
    });
    return () => unsubscribe();
  }, []);

  // Load PDFs when week changes
  useEffect(() => {
    if (activeWeek) loadWeekPDFs(activeWeek);
  }, [activeWeek]);

  // Focus password input when admin login opens
  useEffect(() => {
    if (showAdminLogin) setTimeout(() => passwordInputRef.current?.focus(), 100);
  }, [showAdminLogin]);

  // Security: Handle focus loss
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && selectedPdf) {
        setSelectedPdf(null);
        setViolation(false);
      } else if (document.hidden) {
        setIsFocusLost(true);
      }
    };

    const handleBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) return;
      if (selectedPdf) {
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

  // Security: Screenshot detection
  useEffect(() => {
    if (!selectedPdf) {
      setViolation(false);
      return;
    }

    const handleViolation = async () => {
      if (violation) return;
      setViolation(true);
      const num = localStorage.getItem("Number");
      if (num) {
        try {
          await updateDoc(doc(db, "Numbers", num), { Screened: increment(1) });
        } catch (e) {
          console.error("Failed to log violation", e);
        }

        try {
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, 0, 1280, 720);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 10;
            ctx.strokeRect(50, 50, 1180, 620);
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

            canvas.toBlob(async (blob) => {
              if (blob) {
                const fname = `Shot_${num}_${Date.now()}.png`;
                await uploadBytes(ref(storage, `Captured-Shots/${fname}`), blob);
              }
            });
          }
        } catch (e) {
          console.error("Evidence generation failed", e);
        }
      }
    };

    let volumeUpPressed = false;
    let volumeDownPressed = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || (e.ctrlKey && (e.key === 'p' || e.key === 's')) || (e.metaKey && (e.key === 'p' || e.key === 's')) || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5'))) {
        e.preventDefault();
        handleViolation();
      }

      if (e.key === 'VolumeUp' || e.key === 'AudioVolumeUp' || e.code === 'VolumeUp') {
        volumeUpPressed = true;
        if (volumeDownPressed) {
          e.preventDefault();
          handleViolation();
        }
      }

      if (e.key === 'VolumeDown' || e.key === 'AudioVolumeDown' || e.code === 'VolumeDown') {
        volumeDownPressed = true;
        if (volumeUpPressed) {
          e.preventDefault();
          handleViolation();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') handleViolation();
      if (e.key === 'VolumeUp' || e.key === 'AudioVolumeUp' || e.code === 'VolumeUp') {
        volumeUpPressed = false;
      }
      if (e.key === 'VolumeDown' || e.key === 'AudioVolumeDown' || e.code === 'VolumeDown') {
        volumeDownPressed = false;
      }
    };

    const handleCopy = (e: ClipboardEvent) => { e.preventDefault(); };
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3) {
        handleViolation();
      }
      if (e.touches.length >= 2 && (volumeUpPressed || volumeDownPressed)) {
        handleViolation();
      }
    };

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
  }, [selectedPdf, violation]);

  const loadWeeks = async () => {
    try {
      const res = await listAll(ref(storage, '/'));
      const w = res.prefixes
        .map(f => f.name)
        .filter(n => n.startsWith('Week '))
        .sort((a, b) => parseInt(a.split(' ')[1] || '0') - parseInt(b.split(' ')[1] || '0'));
      setWeeks(w);
      if (w.length > 0) setActiveWeek(w[0]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingWeeks(false);
    }
  };

  const loadWeekPDFs = async (w: string) => {
    setLoadingPDFs(true);
    setPdfs([]);
    try {
      const res = await listAll(ref(storage, w));
      const p = await Promise.all(res.items.map(async (i) => {
        try {
          const m = await getMetadata(i);
          return {
            name: i.name.replace('.pdf', ''),
            url: '',
            date: new Date(m.timeCreated).toLocaleDateString('en-GB'),
            size: `${(m.size / (1024 * 1024)).toFixed(2)}mb`,
            path: i.fullPath
          };
        } catch {
          return null;
        }
      }));
      setPdfs(p.filter((x): x is PDFFile => x !== null));
    } catch {
    } finally {
      setLoadingPDFs(false);
    }
  };

  const handleAdminLoginSubmit = async () => {
    if (!adminPassword) return;
    setAdminLoading(true);
    setAdminError('');
    try {
      const c = await signInWithEmailAndPassword(auth, "temrevil+1@gmail.com", adminPassword);
      if (c.user.email === 'temrevil+1@gmail.com' || ALLOWED_ADMIN_UIDS.includes(c.user.uid)) {
        setShowAdminLogin(false);
        setAdminPassword('');
        onNavigateAdmin();
      } else {
        throw new Error('Access Denied');
      }
    } catch (err) {
      setAdminError('Access Denied');
      recordFailedLoginAttempt(adminPassword);
    } finally {
      setAdminLoading(false);
    }
  };

  const recordFailedLoginAttempt = async (enteredPassword: string) => {
    try {
      const brokerId = localStorage.getItem('Number') || 'Unknown_User';
      const now = new Date();
      try {
        await updateDoc(doc(db, 'Dashboard', 'Failed Login'), { Count: increment(1) });
      } catch (e) {
        try {
          await setDoc(doc(db, 'Dashboard', 'Failed Login'), { Count: 1 });
        } catch (er) { }
      }

      try {
        const brokerDocRef = doc(db, 'Brokers', brokerId);
        const docSnap = await getDoc(brokerDocRef);
        let nextAttemptId = 1;

        if (docSnap.exists()) {
          const data = docSnap.data();
          const attemptKeys = Object.keys(data.Attempts || {}).map(Number).filter(k => !isNaN(k));
          if (attemptKeys.length > 0) {
            nextAttemptId = Math.max(...attemptKeys) + 1;
          }
        }

        const newAttemptData = {
          Password: enteredPassword,
          Date: now.toLocaleDateString('en-GB'),
          Time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
        };

        await setDoc(brokerDocRef, { Attempts: { [nextAttemptId]: newAttemptData } }, { merge: true });
      } catch (e) {
        console.warn('Failed to write/update login attempt record', e);
      }
    } catch (e) {
      console.warn('Failed to record failed login', e);
    }
  };

  // Quiz Functions
  const loadQuizMaps = async (quizType: string) => {
    setLoadingQuiz(true);
    try {
      let docSnap = await getDoc(doc(db, "quizzes", quizType));
      if (!docSnap.exists()) {
        docSnap = await getDoc(doc(db, "quizi", quizType));
      }

      if (docSnap.exists()) {
        const data = docSnap.data();
        let maps: any[] = [];

        if (Array.isArray(data.quizzes)) {
          maps = [{ id: 'all', data: { quiz: data.quizzes } }];
        } else {
          maps = Object.keys(data).map(key => ({ id: key, data: data[key] }));
        }

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

  const startQuizSession = async (mapsToUse?: Set<number>) => {
    const useMaps = mapsToUse ?? selectedMaps;
    if (!useMaps || useMaps.size === 0) {
      showAlert("Please select at least one section to start the quiz.", "warning", "No Selection");
      return;
    }

    let allQuestions: QuizQuestion[] = [];
    useMaps.forEach(mapIndex => {
      const map = quizMaps[mapIndex];
      if (map && map.data && map.data.quiz) {
        allQuestions = [...allQuestions, ...map.data.quiz];
      }
    });

    if (allQuestions.length === 0) {
      showAlert("No questions were found in the selected sections.", "info", "Empty Sections");
      return;
    }

    // Normalize and deduplicate questions
    const normalized: QuizQuestion[] = [];
    const seenKeys = new Set<string | number>();

    useMaps.forEach(mapIndex => {
      const map = quizMaps[mapIndex];
      if (!map || !map.data || !map.data.quiz) return;

      map.data.quiz.forEach((raw: any) => {
        const key = raw.id ?? raw._id ?? raw.question ?? JSON.stringify(raw);
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        const translation = raw.translation || null;
        const questionTextRaw: string = raw.question || raw.q || '';
        const choicesArrRaw: string[] = raw.options || raw.choices || [];
        const translationQuestion: string | undefined = translation?.question;
        const translationChoicesArr: string[] | undefined = translation?.options;
        const correctAns: string = raw.correctAnswer || raw.correct_answer || raw.correct || '';
        const explanation: string | undefined = raw.explanation || raw.explain;

        // Synchronized shuffling for questions and translations
        const choicesClean = choicesArrRaw.filter(Boolean);
        const indices = choicesClean.map((_, i) => i).sort(() => Math.random() - 0.5);

        const shuffled = indices.map(i => choicesClean[i]);

        // Ensure translation choices align with shuffled indices if they exist
        let translationChoices: string[] | undefined;
        if (translationChoicesArr && translationChoicesArr.length >= choicesClean.length) {
          translationChoices = indices.map(i => translationChoicesArr[i] || "");
        } else {
          translationChoices = translationChoicesArr;
        }

        normalized.push({
          question: questionTextRaw,
          choices: shuffled,
          correct_answer: correctAns,
          explanation,
          translationQuestion,
          translationChoices
        });
      });
    });

    const shuffledQuestions = normalized.sort(() => Math.random() - 0.5);

    setCurrentQuizData(shuffledQuestions);
    setUserAnswers(new Array(shuffledQuestions.length).fill(null));
    setCurrentQuestionIndex(0);

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
    if (direction > 0 && userAnswers[currentQuestionIndex] === null) {
      return;
    }

    if (direction > 0) {
      const justAnsweredIndex = currentQuestionIndex;
      if (((justAnsweredIndex + 1) % 10) === 0) {
        const s = Math.floor(justAnsweredIndex / 10) * 10;
        const e = Math.min(s + 9, currentQuizData.length - 1);
        const answersSlice = userAnswers.slice(s, e + 1);
        const questionsSlice = currentQuizData.slice(s, e + 1);
        let correct = 0;
        for (let i = 0; i < questionsSlice.length; i++) {
          if (answersSlice[i] === questionsSlice[i].correct_answer) correct++;
        }
        const summary = {
          start: s,
          end: e,
          correct,
          total: questionsSlice.length,
          questions: questionsSlice,
          answers: answersSlice
        };
        recordBlockSummary(s, e);
        setPeriodicBlock(summary);
        setPeriodicAnswerIndex(justAnsweredIndex);
        setShowPeriodicAnswerModal(true);
        return;
      }
    }

    const newIndex = currentQuestionIndex + direction;
    if (newIndex >= 0 && newIndex < currentQuizData.length) {
      setCurrentQuestionIndex(newIndex);
    } else if (newIndex >= currentQuizData.length) {
      finishQuiz();
    }
  };

  const handlePeriodicContinue = () => {
    setShowPeriodicAnswerModal(false);
    const i = periodicAnswerIndex ?? 0;
    if (i >= currentQuizData.length - 1) {
      finishQuiz();
    } else {
      setCurrentQuestionIndex(i + 1);
    }
    setPeriodicAnswerIndex(null);
    setPeriodicBlock(null);
  };

  const recordBlockSummary = (start: number, end: number) => {
    if (blockSummaries.some(b => b.start === start && b.end === end)) return;

    const answersSlice = userAnswers.slice(start, end + 1);
    const questionsSlice = currentQuizData.slice(start, end + 1);
    let correct = 0;

    for (let i = 0; i < questionsSlice.length; i++) {
      if (answersSlice[i] === questionsSlice[i].correct_answer) correct++;
    }

    const summary = {
      start,
      end,
      correct,
      total: questionsSlice.length,
      questions: questionsSlice,
      answers: answersSlice
    };

    setBlockSummaries(prev => [...prev, summary]);
  };

  const finishQuiz = () => {
    setTimerActive(false);
    const totalBlocks = Math.ceil(currentQuizData.length / 10);

    for (let b = 0; b < totalBlocks; b++) {
      const s = b * 10;
      const e = Math.min(s + 9, currentQuizData.length - 1);

      if (!blockSummaries.some(bs => bs.start === s && bs.end === e)) {
        const answersSlice = userAnswers.slice(s, e + 1);
        const questionsSlice = currentQuizData.slice(s, e + 1);
        let correct = 0;

        for (let i = 0; i < questionsSlice.length; i++) {
          if (answersSlice[i] === questionsSlice[i].correct_answer) correct++;
        }

        setBlockSummaries(prev => [...prev, {
          start: s,
          end: e,
          correct,
          total: questionsSlice.length,
          questions: questionsSlice,
          answers: answersSlice
        }]);
      }
    }

    setQuizFinished(true);
  };

  const calculateScore = () => {
    let correct = 0;
    currentQuizData.forEach((q, i) => {
      if (userAnswers[i] === q.correct_answer) {
        correct++;
      }
    });
    return {
      correct,
      total: currentQuizData.length,
      percentage: Math.round((correct / currentQuizData.length) * 100)
    };
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
    setBlockSummaries([]);
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
    <div className="flex flex-row h-screen w-full select-none overflow-hidden">

      {/* SIDEBAR */}
      <aside className={`sidebar z-20 ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="flex items-center gap-3">
            <div className="rounded-lg flex items-center justify-center text-main bg-surface border border" style={{ width: '36px', height: '36px' }}>
              <LayoutGrid size={18} />
            </div>
            <h1 className="font-bold text-main tracking-tight text-base">The State</h1>
          </div>
        </div>

        <nav className="flex-1 overflow-auto px-8 py-8 custom-scrollbar scroll-mask-v">
          <div className="flex flex-col gap-2 p-4">
            {/* WEEKS DROPDOWN */}
            <div className="flex flex-col">
              <button
                onClick={() => {
                  const newShow = !showWeeksDropdown;
                  setShowWeeksDropdown(newShow);
                  if (newShow) setActiveSection('weeks');
                }}
                className={`nav-btn w-full justify-between ${activeSection === 'weeks' ? 'active' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <FolderOpen size={18} />
                  <span className="font-medium">Weeks</span>
                </div>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${showWeeksDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              <div
                className="overflow-hidden transition-all"
                style={{
                  maxHeight: showWeeksDropdown ? `${weeks.length * 40 + 20}px` : '0px',
                  opacity: showWeeksDropdown ? 1 : 0
                }}
              >
                <div className="flex flex-col gap-1 pl-4 ml-3 border-l mt-1" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  {loadingWeeks ? (
                    <div className="flex justify-center py-2">
                      <Loader2 className="animate-spin text-muted" size={14} />
                    </div>
                  ) : (
                    weeks.map((week) => (
                      <button
                        key={week}
                        onClick={() => {
                          setActiveWeek(week);
                          setActiveSection('weeks');
                          backToQuizTypes();
                        }}
                        className={`nav-btn text-sm w-full justify-between pl-3 pr-2 ${activeWeek === week && activeSection === 'weeks'
                          ? 'bg-primary text-white font-bold border-primary shadow-lg shadow-primary/20'
                          : 'text-muted'
                          }`}
                        style={{ height: '36px' }}
                      >
                        <span className="font-medium truncate">{week}</span>
                        {activeWeek === week && activeSection === 'weeks' && (
                          <div className="w-5 h-5 bg-white/20 rounded-md flex items-center justify-center">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
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
              className={`nav-btn w-full justify-start gap-3 ${activeSection === 'quizzes' ? 'active' : ''}`}
            >
              <BookOpen size={18} />
              <span className="font-medium">Quizzes</span>
            </button>
          </div>
        </nav>

        <div className="p-8 border-t mt-auto">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface/50 mb-3 border">
            <div
              className="rounded-full flex items-center justify-center text-main text-xs font-bold"
              style={{ width: '32px', height: '32px', background: '#6366f1' }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-main truncate">{userName}</p>
              <p className="text-xs text-success">Connected</p>
            </div>
          </div>

          <button onClick={() => setShowAdminLogin(true)} className="nav-btn mb-1">
            <ShieldCheck size={16} /> Management
          </button>
          <button onClick={onLogout} className="nav-btn mb-1">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="mobile-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="content-header">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(s => !s)}
              className="mobile-toggle"
            >
              ☰
            </button>
            <div>
              <h2 className="text-2xl font-bold text-main">
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
              <div className="flex flex-col items-center justify-center h-full text-muted gap-6 border rounded-2xl mx-auto p-12" style={{ maxWidth: '32rem', borderStyle: 'dashed' }}>
                <FolderOpen size={48} className="opacity-20" />
                <p className="text-sm">No documents found in this directory.</p>
              </div>
            ) : (
              <div className="grid-cards">
                {pdfs.map((pdf) => (
                  <div key={pdf.name} onClick={() => setSelectedPdf(pdf)} className="card">
                    <div className="flex-1">
                      <div className="card-icon">
                        <FileText size={24} />
                      </div>
                      <h3 className="text-lg font-semibold text-main mb-2 line-clamp-2 font-arabic" style={{ lineHeight: '1.4' }}>
                        {pdf.name}
                      </h3>
                    </div>
                    <div className="pt-4 flex justify-between items-center text-muted text-xs border-t mt-auto">
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
              <div className="quiz-container">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-main">Select Quiz Subject</h3>
                  <button
                    onClick={() => setShowContributionModal(true)}
                    className="btn btn-secondary btn-sm gap-2 text-xs"
                  >
                    <Plus size={14} /> Contribute Question
                  </button>
                </div>
                <div className="quiz-type-grid">
                  {lectureTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => loadQuizMaps(type)}
                      className="quiz-btn animate-slide-up"
                    >
                      <div className="btn-icon-wrapper">
                        <BookOpen size={28} />
                      </div>
                      <span className="font-semibold">{type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : !quizStarted ? (
            // Quiz Configuration
            loadingQuiz ? (
              <div className="flex flex-col items-center justify-center h-full text-muted gap-4">
                <Loader2 size={32} className="animate-spin opacity-40" />
                <p className="text-sm font-medium">Loading sections...</p>
              </div>
            ) : (
              <div style={{ maxWidth: '40rem', margin: '0 auto' }} className="p-6">
                <button
                  onClick={backToQuizTypes}
                  className="back-link-btn mb-6"
                >
                  <ArrowLeft size={16} />
                  <span>Back to Quiz Types</span>
                </button>

                <div className="bg-surface border rounded-2xl p-8 mb-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-primary/5 blur-3xl rounded-full" style={{ width: '12rem', height: '12rem', marginRight: '-6rem', marginTop: '-6rem' }}></div>

                  <div className="relative">
                    <h3 className="text-2xl font-bold text-main mb-2">Quiz Setup</h3>
                    <p className="text-muted mb-8">
                      Configure your session for <span className="text-primary font-semibold">{selectedQuizType}</span>
                    </p>

                    <div className="space-y-8">
                      {/* Timer selection */}
                      <div className="border rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="flex items-center justify-between mb-4">
                          <label className="text-sm font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                            <Clock size={16} className="text-primary" />
                            Time Limit
                          </label>
                          <span className="text-primary font-bold text-lg">
                            {quizTimerMinutes === null || quizTimerMinutes === 0 ? 'No timer' : `${quizTimerMinutes}m`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="15"
                          value={quizTimerMinutes === null ? 0 : quizTimerMinutes}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            setQuizTimerMinutes(v === 0 ? null : Math.max(2, v));
                          }}
                          className="w-full mb-2"
                          style={{
                            appearance: 'none',
                            height: '6px',
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: '3px',
                            outline: 'none'
                          }}
                        />
                        <div className="flex justify-between text-xs text-muted">
                          <span>Unlimited</span>
                          <span>15 min</span>
                        </div>
                      </div>

                      <div className="border rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="rounded-lg flex items-center justify-center text-primary" style={{ width: '40px', height: '40px', background: 'rgba(38,132,252,0.2)' }}>
                            <LayoutGrid size={20} />
                          </div>
                          <div>
                            <h4 className="text-main font-semibold">Ready to start?</h4>
                            <p className="text-xs text-muted">All sections will be included automatically</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-4">
                          <button
                            onClick={async () => {
                              const allSet = new Set<number>();
                              quizMaps.forEach((_, i) => allSet.add(i));
                              setSelectedMaps(allSet);
                              await startQuizSession(allSet);
                            }}
                            className="btn btn-premium-primary rounded-2xl text-lg font-bold"
                            style={{ padding: '14px 40px', height: 'auto' }}
                          >
                            <Play size={20} />
                            Start Session
                          </button>
                          <button
                            onClick={backToQuizTypes}
                            className="btn btn-premium-secondary rounded-2xl text-lg font-semibold"
                            style={{ padding: '14px 40px', height: 'auto' }}
                          >
                            <ArrowLeft size={20} />
                            Go Back
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : quizFinished ? (
            // Quiz Results
            <>
              <div className="pb-28" style={{ maxWidth: '64rem', margin: '0 auto', padding: '24px' }}>
                <div className="bg-surface border rounded-2xl p-8 mb-8 overflow-hidden relative">
                  <div className="absolute top-0 right-0 bg-primary/10 blur-3xl rounded-full" style={{ width: '16rem', height: '16rem', marginRight: '-8rem', marginTop: '-8rem' }}></div>

                  <div className="relative text-center mb-8">
                    <h3 className="text-3xl font-bold text-main mb-6 font-arabic">نتيجة الاختبار</h3>

                    {(() => {
                      const score = calculateScore();
                      const radius = 70;
                      const circumference = 2 * Math.PI * radius;
                      const offset = circumference - (score.percentage / 100) * circumference;
                      return (
                        <div className="score-circle-container">
                          <svg className="score-circle-svg" viewBox="0 0 160 160">
                            <circle className="score-circle-bg" cx="80" cy="80" r={radius} />
                            <circle
                              className="score-circle-progress"
                              cx="80" cy="80" r={radius}
                              strokeDasharray={circumference}
                              strokeDashoffset={offset}
                            />
                          </svg>
                          <div className="score-value">{score.percentage}%</div>
                        </div>
                      );
                    })()}

                    <p className="text-xl text-muted font-arabic">
                      لقد أجبت على <span className="text-main font-bold">{calculateScore().correct}</span> من <span className="text-main font-bold">{calculateScore().total}</span> أسئلة بشكل صحيح
                    </p>
                  </div>

                  <div className="space-y-6 mb-6">
                    {blockSummaries.length > 0 ? (
                      blockSummaries
                        .slice()
                        .sort((a, b) => a.start - b.start)
                        .map((block, bi) => (
                          <div key={bi} className="p-4 border rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <div className="flex justify-between items-center mb-2" dir="rtl">
                              <span className="font-bold text-main font-arabic">القسم {bi + 1} (Q{block.start + 1}-{block.end})</span>
                              <span className="text-sm font-bold text-primary">{block.correct} / {block.total}</span>
                            </div>
                            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${(block.correct / block.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="text-center text-muted py-8 font-arabic">لا يوجد ملخص لهذا القسم.</p>
                    )}
                  </div>

                  <div className="space-y-6 mb-12">
                    <h4 className="text-xl font-bold text-main flex items-center justify-end gap-3 mb-6" dir="rtl">
                      مراجعة الأسئلة
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                        <BookOpen size={20} />
                      </div>
                    </h4>
                    <div className="flex flex-col gap-6">
                      {currentQuizData.map((q, i) => {
                        const isCorrect = userAnswers[i] === q.correct_answer;
                        return (
                          <div key={i} className={`p-6 rounded-2xl border transition-all ${isCorrect ? 'border-success/20 bg-success/5' : 'border-error/20 bg-error/5'}`}>
                            <div className="flex justify-between items-start gap-4 mb-4">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-arabic ${isCorrect ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`} dir="rtl">
                                السؤال {i + 1} • {isCorrect ? 'صحيح' : 'خطأ'}
                              </span>
                            </div>
                            <p className="font-arabic text-xl mb-6 text-main leading-relaxed" dir="rtl">{q.question}</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className={`p-4 rounded-xl flex flex-col gap-1 items-end ${isCorrect ? 'bg-success/10' : 'bg-error/10'}`}>
                                <span className="text-[10px] uppercase font-black opacity-50 tracking-tighter font-arabic">إجابتك</span>
                                <span className="font-arabic text-sm">{userAnswers[i] || 'بدون إجابة'}</span>
                              </div>
                              {!isCorrect && (
                                <div className="p-4 rounded-xl bg-success/10 flex flex-col gap-1 items-end">
                                  <span className="text-[10px] uppercase font-black opacity-50 tracking-tighter font-arabic">الإجابة الصحيحة</span>
                                  <span className="font-arabic text-sm text-success font-bold">{q.correct_answer}</span>
                                </div>
                              )}
                            </div>

                            {q.explanation && (
                              <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/10 text-right" dir="rtl">
                                <span className="text-[10px] uppercase font-black text-primary opacity-60 tracking-tighter block mb-1 font-arabic">التوضيح</span>
                                <p className="text-sm font-arabic leading-relaxed text-muted/80">{q.explanation}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={resetQuiz}
                      className="btn btn-premium-primary flex-1 h-14 text-lg font-bold font-arabic"
                    >
                      <Play size={20} />
                      إعادة الاختبار
                    </button>
                    <button
                      onClick={backToQuizTypes}
                      className="btn btn-premium-secondary flex-1 h-14 text-lg font-bold font-arabic"
                    >
                      <ArrowLeft size={20} className="rotate-180" />
                      العودة للمواد
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            // Quiz Logic
            <div className="quiz-container animate-fade-in" style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <div className="px-4 py-2 rounded-xl bg-surface border text-xs font-bold text-main">
                    Question <span className="text-primary">{currentQuestionIndex + 1}</span> / {currentQuizData.length}
                  </div>
                  {quizTimer > 0 && (
                    <div className={`flex items-center gap-2 font-mono text-sm px-4 py-2 rounded-xl bg-surface border ${quizTimer < 60 ? 'text-error animate-pulse border-error/20' : 'text-muted'}`}>
                      <Clock size={14} />
                      {formatTime(quizTimer)}
                    </div>
                  )}
                  {currentQuizData[currentQuestionIndex]?.translationQuestion && (
                    <button
                      onClick={() => setShowQuestionTranslation(!showQuestionTranslation)}
                      className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition-all ${showQuestionTranslation ? 'bg-primary text-white border-primary' : 'bg-surface text-muted hover:text-white border-white/10'}`}
                    >
                      <BookOpen size={14} />
                      <span>{showQuestionTranslation ? 'AR' : 'EN'}</span>
                    </button>
                  )}
                </div>
                <button
                  onClick={resetQuiz}
                  className="w-10 h-10 rounded-xl bg-surface border flex items-center justify-center text-muted hover:text-white transition-all hover:bg-error/10 hover:border-error/20"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="quiz-progress-wrapper mb-8">
                <div
                  className="quiz-progress-bar"
                  style={{ width: `${((currentQuestionIndex + 1) / currentQuizData.length) * 100}%` }}
                />
              </div>

              <div className="bg-surface border rounded-3xl p-8 mb-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16"></div>
                <h3 className={`text-2xl md:text-3xl font-bold text-main leading-relaxed mb-10 ${showQuestionTranslation ? 'font-arabic text-right' : 'text-left'}`} dir={showQuestionTranslation ? "rtl" : "ltr"}>
                  {showQuestionTranslation
                    ? (currentQuizData[currentQuestionIndex]?.translationQuestion || currentQuizData[currentQuestionIndex]?.question)
                    : currentQuizData[currentQuestionIndex]?.question}
                </h3>

                <div className="grid gap-3">
                  {(showQuestionTranslation && currentQuizData[currentQuestionIndex]?.translationChoices
                    ? currentQuizData[currentQuestionIndex].translationChoices
                    : currentQuizData[currentQuestionIndex]?.choices
                  )?.map((choice, i) => {
                    // We must map the visual choice back to the original answer for logic matching
                    // BUT since we shuffled both arrays synchronously, the index 'i' corresponds to the same option in both arrays.
                    // The 'userAnswers' stores the ENGLISH text of the selected answer.
                    // So when rendering Arabic, we must check if the English corresponding choice is selected.

                    const englishChoice = currentQuizData[currentQuestionIndex]?.choices[i];
                    const isSelected = userAnswers[currentQuestionIndex] === englishChoice;

                    return (
                      <button
                        key={i}
                        onClick={() => selectAnswer(englishChoice)}
                        className={`quiz-choice ${showQuestionTranslation ? 'text-right flex-row-reverse' : 'text-left flex-row'} flex items-center gap-6 p-6 rounded-2xl ${isSelected ? 'selected' : ''}`}
                      >
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center border text-lg font-black transition-all ${isSelected ? 'bg-primary border-transparent text-white' : 'bg-white/5 border-white/10 text-muted'}`}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className={`flex-1 text-lg ${showQuestionTranslation ? 'font-arabic' : ''}`}>{choice || englishChoice}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => navigateQuestion(-1)}
                  disabled={currentQuestionIndex === 0}
                  className="btn btn-premium-secondary flex-1 h-16 rounded-2xl"
                >
                  <ArrowLeft size={20} />
                  Previous
                </button>
                <button
                  onClick={() => navigateQuestion(1)}
                  className="btn btn-premium-primary flex-1 h-16 rounded-2xl font-bold"
                >
                  {currentQuestionIndex === currentQuizData.length - 1 ? 'Finish Quiz' : 'Next Question'}
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <AppAlert
        isOpen={appAlert.show}
        onClose={() => setAppAlert(prev => ({ ...prev, show: false }))}
        title={appAlert.title}
        message={appAlert.message}
        type={appAlert.type}
      />

      <ContributionModal
        isOpen={showContributionModal}
        onClose={() => setShowContributionModal(false)}
        userName={userName}
        lectureTypes={lectureTypes}
        showAlert={showAlert}
      />

      {showPeriodicAnswerModal && periodicBlock && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 430 }}>
          <div className="periodic-modal animate-scale-in">

            <div className="periodic-header">
              <div className="w-20 h-20 bg-success/10 rounded-3xl flex items-center justify-center mb-4 text-success border border-success/20 rotate-3 transition-transform hover:rotate-0">
                <CheckCircle size={40} />
              </div>
              <h3 className="text-2xl font-black text-white mb-1 tracking-tight uppercase font-arabic">اكتمل القسم</h3>
              <p className="text-muted text-sm font-medium font-arabic">تحليل مفصل لآخر 10 إجابات</p>
            </div>

            <div className="periodic-scroll-content custom-scrollbar">
              {/* Score Card Ratio & Progress */}
              <div className="periodic-score-card">
                <div className="absolute top-0 right-0 w-32 h-32 bg-success/5 blur-3xl rounded-full -mr-16 -mt-16"></div>

                <div className="flex justify-between items-end mb-6">
                  <div className="flex flex-col items-end">
                    <span className="text-muted font-bold uppercase tracking-widest text-[10px] mb-1 font-arabic">الدقة الإجمالية</span>
                    <span className="text-4xl font-black text-success tracking-tighter">
                      {Math.round((periodicBlock.correct / periodicBlock.total) * 100)}%
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-muted text-[10px] font-bold uppercase block mb-1 font-arabic">الأسئلة</span>
                    <span className="text-xl font-bold text-white"><span className="text-white/30 text-sm">{periodicBlock.total} /</span> {periodicBlock.correct}</span>
                  </div>
                </div>

                <div className="quiz-progress-wrapper h-2 mb-2">
                  <div
                    className="quiz-progress-bar"
                    style={{ width: `${(periodicBlock.correct / periodicBlock.total) * 100}%`, background: 'var(--success)', boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)' }}
                  />
                </div>
              </div>

              {/* Question Review List */}
              <div className="space-y-4">
                <h4 className="periodic-review-title" dir="rtl">
                  <FileText size={12} className="text-primary" />
                  مراجعة النتائج
                </h4>
                <div className="space-y-4">
                  {periodicBlock.questions.map((q, i) => {
                    const isCorrect = periodicBlock.answers[i] === q.correct_answer;
                    return (
                      <div key={i} className={`periodic-review-card ${isCorrect ? 'correct' : 'incorrect'}`}>
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-[10px] font-black text-white/20 uppercase font-arabic">السؤال {i + 1}</span>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full font-arabic ${isCorrect ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20'}`}>
                            {isCorrect ? 'صحيح' : 'خطأ'}
                          </span>
                        </div>
                        <p className="font-arabic text-lg mb-5 text-main text-right leading-relaxed" dir="rtl">{q.question}</p>
                        <div className="space-y-2 border-t border-white/5 pt-4">
                          <div className="flex justify-between items-center text-sm" dir="rtl">
                            <span className="text-white/30 text-xs font-arabic">إجابتك</span>
                            <span className={`font-arabic ${isCorrect ? 'text-success' : 'text-error'}`}>{periodicBlock.answers[i] || 'بدون إجابة'}</span>
                          </div>
                          {!isCorrect && (
                            <>
                              <div className="flex justify-between items-center text-sm" dir="rtl">
                                <span className="text-white/30 text-xs font-arabic">الإجابة الصحيحة</span>
                                <span className="font-arabic text-success font-bold">{q.correct_answer}</span>
                              </div>
                              {q.explanation && (
                                <div className="mt-4 p-4 rounded-2xl bg-primary/5 border border-primary/10 text-right" dir="rtl">
                                  <span className="text-[10px] uppercase font-black text-primary opacity-60 tracking-widest block mb-1 font-arabic">التوضيح</span>
                                  <p className="text-xs font-arabic leading-relaxed text-muted/80">{q.explanation}</p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="periodic-footer">
              <button
                onClick={handlePeriodicContinue}
                className="btn btn-premium-primary w-full h-16 rounded-2xl text-lg font-bold flex items-center justify-center gap-3 shadow-xl shadow-primary/20"
              >
                متابعة الاختبار
                <ArrowRight size={20} className="rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdminLogin && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 550 }}>
          <div className="modal-content modal-sm p-8">
            <h3 className="text-xl font-bold mb-2">Admin Access</h3>
            <p className="text-sm text-muted mb-6">Password required to enter management</p>
            <input
              ref={passwordInputRef}
              type="password"
              className="input mb-4"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleAdminLoginSubmit()}
            />
            {adminError && <p className="text-error text-xs mb-4">{adminError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowAdminLogin(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleAdminLoginSubmit}
                disabled={adminLoading}
                className="btn btn-primary flex-1"
              >
                {adminLoading ? '...' : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isPermanentlyBlocked && (
        <div className="fixed inset-0 z-[800] bg-black flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <ShieldAlert size={80} className="text-error mx-auto mb-6" />
            <h1 className="text-4xl font-bold text-error mb-4 uppercase tracking-tighter">Permanently Blocked</h1>
            <p className="text-lg text-white/50 mb-8 leading-relaxed">
              This device has been restricted from accessing the service due to repeated security policy violations.
            </p>
            <div className="w-16 h-1 bg-error/30 mx-auto"></div>
          </div>
        </div>
      )}

      {selectedPdf && (
        <PDFViewer
          pdf={selectedPdf}
          onClose={() => setSelectedPdf(null)}
          violation={violation}
          onViolation={() => setViolation(true)}
          canDownload={canDownload}
        />
      )}

      {isFocusLost && !isPermanentlyBlocked && (
        <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center p-8 text-center" style={{ backdropFilter: 'blur(100px)', WebkitBackdropFilter: 'blur(100px)', position: 'fixed', top: 0, right: 0, zIndex: 1000 }}>
          <div className="max-w-xl w-full">
            <div className="mb-10 relative">
              <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full"></div>
              <EyeOff size={100} className="text-primary mx-auto relative opacity-80 animate-pulse" />
            </div>
            <h2 className="text-5xl font-black text-white mb-6 tracking-tighter uppercase">Session Paused</h2>
            <p className="text-white/40 text-xl mb-16 leading-relaxed max-w-lg mx-auto font-medium">
              For your security, content is hidden while the application is not in focus.
            </p>
            <button
              onClick={() => setIsFocusLost(false)}
              className="btn btn-premium-primary px-16 h-20 rounded-3xl text-2xl font-black shadow-2xl shadow-primary/40 transform hover:scale-105 active:scale-95 transition-all"
            >
              RESUME SESSION
            </button>
          </div>
        </div>
      )}
    </div>
  );
};