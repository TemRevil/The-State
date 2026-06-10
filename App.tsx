import React, { useState } from 'react';
import {
  LayoutDashboard, Kanban, Users, Building2, CheckSquare, LogOut, Loader2, ShieldCheck, RefreshCw, Sun, Moon,
} from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import { StoreProvider, useStore } from './lib/store';
import { writesUsedToday, DAILY_BUDGET } from './lib/crm';
import Login from './components/Login';
import Dashboard from './components/crm/Dashboard';
import Deals from './components/crm/Deals';
import Contacts from './components/crm/Contacts';
import Companies from './components/crm/Companies';
import Activities from './components/crm/Activities';

type View = 'dashboard' | 'deals' | 'contacts' | 'companies' | 'activities';

// Light/dark toggle. The pre-paint script in index.html already set data-theme on
// <html>; this reads it, flips it, and persists the choice.
function useThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
  );
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* ignore */ }
  };
  return { theme, toggle };
}

const NAV: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { key: 'deals', label: 'Deals', icon: <Kanban size={16} /> },
  { key: 'contacts', label: 'Contacts', icon: <Users size={16} /> },
  { key: 'companies', label: 'Companies', icon: <Building2 size={16} /> },
  { key: 'activities', label: 'Activities', icon: <CheckSquare size={16} /> },
];

function Shell() {
  const { signOut, user } = useAuth();
  const { loading, error, refresh } = useStore();
  const [view, setView] = useState<View>('dashboard');
  const { theme, toggle } = useThemeToggle();

  return (
    <div className="app">
      <header className="topnav">
        <div className="topnav-brand"><ShieldCheck size={20} /> <span>The State</span></div>
        <nav className="tabs" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.key} className={`tab ${view === n.key ? 'active' : ''}`} onClick={() => setView(n.key)} aria-current={view === n.key}>
              {n.icon}<span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="topnav-actions">
          <span className="budget-pill tnum" title="Daily demo write budget (keeps the demo on Firebase's free tier)">{writesUsedToday()} / {DAILY_BUDGET}</span>
          <button className="icon-btn" onClick={toggle} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="icon-btn" onClick={refresh} title="Reload data" aria-label="Reload data"><RefreshCw size={16} /></button>
          <button className="icon-btn" onClick={signOut} title={`Sign out — ${user?.email ?? ''}`} aria-label="Sign out"><LogOut size={17} /></button>
        </div>
      </header>

      <main className="page">
        {loading ? (
          <div className="center-fill"><Loader2 className="spin" size={28} /></div>
        ) : error ? (
          <div className="center-fill error-box">{error} <button className="btn btn-ghost" onClick={refresh}>Retry</button></div>
        ) : (
          <div className="view">
            {view === 'dashboard' && <Dashboard />}
            {view === 'deals' && <Deals />}
            {view === 'contacts' && <Contacts />}
            {view === 'companies' && <Companies />}
            {view === 'activities' && <Activities />}
          </div>
        )}
      </main>
    </div>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-fill full"><Loader2 className="spin" size={32} /></div>;
  if (!user) return <Login />;
  return <StoreProvider><Shell /></StoreProvider>;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
