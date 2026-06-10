import React, { useState } from 'react';
import { Loader2, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth, DEMO } from '../lib/auth';

// Demo login. Anyone can sign in with the credentials shown right on the card —
// this is an intentionally open sandbox for testing the CRM.
export default function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState(DEMO.username);
  const [password, setPassword] = useState(DEMO.password);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await signIn(username, password);
    } catch {
      setError('Sign-in failed. Use the demo credentials shown below.');
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><ShieldCheck size={30} /></div>
        <h1>The State CRM</h1>
        <p className="muted">Sign in to the demo workspace</p>

        <label className="field">
          <span className="field-label">Username or email</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" /> : <>Enter workspace <ArrowRight size={16} /></>}
        </button>

        <div className="demo-hint">
          <strong>Demo access — anyone can sign in</strong>
          <span>username <code>{DEMO.username}</code> · password <code>{DEMO.password}</code></span>
        </div>
      </form>
    </div>
  );
}
