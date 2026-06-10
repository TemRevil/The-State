import React, { useState } from 'react';
import {
  LayoutDashboard, Kanban, Users, Building2, CheckSquare, LogOut, Loader2, ShieldCheck, RefreshCw,
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

const NAV: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { key: 'deals', label: 'Deals', icon: <Kanban size={18} /> },
  { key: 'contacts', label: 'Contacts', icon: <Users size={18} /> },
  { key: 'companies', label: 'Companies', icon: <Building2 size={18} /> },
  { key: 'activities', label: 'Activities', icon: <CheckSquare size={18} /> },
];

function Shell() {
  const { signOut, user } = useAuth();
  const { loading, error, refresh } = useStore();
  const [view, setView] = useState<View>('dashboard');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><ShieldCheck size={22} /> <span>The State CRM</span></div>
        <nav>
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${view === n.key ? 'active' : ''}`} onClick={() => setView(n.key)}>
              {n.icon} <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="budget" title="Daily demo write budget (keeps the demo on Firebase's free tier)">
            {writesUsedToday()} / {DAILY_BUDGET} writes today
          </div>
          <button className="nav-item" onClick={signOut}><LogOut size={18} /> <span>Sign out</span></button>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <span className="muted">Signed in as <strong>{user?.email}</strong></span>
          <button className="icon-btn" onClick={refresh} title="Reload data" aria-label="Reload data"><RefreshCw size={16} /></button>
        </div>

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
