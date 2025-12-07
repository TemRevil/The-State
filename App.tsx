import React, { useState, useEffect } from 'react';
import './components/arabicFontDetector.js';
import { LoginPage } from './components/LoginPage';
import { MainPage } from './components/MainPage';
import { AdminDashboard } from './components/AdminDashboard';
import { UsageToast } from './components/UsageToast';
import { ScreenshotGuard } from './components/ScreenshotGuard';
import { auth, db, functions } from './firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ShieldAlert } from 'lucide-react';

// Enable/disable limits for testing
const ENABLE_LIMITS = true;

// Firebase Spark Plan Limits
const LIMITS = {
  firestore: {
    daily: {
      reads: 50000,
      writes: 20000,
      deletes: 20000
    },
    monthly: {
      reads: 50000 * 30, // ~1.5M (Soft limit for safety)
      writes: 20000 * 30,
      deletes: 20000 * 30
    }
  },
  storage: {
    daily: {
      bandwidth: 1024 * 1024 * 1024, // 1 GB in bytes
      operations: 20000 // Approximate daily limit for Spark
    },
    monthly: {
      bandwidth: 1024 * 1024 * 1024 * 30, // 30 GB
      operations: 20000 * 30
    },
    total: {
      stored: 5 * 1024 * 1024 * 1024 // 5 GB
    }
  }
};

interface LimitExceededState {
  exceeded: boolean;
  reason: string;
  resetType: 'daily-pacific' | 'daily-utc' | 'monthly-utc';
  usage?: string;
  limit?: string;
}

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'login' | 'dashboard' | 'admin'>('login');
  const [isAdmin, setIsAdmin] = useState(false);
  const [limitsExceeded, setLimitsExceeded] = useState<LimitExceededState | null>(null);
  const [resetTimer, setResetTimer] = useState<string>('');

  /**
   * Get Pacific timezone offset in hours (negative value)
   */
  const getPacificOffset = (date: Date): number => {
    const year = date.getFullYear();
    // DST calculations...
    let dstStart = new Date(year, 2, 1);
    while (dstStart.getDay() !== 0) dstStart.setDate(dstStart.getDate() + 1);
    dstStart.setDate(dstStart.getDate() + 7);
    dstStart.setHours(2, 0, 0, 0);

    let dstEnd = new Date(year, 10, 1);
    while (dstEnd.getDay() !== 0) dstEnd.setDate(dstEnd.getDate() + 1);
    dstEnd.setHours(2, 0, 0, 0);

    const isDST = date >= dstStart && date < dstEnd;
    return isDST ? -7 : -8;
  };

  /**
   * Calculate time until next reset based on reset type
   */
  const calculateResetTimer = (resetType: 'daily-pacific' | 'daily-utc' | 'monthly-utc') => {
    const now = new Date();
    let resetTime: Date;

    if (resetType === 'monthly-utc') {
      const nextMonth = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1;
      const nextYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
      resetTime = new Date(Date.UTC(nextYear, nextMonth, 1, 0, 0, 0, 0));
    } else if (resetType === 'daily-utc') {
      resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    } else {
      // Daily Pacific - reset at Pacific midnight
      const offset = getPacificOffset(now);
      const resetHourUTC = -offset; // 8 or 7
      const currentUTCHours = now.getUTCHours();
      const currentUTCFullYear = now.getUTCFullYear();
      const currentUTCMonth = now.getUTCMonth();
      const currentUTCDate = now.getUTCDate();
      let resetUTCDate = currentUTCDate;
      let resetUTCMonth = currentUTCMonth;
      let resetUTCYear = currentUTCFullYear;
      if (currentUTCHours >= resetHourUTC) {
        resetUTCDate += 1;
        const daysInMonth = new Date(currentUTCFullYear, currentUTCMonth + 1, 0).getDate();
        if (resetUTCDate > daysInMonth) {
          resetUTCDate = 1;
          resetUTCMonth += 1;
          if (resetUTCMonth > 11) {
            resetUTCMonth = 0;
            resetUTCYear += 1;
          }
        }
      }
      resetTime = new Date(Date.UTC(resetUTCYear, resetUTCMonth, resetUTCDate, resetHourUTC, 0, 0, 0));
    }

    const timeUntilReset = resetTime.getTime() - now.getTime();
    const days = Math.floor(timeUntilReset / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeUntilReset % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeUntilReset % (1000 * 60)) / 1000);

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const getResetDescription = (resetType: 'daily-pacific' | 'daily-utc' | 'monthly-utc'): string => {
    const now = new Date();
    const pacificOffset = getPacificOffset(now);
    const isDST = pacificOffset === -7;
    if (resetType === 'monthly-utc') return 'Resets: 1st of next month at 00:00 UTC';
    if (resetType === 'daily-utc') return 'Resets: Next day at 00:00 UTC';
    return `Resets: Next day at 00:00 Pacific Time (${isDST ? 'PDT/UTC-7' : 'PST/UTC-8'})`;
  };

  useEffect(() => {
    if (limitsExceeded?.exceeded) {
      const interval = setInterval(() => {
        setResetTimer(calculateResetTimer(limitsExceeded.resetType));
      }, 1000);
      setResetTimer(calculateResetTimer(limitsExceeded.resetType));
      return () => clearInterval(interval);
    }
  }, [limitsExceeded]);


  const checkLimits = async (retryCount = 0): Promise<void> => {
    const MAX_RETRIES = 3;
    const TIMEOUT_MS = 15000;

    try {
      // First, check if there's a manual shutdown flag in Firestore (fallback)
      try {
        const shutdownDoc = await getDoc(doc(db, 'config', 'shutdown'));
        if (shutdownDoc.exists()) {
          const shutdownData = shutdownDoc.data();
          if (shutdownData?.shutdown === true) {
            console.log('Shutdown flag found in Firestore');
            setLimitsExceeded({
              exceeded: true,
              reason: shutdownData.reason || 'Service temporarily unavailable',
              resetType: shutdownData.resetType || 'daily-pacific',
              usage: shutdownData.usage,
              limit: shutdownData.limit
            });
            return;
          }
        }
      } catch (firestoreError) {
        console.warn('Could not check shutdown document:', firestoreError);
      }

      const getUsage = httpsCallable(functions, 'getFirebaseUsage');

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('TIMEOUT: Cloud Function did not respond. This usually means you need to upgrade to Firebase Blaze plan.'));
        }, TIMEOUT_MS);
      });

      const result = await Promise.race([
        getUsage({ mode: '30d' }),
        timeoutPromise
      ]) as any;

      const data = result.data as any;

      if (!data || !data.firestore || !data.storage) {
        console.error('Invalid data structure from getFirebaseUsage:', data);
        setLimitsExceeded({ exceeded: false, reason: '', resetType: 'daily-pacific' });
        return;
      }

      console.log('Limit Check Data:', data);

      // Extract Totals
      const monthly = data;
      const totalStorageStored = data.storage.bytesStored;

      let limitExceeded = false;
      let reason = '';
      let resetType: 'daily-pacific' | 'daily-utc' | 'monthly-utc' = 'daily-pacific';
      let usage = '';
      let limit = '';

      // Check MONTHLY Firestore Limits
      console.log(`Monthly Firestore reads: ${monthly.firestore.reads.total.toLocaleString()} / ${LIMITS.firestore.monthly.reads.toLocaleString()}`);
      if (monthly.firestore.reads.total > LIMITS.firestore.monthly.reads) {
        limitExceeded = true;
        reason = 'Monthly Firestore read limit exceeded';
        usage = monthly.firestore.reads.total.toLocaleString();
        limit = LIMITS.firestore.monthly.reads.toLocaleString();
        resetType = 'monthly-utc';
      } else {
        console.log(`Monthly Firestore writes: ${monthly.firestore.writes.total.toLocaleString()} / ${LIMITS.firestore.monthly.writes.toLocaleString()}`);
        if (monthly.firestore.writes.total > LIMITS.firestore.monthly.writes) {
          limitExceeded = true;
          reason = 'Monthly Firestore write limit exceeded';
          usage = monthly.firestore.writes.total.toLocaleString();
          limit = LIMITS.firestore.monthly.writes.toLocaleString();
          resetType = 'monthly-utc';
        } else {
          console.log(`Total Storage: ${(totalStorageStored / (1024 * 1024 * 1024)).toFixed(2)} GB / ${(LIMITS.storage.total.stored / (1024 * 1024 * 1024)).toFixed(2)} GB`);
          if (totalStorageStored > LIMITS.storage.total.stored) {
            limitExceeded = true;
            reason = 'Total Storage capacity exceeded';
            usage = `${(totalStorageStored / (1024 * 1024 * 1024)).toFixed(2)} GB`;
            limit = `${(LIMITS.storage.total.stored / (1024 * 1024 * 1024)).toFixed(2)} GB`;
            resetType = 'monthly-utc';
          }
        }
      }

      if (limitExceeded) {
        setLimitsExceeded({ exceeded: true, reason, resetType, usage, limit });
        await setDoc(doc(db, 'config', 'shutdown'), {
          shutdown: true,
          reason: reason,
          resetType: resetType,
          usage: usage,
          limit: limit,
          timestamp: new Date(),
          resetTime: calculateResetTimer(resetType)
        });
      } else {
        setLimitsExceeded({ exceeded: false, reason: '', resetType: 'daily-pacific' });
        await setDoc(doc(db, 'config', 'shutdown'), { shutdown: false });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Limits check failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, errorMessage);

      // Retry logic
      if (retryCount < MAX_RETRIES - 1) {
        console.log(`Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        return checkLimits(retryCount + 1);
      }

      // After all retries failed, check Firestore shutdown doc as fallback
      try {
        const shutdownDoc = await getDoc(doc(db, 'config', 'shutdown'));
        if (shutdownDoc.exists() && shutdownDoc.data()?.shutdown === true) {
          const data = shutdownDoc.data();
          setLimitsExceeded({
            exceeded: true,
            reason: data.reason || 'Limits exceeded',
            resetType: data.resetType || 'daily-pacific',
            usage: data.usage,
            limit: data.limit
          });
          return;
        }
      } catch {
        // Firestore fallback also failed
      }

      // All methods failed - allow app to work but log the issue
      console.warn('=== IMPORTANT: All limit checking methods failed ===');
      console.warn('If you are on Firebase Spark (free) plan, upgrade to Blaze to use Cloud Functions with external API calls.');
      console.warn('The getFirebaseUsage function requires @google-cloud/monitoring which makes outbound network requests.');
      setLimitsExceeded({ exceeded: false, reason: '', resetType: 'daily-pacific' });
    }
  };

  useEffect(() => {
    if (ENABLE_LIMITS) {
      checkLimits();
    } else {
      setLimitsExceeded({ exceeded: false, reason: '', resetType: 'daily-pacific' });
    }
  }, []);

  useEffect(() => {
    const num = localStorage.getItem("Number");
    const code = localStorage.getItem("Code");
    const name = localStorage.getItem("Name");

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setIsAdmin(!!user);
      if (ENABLE_LIMITS && user) {
        await checkLimits();
      } else if (ENABLE_LIMITS && !user) {
        setLimitsExceeded({ exceeded: false, reason: '', resetType: 'daily-pacific' });
      }
    });

    if (num && code && name) {
      setCurrentView('dashboard');
    }

    return () => unsubscribe();
  }, []);

  // ... (Keep your DevTools protection and render logic the same) ...
  // DevTools protection
  useEffect(() => {
    const special = '01001308280';
    const onKeyDown = (e: KeyboardEvent) => {
      const storedNumber = localStorage.getItem("Number")?.trim();
      if (storedNumber !== special) {
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || (e.ctrlKey && e.key === 'U')) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    };
    const onContext = (e: MouseEvent) => {
      const storedNumber = localStorage.getItem("Number")?.trim();
      if (storedNumber !== special) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onContext, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('contextmenu', onContext, true);
    };
  }, []);

  const handleLoginSuccess = () => setCurrentView('dashboard');
  const handleLogout = () => {
    localStorage.clear();
    setCurrentView('login');
  };

  if (limitsExceeded === null) {
    return (
      <main className="relative h-screen w-full flex overflow-hidden bg-app-base text-white font-sans">
        <div className="w-full flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-lg">Checking limits...</p>
          </div>
        </div>
      </main>
    );
  }

  if (limitsExceeded.exceeded) {
    // Error screen render logic...
    const now = new Date();
    const pacificOffset = getPacificOffset(now);
    const isDST = pacificOffset === -7;

    return (
      <main className="relative h-screen w-full flex overflow-hidden bg-app-base text-white font-sans">
        <div className="bg-gradient-radial"></div>
        <div className="bg-orb-1"></div>
        <div className="bg-orb-2"></div>
        <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
          <div className="text-center max-w-2xl">
            <ShieldAlert size={80} className="text-error mb-6 mx-auto" />
            <h1 className="text-6xl font-extrabold text-error tracking-tight mb-2">Limits Exceeded</h1>
            <p className="text-lg text-muted mb-4">Access Denied</p>
            <div className="bg-black bg-opacity-30 rounded-lg p-6">
              <p className="text-sm text-white font-semibold">{limitsExceeded.reason}</p>
              <div className="border-t border-gray-600 pt-4">
                <div>
                  <p className="text-xs text-dim">Time until reset:</p>
                  <p className="text-xl text-white font-mono">{resetTimer}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <ScreenshotGuard enabled={true} warningDuration={3000}>
      <main className="relative h-screen w-full flex overflow-hidden bg-app-base text-white font-sans" style={{ backdropFilter: 'blur(12px)' }}>
        <UsageToast />
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
    </ScreenshotGuard>
  );
};

export default App;