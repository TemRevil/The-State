
import React, { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { DashboardPage } from './components/DashboardPage';
import { AdminDashboard } from './components/AdminDashboard';
import { auth } from './firebaseConfig';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'login' | 'dashboard' | 'admin'>('login');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const num = localStorage.getItem("Number");
    const code = localStorage.getItem("Code");
    const name = localStorage.getItem("Name");
    
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsAdmin(!!user);
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
          <DashboardPage 
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
