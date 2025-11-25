
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
    const allowed = localStorage.getItem('Number') === special;

    const onKeyDown = (e: KeyboardEvent) => {
      if (allowed) return;
      // Block common devtools shortcuts
      if (e.key === 'F12') { e.preventDefault(); e.stopImmediatePropagation(); }
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) { e.preventDefault(); e.stopImmediatePropagation(); }
      if (e.ctrlKey && e.key === 'U') { e.preventDefault(); e.stopImmediatePropagation(); }
    };

    const onContext = (e: MouseEvent) => {
      if (allowed) return;
      e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onContext, true);

    return () => {
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
