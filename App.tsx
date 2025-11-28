
import React, { useState, useEffect } from 'react';
import './components/arabicFontDetector.js';
import { LoginPage } from './components/LoginPage';
import { MainPage } from './components/MainPage';
import { AdminDashboard } from './components/AdminDashboard';
import { auth, db, functions } from './firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc } from 'firebase/firestore';
import { ShieldAlert } from 'lucide-react';

// Free tier limits
const LIMITS = {
  firestore: {
    daily: {
      reads: 50000,
      writes: 20000,
      deletes: 20000
    }
  },
  storage: {
    daily: {
      bandwidth: 1024 * 1024 * 1024, // 1 GB in bytes
      operations: 20000
    },
    total: {
      stored: 5 * 1024 * 1024 * 1024 // 5 GB in bytes
    }
  },
  functions: {
    monthly: {
      invocations: 2000000,
      gbSeconds: 400000,
      cpuSeconds: 200000,
      network: 5 * 1024 * 1024 * 1024 // 5 GB in bytes
    }
  }
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'login' | 'dashboard' | 'admin'>('login');
  const [isAdmin, setIsAdmin] = useState(false);
  const [limitsExceeded, setLimitsExceeded] = useState<boolean | null>(null);
  const [resetTimer, setResetTimer] = useState<string>('');

  const calculateResetTimer = () => {
    const now = new Date();
    const nextPacificMidnight = new Date(now);
    nextPacificMidnight.setUTCHours(8, 0, 0, 0); // 08:00 UTC is midnight PST
    if (nextPacificMidnight <= now) {
      nextPacificMidnight.setUTCDate(nextPacificMidnight.getUTCDate() + 1);
    }
    const timeUntilReset = nextPacificMidnight.getTime() - now.getTime();
    const hours = Math.floor(timeUntilReset / (1000 * 60 * 60));
    const minutes = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeUntilReset % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  useEffect(() => {
    if (limitsExceeded) {
      const interval = setInterval(() => {
        setResetTimer(calculateResetTimer());
      }, 1000); // Update every second
      setResetTimer(calculateResetTimer()); // Initial set
      return () => clearInterval(interval);
    }
  }, [limitsExceeded]);

  useEffect(() => {
    const num = localStorage.getItem("Number");
    const code = localStorage.getItem("Code");
    const name = localStorage.getItem("Name");

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setIsAdmin(!!user);
      if (user) {
        // Check Firebase limits
        try {
          const getUsage = httpsCallable(functions, 'getFirebaseUsage');
          const result = await getUsage();
          const data = result.data as any;

          // Process usage data
          const firestoreReads = data.firestore.reads.reduce((sum: number, item: any) => sum + item.value, 0);
          const firestoreWrites = data.firestore.writes.reduce((sum: number, item: any) => sum + item.value, 0);
          const firestoreDeletes = data.firestore.deletes.reduce((sum: number, item: any) => sum + item.value, 0);
          const storageBandwidth = data.storage.bandwidthSent.reduce((sum: number, item: any) => sum + item.value, 0);
          const storageOperations = data.storage.requests.reduce((sum: number, item: any) => sum + item.value, 0);
          const storageStored = data.storage.bytesStored[0]?.value * 1024 * 1024 || 0; // Convert MB to bytes

          // Monthly functions (assuming last 30 days data)
          const functionsInvocations = data.firestore.reads.length > 0 ? data.firestore.reads.reduce((sum: number, item: any) => sum + item.value, 0) : 0; // Placeholder, adjust based on actual data
          const functionsGbSeconds = 0; // Placeholder
          const functionsCpuSeconds = 0; // Placeholder
          const functionsNetwork = 0; // Placeholder


          // Check limits
          let limitExceeded = false;
          let reason = '';

          if (firestoreReads > LIMITS.firestore.daily.reads) {
            limitExceeded = true;
            reason = 'Firestore daily read limit exceeded.';
          } else if (firestoreWrites > LIMITS.firestore.daily.writes) {
            limitExceeded = true;
            reason = 'Firestore daily write limit exceeded.';
          } else if (firestoreDeletes > LIMITS.firestore.daily.deletes) {
            limitExceeded = true;
            reason = 'Firestore daily delete limit exceeded.';
          } else if (storageBandwidth > LIMITS.storage.daily.bandwidth) {
            limitExceeded = true;
            reason = 'Storage daily bandwidth limit exceeded.';
          } else if (storageOperations > LIMITS.storage.daily.operations) {
            limitExceeded = true;
            reason = 'Storage daily operations limit exceeded.';
          } else if (storageStored > LIMITS.storage.total.stored) {
            limitExceeded = true;
            reason = 'Storage total stored limit exceeded.';
          } else if (functionsInvocations > LIMITS.functions.monthly.invocations) {
            limitExceeded = true;
            reason = 'Functions monthly invocations limit exceeded.';
          } // Add other checks if needed

          if (limitExceeded) {
            setLimitsExceeded(true);
            await setDoc(doc(db, 'config', 'shutdown'), {
              shutdown: true,
              reason: reason,
              timestamp: new Date()
            });
            // Calculate time until Pacific midnight (PST/PDT)
            const now = new Date();
            // Pacific time is UTC-8 (PST) or UTC-7 (PDT), but for simplicity use PST
            const pacificOffset = -8; // PST
            const nowPacific = new Date(now.getTime() + (pacificOffset * 60 * 60 * 1000));
            const pacificMidnight = new Date(nowPacific);
            pacificMidnight.setHours(24, 0, 0, 0);
            const timeUntilReset = pacificMidnight.getTime() - now.getTime();
            const hours = Math.floor(timeUntilReset / (1000 * 60 * 60));
            const minutes = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));
            console.log(`Limits exceeded. Daily reset in ${hours}h ${minutes}m (Pacific time)`);
          } else {
            setLimitsExceeded(false);
            // Reset shutdown flag if limits are no longer exceeded
            await setDoc(doc(db, 'config', 'shutdown'), {
              shutdown: false,
              reason: 'Limits reset',
              timestamp: new Date()
            });
          }
        } catch (error) {
          console.error('Error checking limits:', error);
        }
      }
    });

    if (num && code && name) {
      setCurrentView('dashboard');
    }

    return () => unsubscribe();
  }, []);

  // Prevent opening devtools or context menu unless the special admin number is present
  useEffect(() => {
    const special = '01001308280';

    const onKeyDown = (e: KeyboardEvent) => {
      const storedNumber = localStorage.getItem("Number")?.trim();
      if (storedNumber !== special) {
        // Block common devtools shortcuts
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || (e.ctrlKey && e.key === 'U')) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    };

    const onContext = (e: MouseEvent) => {
      const storedNumber = localStorage.getItem("Number")?.trim();
      if (storedNumber !== special) {
        e.preventDefault();
      }
    };

    let intervalId: number | undefined;

    // Fetch storedNumber right before checking for interval setup
    const currentStoredNumberAtEffectRun = localStorage.getItem("Number")?.trim();
    if (currentStoredNumberAtEffectRun !== special) {
      intervalId = window.setInterval(() => {
        const startTime = performance.now();
        debugger;
        const endTime = performance.now();
        if (endTime - startTime > 100) {
          // Devtools are likely open
          console.clear();
          // You could also redirect or blank the page
          // window.location.href = 'about:blank';
        }
      }, 500);
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onContext, true);

    return () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('contextmenu', onContext, true);
    };
  }, []);

  const handleLoginSuccess = () => {
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    localStorage.clear();
    setCurrentView('login');
  };

  if (limitsExceeded === true) {
    return (
      <main className="relative h-screen w-full flex overflow-hidden bg-app-base text-white font-sans">
        {/* Abstract Background Elements */}
        <div className="bg-gradient-radial"></div>
        <div className="bg-orb-1"></div>
        <div className="bg-orb-2"></div>

        <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
          <div className="text-center">
            <ShieldAlert size={80} className="text-error mb-6 mx-auto" />
            <h1 className="text-6xl font-extrabold text-error tracking-tight mb-2">Limits Exceeded</h1>
            <p className="text-lg text-muted mb-4">Access Denied</p>
            <p className="text-sm text-dim">Daily reset in {resetTimer}</p>
          </div>
        </div>
      </main>
    );
  }

  if (limitsExceeded === null) {
    return (
      <main className="relative h-screen w-full flex overflow-hidden bg-app-base text-white font-sans">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-lg">Checking limits...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-full flex overflow-hidden bg-app-base text-white font-sans">
      {/* Abstract Background Elements */}
      <div className="bg-gradient-radial"></div>
      <div className="bg-orb-1"></div>
      <div className="bg-orb-2"></div>

      <div className="relative z-10 w-full h-full">
        {currentView === 'login' ? (
          <div className="flex items-center justify-center h-full p-4">
            <LoginPage onLoginSuccess={handleLoginSuccess} />
          </div>
        ) : currentView === 'dashboard' ? (
            <MainPage
              onLogout={handleLogout}
              onNavigateAdmin={() => setCurrentView('admin')}
              isAdmin={isAdmin}
            />
          ) : (
           <AdminDashboard onBack={() => setCurrentView('dashboard')} />
         )}
      </div>
    </main>
  );
};

export default App;
