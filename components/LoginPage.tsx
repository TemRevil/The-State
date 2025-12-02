
import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Lock, ChevronRight, CheckCircle2, ShieldAlert, Ban, KeyRound, UserCheck, Copy, Check, UserPlus } from 'lucide-react';
import { auth, db, firebaseConfig } from '../firebaseConfig';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from '../utils/firebaseMonitored';

const decodeNum = (k: string) => {
  let r = "";
  for (let i = 10; i < k.length && r.length < 11; i += 2) {
    if (/\d/.test(k[i])) r += k[i];
  }
  return r;
};

const genCode = () => Array.from({ length: 5 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]).join("");
const fmtDate = () => new Date().toLocaleDateString("en-GB");
const fmtTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

const getDeviceName = async () => {
  let n = localStorage.getItem("DeviceName");
  if (n) return n;
  // @ts-ignore
  if (navigator.userAgentData?.getHighEntropyValues) {
    try {
      // @ts-ignore
      const i = await navigator.userAgentData.getHighEntropyValues(["model"]);
      if (i.model?.length && i.model !== "Unknown") {
        localStorage.setItem("DeviceName", i.model);
        return i.model;
      }
    } catch { }
  }
  const ua = navigator.userAgent;
  const m = ua.match(/Android\s[\d.]+;\s([^)]+)/i);
  if (m) { n = m[1].trim(); localStorage.setItem("DeviceName", n); return n; }
  const f: [RegExp, string][] = [[/iphone/i, "iPhone"], [/ipad/i, "iPad"], [/windows/i, "Windows PC"], [/macintosh/i, "MacBook"], [/linux/i, "Linux Device"]];
  for (const [r, nm] of f) { if (r.test(ua)) { localStorage.setItem("DeviceName", nm); return nm; } }
  n = navigator.platform || "Unknown";
  localStorage.setItem("DeviceName", n);
  return n;
};

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phoneValue, setPhoneValue] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [nameValue, setNameValue] = useState('');
  const [canEditKey, setCanEditKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // On load, check if a number was previously blocked and restore the state
    const lastBlockedNumber = localStorage.getItem('lastBlockedNumber');
    if (lastBlockedNumber) {
      const fetchBlockReason = async () => {
        const blockedDocRef = doc(db, "Blocked", lastBlockedNumber);
        const blockedDocSnap = await getDoc(blockedDocRef);
        if (blockedDocSnap.exists()) {
          // If still blocked, show the wall and set the reason
          setPhoneValue(lastBlockedNumber);
          setIsBlocked(true);
          setBlockReason(blockedDocSnap.data().Reason || 'Reason not specified.');
        } else {
          // If not blocked anymore, clear local storage
          localStorage.removeItem('lastBlockedNumber');
          localStorage.removeItem('lastBlockReason');
        }
      };
      fetchBlockReason();
    } else {
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const performAutoLogin = async () => {
      if (auth.currentUser) { setIsAuthenticated(true); return; }
      try {
        await signInWithEmailAndPassword(auth, "temrevil@gmail.com", "1q2w3e");
        setIsAuthenticated(true);
      } catch (e1) {
        try {
          await signInWithEmailAndPassword(auth, "temrevil+1@gmail.com", "M074mm3d+");
          setIsAuthenticated(true);
        } catch (e2) { console.error("Auto login failed", e2); }
      }
    };
    performAutoLogin();
    return onAuthStateChanged(auth, (user) => setIsAuthenticated(!!user));
  }, []);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length <= 11) {
      setPhoneValue(val);
      if (error) setError(null);
      localStorage.removeItem('lastBlockedNumber'); // Clear blocked status when user types a new number
      localStorage.removeItem('lastBlockReason');
      if (isBlocked) setIsBlocked(false);
      if (step !== 1) {
        setStep(1); setApiKeyValue(''); setNameValue(''); setCanEditKey(false);
      }
    }
  };

  const handleVerifyStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneValue.length !== 11) return setError('ID must be exactly 11 digits');
    setIsLoading(true); setError(null); setIsBlocked(false);
    try {
      // Priority 1: Check if the number is in the Blocked collection.
      const blockedDocRef = doc(db, "Blocked", phoneValue);
      const blockedDocSnap = await getDoc(blockedDocRef);
      if (blockedDocSnap.exists()) {
        const reason = blockedDocSnap.data().Reason || 'No reason provided.';
        setBlockReason(reason);
        setIsBlocked(true);
        localStorage.setItem('lastBlockedNumber', phoneValue);
        localStorage.setItem('lastBlockReason', reason);
        setError('ACCESS DENIED: Identity flagged.');
        setIsLoading(false);
        return;
      }

      // Priority 2: Check if the number is in the Snitches collection.
      const snitchesSnap = await getDocs(collection(db, "Snitches"));
      if (snitchesSnap.docs.some(d => d.data()["The Login Number"] === phoneValue)) {
        const reason = 'Snitching attempt';
        setBlockReason(reason);
        setIsBlocked(true);
        localStorage.setItem('lastBlockedNumber', phoneValue);
        localStorage.setItem('lastBlockReason', reason);
        setError('ACCESS DENIED: Identity flagged.');
        setIsLoading(false); return;
      }

      const docRef = doc(db, "Numbers", phoneValue);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const k = firebaseConfig.apiKey;
        const token = k.slice(0, 10) + k.slice(10).split("").reduce((a, c, i) => a + (phoneValue[i % phoneValue.length] || "") + c, "");
        setApiKeyValue(token); setCanEditKey(false);
      } else {
        setApiKeyValue(''); setCanEditKey(true);
      }
      setStep(2);
      setTimeout(() => apiKeyRef.current?.focus(), 300);
    } catch { setError('System verification failed.'); } finally { setIsLoading(false); }
  };

  const handleFinalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (apiKeyValue.trim().length !== 68) { setError("Invalid Token Length"); setIsLoading(false); return; }
      const dec = decodeNum(apiKeyValue);
      if (dec !== phoneValue) {
        try {
          const sRef = collection(db, "Snitches");
          const snap = await getDocs(sRef);
          if (!snap.docs.some(d => d.data()["The Login Number"] === phoneValue)) {
            await setDoc(doc(sRef, `Match ${snap.size + 1}`), {
              "The Login Number": phoneValue, "The Snitch": dec, "Snitched Date": fmtDate(), "Snitched Time": fmtTime()
            });
            await setDoc(doc(db, "Blocked", phoneValue), {
              "Blocked Date": fmtDate(), "Blocked Time": fmtTime(), "Reason": "tried to snitch"
            });
          }
        } catch { }
        localStorage.setItem("Number", phoneValue);
        localStorage.setItem('lastBlockedNumber', phoneValue);
        localStorage.setItem('lastBlockReason', 'tried to snitch');
        setIsBlocked(true); setError("SECURITY VIOLATION DETECTED"); setIsLoading(false); return;
      }
      const devName = await getDeviceName();
      const code = genCode();
      localStorage.setItem("Number", phoneValue); localStorage.setItem("Code", code);
      const userDoc = await getDoc(doc(db, "Numbers", phoneValue));
      if (userDoc.exists()) {
        const d = userDoc.data();
        const devs = d.Devices || {};
        const map = devs["Devices Name"] || {};
        const vals = Object.values(map);
        const arch = devs.Archived || {};
        arch[Object.keys(arch).length + 1] = { Code: code, Date: fmtDate(), Time: fmtTime() };
        if (!vals.includes(devName as any)) map[Object.keys(map).length + 1] = devName;
        await updateDoc(doc(db, "Numbers", phoneValue), { Devices: { "Devices Name": map, Archived: arch } });

        if (d.Name && d.Name !== "Unknown") {
          localStorage.setItem("Name", d.Name); onLoginSuccess();
        } else {
          setStep(3); setTimeout(() => nameRef.current?.focus(), 300);
        }
      } else {
        onLoginSuccess();
      }
    } catch (err: any) {
      console.error(err);
      setError("Authentication Failed.");
    } finally { setIsLoading(false); }
  };

  const handleNameUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValue.trim()) return;
    setIsLoading(true);
    try {
      await updateDoc(doc(db, "Numbers", phoneValue), { Name: nameValue.trim() });
      localStorage.setItem("Name", nameValue.trim());
      onLoginSuccess();
    } catch { setError("Failed to update profile."); } finally { setIsLoading(false); }
  };

  return (
    <div className="login-container relative">
      <div className={`login-card ${isBlocked ? 'blocked' : ''}`}>

        {/* Status Indicator */}
        <div className="absolute top-6 right-6 flex items-center gap-2">
          <div className={`rounded-full ${isAuthenticated ? 'bg-success' : 'bg-warning'}`} style={{ width: '8px', height: '8px', boxShadow: isAuthenticated ? '0 0 10px rgba(16, 185, 129, 0.5)' : 'none' }}></div>
        </div>

        <div className="mb-8 mt-2 flex flex-col items-center">
          <div className={`rounded-full flex items-center justify-center mb-6 transition-colors ${isBlocked ? 'text-error bg-error/10' : 'text-white bg-surface'}`} style={{ width: '72px', height: '72px', border: `1px solid ${isBlocked ? 'var(--color-error-translucent)' : 'var(--color-border)'}` }}>
            {isBlocked ? <Ban size={32} /> : (step === 3 ? <UserPlus size={32} /> : <Lock size={32} />)}
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {isBlocked ? 'Restricted' : (step === 3 ? 'Setup' : 'The State')}
          </h1>
          <p className={`text-base text-center mt-2 font-medium ${isBlocked ? 'text-error' : 'text-muted'}`}>
            {isBlocked ? 'This identity has been flagged.' : (step === 1 ? 'Enter identity number' : (step === 3 ? 'Create profile' : 'Confirm security token'))}
          </p>
        </div>

        <form onSubmit={step === 1 ? handleVerifyStep : (step === 2 ? handleFinalLogin : handleNameUpdate)} className="flex flex-col gap-4 w-full">
          <div className={step === 3 ? 'hidden' : 'block'}>
            <div className="flex flex-col gap-3">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={phoneValue}
                  onChange={handlePhoneChange}
                  placeholder="000 0000 0000"
                  className={`login-input text-center font-mono text-xl ${error && step === 1 ? 'error' : ''}`}
                />
                {step === 2 && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <CheckCircle2 size={20} className="text-success" />
                  </div>
                )}
              </div>
            </div>
            {step === 2 && (
              <div className="animate-slide-up mt-4">
                <div className="relative">
                  <input
                    ref={apiKeyRef}
                    type="text"
                    value={apiKeyValue}
                    onChange={(e) => canEditKey && setApiKeyValue(e.target.value)}
                    readOnly={!canEditKey}
                    placeholder={canEditKey ? "Paste security token..." : "Token missing..."}
                    className={`login-input pl-4 pr-12 text-xs font-mono break-all ${!canEditKey ? 'text-success cursor-default opacity-90' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => { if (apiKeyValue) { navigator.clipboard.writeText(apiKeyValue); setCopied(true); setTimeout(() => setCopied(false), 2000); } }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 btn-icon"
                  >
                    {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className={`${step === 3 ? 'block' : 'hidden'} animate-slide-up`}>
            <input
              ref={nameRef}
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="Full Name"
              className="login-input text-center text-lg"
            />
          </div>
          <div style={{ minHeight: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {error && (
              <div className="flex items-center gap-2 text-xs text-error font-medium animate-shake">
                <ShieldAlert size={14} /> {error}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading || (step === 1 && phoneValue.length !== 11) || (step === 3 && !nameValue.trim())}
            className={`btn btn-primary w-full ${isBlocked ? 'btn-danger' : ''}`}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <>{step === 1 ? 'Continue' : (step === 3 ? 'Finish' : 'Authenticate')} {step === 1 && <ChevronRight size={18} />}</>}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-dim uppercase tracking-widest text-[10px] font-bold">Authorized Personnel Only</p>
        </div>
      </div>

      {/* BLOCKED WALL OVERLAY */}
      {isBlocked && (
        <div
          className="absolute inset-0 animate-fade-in flex items-center justify-center p-4 z-20"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        >
          <div className="text-center flex flex-col items-center">
            <ShieldAlert size={64} className="text-error drop-shadow-lg mb-4" />
            <h2 className="text-5xl font-extrabold text-white mb-2">Blocked</h2>
            <p className="text-lg text-red-300 capitalize">{blockReason}</p>
          </div>
        </div>
      )}
    </div>
  );
};