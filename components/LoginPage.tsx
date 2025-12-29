import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Lock, ChevronRight, CheckCircle2, ShieldAlert, Ban, UserPlus, Copy, Check } from 'lucide-react';
import { auth, db, firebaseConfig } from '../firebaseConfig';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from '../utils/firebaseMonitored';
import { UAParser } from 'ua-parser-js';

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

  try {
    const parser = new UAParser();
    const result = parser.getResult();

    // 1. Try High Entropy (Model Priority)
    let heModel = '';
    let hePlatform = '';

    // @ts-ignore
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      try {
        // @ts-ignore
        const uaData = await navigator.userAgentData.getHighEntropyValues(['platform', 'platformVersion', 'model']);

        if (uaData.model && uaData.model !== 'Unknown') {
          heModel = uaData.model;
        }

        const platform = uaData.platform || '';
        const majorVersion = parseInt(uaData.platformVersion?.split('.')[0] || '0');

        if (platform === 'Windows') {
          hePlatform = majorVersion >= 13 ? 'Windows 11' : 'Windows 10';
        } else {
          hePlatform = platform;
        }
      } catch (e) {
        console.warn("High entropy detection failed", e);
      }
    }

    // 2. Parse basic UA
    const vendor = result.device.vendor;
    const model = result.device.model;
    const type = result.device.type; // mobile, tablet, consol, smarttv, wearable, embedded
    const osName = result.os.name;
    const osVer = result.os.version;
    const browser = result.browser.name;

    let finalName = "";

    // PRIORITY 1: Hardware Model (Mobile/Tablet usually, or High Entropy Desktop)
    if (heModel) {
      finalName = heModel; // "Pixel 6", "SM-G991B"
    } else if (vendor && model) {
      finalName = `${vendor} ${model}`; // "Samsung SM-G991B"
    } else if (model) {
      finalName = model;
    }

    // PRIORITY 2: Fallback for Desktop (Generic "PC" or "Mac")
    // If no specific model is found, we should name the DEVICE, not just the OS.
    if (!finalName) {
      if (osName === 'Windows') {
        finalName = "Windows PC"; // Generic Device Name
      } else if (osName === 'Mac OS') {
        finalName = "Macintosh";
      } else if (type === 'mobile') {
        finalName = "Mobile Device";
      } else if (type === 'tablet') {
        finalName = "Tablet";
      } else {
        finalName = "Desktop PC";
      }
    }

    // Append OS info if not already obvious (user wants Model, but Context implies OS helps)
    // "Windows PC (Windows 11)"
    let osString = hePlatform || (osName ? `${osName} ${osVer || ''}` : '');

    // Fix Windows 11/10 ambiguity if not resolved by HE
    if (!hePlatform && osName === 'Windows' && osVer === '10') {
      osString = 'Windows 10/11';
    }

    if (finalName && osString && !finalName.includes(osString)) {
      finalName = `${finalName} (${osString})`;
    }

    // Append Browser for final context
    if (browser) {
      finalName = `${finalName} - ${browser}`;
    }

    finalName = finalName.trim();

    if (finalName && finalName !== 'Unknown') {
      localStorage.setItem("DeviceName", finalName);
      return finalName;
    }

  } catch (e) {
    console.error("Device name generation failed", e);
  }

  // Final Fallback
  n = navigator.platform || "Unknown Device";
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
    const lastBlockedNumber = localStorage.getItem('lastBlockedNumber');
    if (lastBlockedNumber) {
      const fetchBlockReason = async () => {
        const blockedDocRef = doc(db, "Blocked", lastBlockedNumber);
        const blockedDocSnap = await getDoc(blockedDocRef);
        if (blockedDocSnap.exists()) {
          setPhoneValue(lastBlockedNumber);
          setIsBlocked(true);
          setBlockReason(blockedDocSnap.data().Reason || 'Reason not specified.');
        } else {
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
      localStorage.removeItem('lastBlockedNumber');
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
    <div className="login-view-v2">
      <div className="login-backdrop-blur"></div>

      <div className={`login-card-v2 ${isBlocked ? 'border-error' : ''}`}>
        {/* Status Indicator */}
        <div className="absolute flex items-center gap-2" style={{ top: '32px', right: '32px' }}>
          <div
            className="login-status-dot"
            style={{
              color: isAuthenticated ? 'var(--success)' : 'var(--warning)',
              backgroundColor: isAuthenticated ? 'var(--success)' : 'var(--warning)'
            }}
          />
        </div>

        <div className="mb-6 mt-2 flex flex-col items-center">
          <div
            className={`rounded-3xl flex items-center justify-center mb-8 transition-all ${isBlocked ? 'text-error' : 'text-main'
              }`}
            style={{
              width: '80px',
              height: '80px',
              border: '1px solid',
              borderColor: isBlocked ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              background: isBlocked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)'
            }}
          >
            {isBlocked ? <Ban size={36} /> : (step === 3 ? <UserPlus size={36} /> : <Lock size={36} />)}
          </div>
          <h1 className="text-3xl font-bold text-main tracking-tight uppercase mb-2" style={{ fontSize: '2.25rem', fontWeight: 900 }}>
            {isBlocked ? 'Restricted' : (step === 3 ? 'Setup' : 'The State')}
          </h1>
          <p className={`text-lg text-center font-medium ${isBlocked ? 'text-error' : 'text-muted'}`} style={{ maxWidth: '280px', lineHeight: '1.3', opacity: isBlocked ? 0.8 : 0.4 }}>
            {isBlocked ? 'This identity has been flagged for security review.' : (step === 1 ? 'Please enter your identity number' : (step === 3 ? 'Create your official profile' : 'Confirm your security token'))}
          </p>
        </div>

        <form onSubmit={step === 1 ? handleVerifyStep : (step === 2 ? handleFinalLogin : handleNameUpdate)} className="flex flex-col w-full relative z-10">
          {step !== 3 ? (
            <div className="flex flex-col" style={{ gap: '20px' }}>
              <div className="relative w-full flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={phoneValue}
                  onChange={handlePhoneChange}
                  placeholder="000 0000 0000"
                  className={`login-input w-full text-center font-mono tracking-wider ${error && step === 1 ? 'error' : ''}`}
                  style={{ fontSize: '1.5rem', letterSpacing: '0.1em' }}
                />
                {step === 2 && (
                  <div className="absolute flex items-center justify-center text-success" style={{ right: '20px', opacity: 0.8 }}>
                    <CheckCircle2 size={24} />
                  </div>
                )}
              </div>

              {step === 2 && (
                <div className="animate-slide-up w-full">
                  <div className="relative w-full flex items-center">
                    <input
                      ref={apiKeyRef}
                      type="text"
                      value={apiKeyValue}
                      onChange={(e) => canEditKey && setApiKeyValue(e.target.value)}
                      readOnly={!canEditKey}
                      placeholder={canEditKey ? "Paste security token..." : "Token missing..."}
                      className={`login-input w-full font-mono text-xs ${!canEditKey ? 'text-success opacity-70' : ''}`}
                      style={{
                        paddingLeft: 'var(--space-lg)',
                        paddingRight: '56px',
                        paddingTop: 'var(--space-md)',
                        paddingBottom: 'var(--space-md)',
                        height: 'auto',
                        minHeight: '72px',
                        cursor: !canEditKey ? 'default' : 'text',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderColor: 'rgba(255, 255, 255, 0.05)',
                        wordBreak: 'break-all',
                        lineHeight: '1.5',
                        letterSpacing: '0.02em'
                      }}
                    />
                    <div className="absolute" style={{ right: '12px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (apiKeyValue) {
                            navigator.clipboard.writeText(apiKeyValue);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }
                        }}
                        className="flex items-center justify-center rounded-xl border transition-all"
                        style={{
                          width: '40px',
                          height: '40px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                          color: 'rgba(255, 255, 255, 0.4)'
                        }}
                        title="Copy Token"
                      >
                        {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="animate-slide-up flex flex-col gap-4">
              <input
                ref={nameRef}
                type="text"
                value={nameValue}
                onChange={(e) => {
                  let val = e.target.value;
                  const words = val.split(' ').filter(w => w.length > 0);
                  const limitedWords = words.map(w => w.slice(0, 8));
                  const finalWords = limitedWords.slice(0, 2);
                  const hasTrailingSpace = val.endsWith(' ') && finalWords.length < 2;
                  setNameValue(finalWords.join(' ') + (hasTrailingSpace ? ' ' : ''));
                }}
                placeholder="Your Name"
                maxLength={17}
                className="login-input text-center text-lg"
              />
              <p className="text-xs text-center uppercase font-bold tracking-wider" style={{ color: 'rgba(255, 255, 255, 0.2)', letterSpacing: '0.15em', fontWeight: 900 }}>
                Max 2 words, 8 letters each
              </p>
            </div>
          )}

          <div className="flex items-center justify-center" style={{ minHeight: '1.5rem', marginTop: '-8px' }}>
            {error && (
              <div className="flex items-center gap-2 text-xs text-error font-bold uppercase tracking-wider" style={{ animation: 'shake 0.5s' }}>
                <ShieldAlert size={14} /> {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || (step === 1 && phoneValue.length !== 11) || (step === 3 && !nameValue.trim())}
            className={`btn btn-premium-primary w-full rounded-2xl text-lg font-bold tracking-tight mb-4 ${isBlocked ? 'btn-danger' : ''}`}
            style={{ height: '64px', fontWeight: 900 }}
          >
            {isLoading ? (
              <Loader2 size={24} className="animate-spin opacity-40" />
            ) : (
              <>
                {step === 1 ? 'CONTINUE' : (step === 3 ? 'FINISH SETUP' : 'AUTHENTICATE')}
                {step === 1 && <ChevronRight size={20} style={{ marginLeft: '4px' }} />}
              </>
            )}
          </button>
        </form>

        <div className="mt-auto text-center" style={{ marginTop: '64px', opacity: 0.2 }}>
          <p className="uppercase text-xs font-bold" style={{ letterSpacing: '0.3em', fontSize: '10px', fontWeight: 900 }}>
            Authorized Access Only
          </p>
        </div>
      </div>

      {/* BLOCKED WALL OVERLAY */}
      {isBlocked && (
        <div
          className="absolute inset-0 animate-fade-in flex items-center justify-center p-8 z-20"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(100px)',
            WebkitBackdropFilter: 'blur(100px)'
          }}
        >
          <div className="text-center flex flex-col items-center" style={{ maxWidth: '420px' }}>
            <div
              className="rounded-full border flex items-center justify-center mb-8 text-error"
              style={{
                width: '96px',
                height: '96px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.2)',
                boxShadow: '0 0 50px rgba(239, 68, 68, 0.2)',
                animation: 'pulse 2s infinite'
              }}
            >
              <ShieldAlert size={48} />
            </div>
            <h2 className="text-3xl font-bold text-main mb-4 tracking-tight uppercase" style={{ fontSize: '3rem', fontWeight: 900 }}>
              Blocked
            </h2>
            <p className="text-xl font-medium" style={{ color: 'rgba(239, 68, 68, 0.8)', lineHeight: '1.6', textTransform: 'capitalize' }}>
              {blockReason}
            </p>
            <div className="rounded-full mt-8" style={{ width: '48px', height: '4px', background: 'rgba(239, 68, 68, 0.3)' }}></div>
          </div>
        </div>
      )}
    </div>
  );
};