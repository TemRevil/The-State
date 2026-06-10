import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User,
} from 'firebase/auth';
import { auth } from '../firebaseConfig';

// ── Demo authentication ──
// This is a public demo: anyone can sign in with the credentials shown on the login
// screen. A friendly "username" maps to the seeded Firebase Auth email account, so
// testers can type `demo` instead of an email. Everyone shares one sandbox account.
export const DEMO = {
  username: 'demo',
  password: 'demo12345',
  email: 'demo@thestate.app',
};

// Accept either the username or the full email for convenience.
function resolveEmail(usernameOrEmail: string): string {
  const v = usernameOrEmail.trim().toLowerCase();
  if (v === DEMO.username) return DEMO.email;
  return v.includes('@') ? v : `${v}@thestate.app`;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signIn: (usernameOrEmail: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  signIn: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }), []);

  const signIn = async (usernameOrEmail: string, password: string) => {
    await signInWithEmailAndPassword(auth, resolveEmail(usernameOrEmail), password);
  };
  const signOut = () => fbSignOut(auth);

  return <Ctx.Provider value={{ user, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
