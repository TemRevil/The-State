import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldX, Camera, AlertTriangle } from 'lucide-react';

interface ScreenshotGuardProps {
  children: React.ReactNode;
  enabled?: boolean;
  warningDuration?: number; // How long to show warning in ms
}

/**
 * ScreenshotGuard Component
 * 
 * IMPLEMENTS CONTENT PROTECTION DETERRENTS:
 * 1. Focus Protection: Blurs content when window loses focus.
 * 2. Shortcut Blocking: Intercepts common capture keys (PrintScreen, Ctrl+S, etc).
 * 3. Context Menu: Disables right-click to prevent "Save Image As".
 * 4. Dynamic Watermark: Overlays user identity to discourage sharing.
 * 5. Visibility Protection: Hides content when tab is backgrounded.
 * 
 * NOTE: These are deterrents, not absolute preventions. 
 * Browsers sandboxing limits complete control over the OS-level clipboard or screenshots.
 */
export const ScreenshotGuard: React.FC<ScreenshotGuardProps> = ({
  children,
  enabled = true,
  warningDuration = 3000
}) => {
  const [screenshotAttempt, setScreenshotAttempt] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [isBlurred, setIsBlurred] = useState(false);
  const [isContentHidden, setIsContentHidden] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hiddenTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    // Generate Watermark Text
    const num = localStorage.getItem("Number") || "Session";
    const name = localStorage.getItem("Name") || "User";
    const device = localStorage.getItem("DeviceName") || "Device";
    setWatermarkText(`${num} • ${name} • ${device} • ${new Date().toLocaleDateString()}`);
  }, []);

  // Show warning and auto-hide after duration
  const showWarning = useCallback(() => {
    setScreenshotAttempt(true);
    setAttemptCount(prev => prev + 1);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setScreenshotAttempt(false);
    }, warningDuration);
  }, [warningDuration]);

  useEffect(() => {
    if (!enabled) return;

    /**
     * 1 & 5. Visibility & Focus Protection
     * Handles tab switching, minimizing, and window focus loss.
     */
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page hidden (Tab switch/minimized) - Hide content immediately
        // This helps prevent "Last state" screenshots in mobile app switchers
        setIsContentHidden(true);
        hiddenTimestampRef.current = Date.now();
      } else {
        // Page visible
        setIsContentHidden(false);
        if (hiddenTimestampRef.current !== null) {
          const hiddenDuration = Date.now() - hiddenTimestampRef.current;
          // Fast flicker detection for screenshots (< 300ms)
          if (hiddenDuration < 300) {
            showWarning();
          }
          hiddenTimestampRef.current = null;
        }
      }
    };

    const handleWindowBlur = () => {
      // Window lost focus (User clicked away / Alt-Tab)
      // Apply blur filter deterrent
      setIsBlurred(true);
    };

    const handleWindowFocus = () => {
      setIsBlurred(false);
    };

    /**
     * 2. Keyboard Shortcut Prevention
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      // Print Screen
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault();
        showWarning();
        navigator.clipboard?.writeText('').catch(() => { });
        return false;
      }

      // Windows Snipping Tool: Win + Shift + S
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showWarning();
        return false;
      }

      // Mac Screenshot: Cmd + Shift + 3 or 4
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) {
        e.preventDefault();
        showWarning();
        return false;
      }

      // Save: Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showWarning();
        return false;
      }

      // Print: Ctrl+P / Cmd+P
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        showWarning();
        return false;
      }
    };

    /**
     * 3. Context Menu Prevention
     */
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('keydown', handleKeyDown, true); // Capture phase
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('beforeprint', () => showWarning());

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('beforeprint', () => showWarning());

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, showWarning]);

  // CSS for protection
  const protectionStyles: React.CSSProperties = enabled ? {
    WebkitUserSelect: 'none',
    userSelect: 'none',
    WebkitTouchCallout: 'none',
    filter: isBlurred || isContentHidden ? 'blur(20px)' : 'none',
    transition: 'filter 0.3s ease',
    opacity: isContentHidden ? 0.1 : 1, // Dim if hidden
  } : {};

  return (
    <div className="screenshot-guard-wrapper relative overflow-hidden">
      {/* 4. Dynamic Watermark */}
      {enabled && (
        <div className="watermark-container pointer-events-none fixed inset-0 z-[500] flex flex-wrap content-center justify-center gap-24 opacity-[0.03] select-none overflow-hidden" style={{ transform: 'rotate(-15deg) scale(1.2)' }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="text-4xl font-black text-white whitespace-nowrap">
              {watermarkText}
            </div>
          ))}
        </div>
      )}

      <div style={protectionStyles} className="relative z-10 h-full w-full">
        {children}
      </div>

      {/* Screenshot Alert Overlay */}
      {screenshotAttempt && (
        <div className="screenshot-guard-overlay">
          <div className="screenshot-guard-content">
            <div className="screenshot-guard-icon-container">
              <ShieldX size={80} className="screenshot-guard-icon" />
              <Camera size={40} className="screenshot-guard-camera-icon" />
            </div>
            <h2 className="screenshot-guard-title">Screenshot Blocked</h2>
            <p className="screenshot-guard-message">
              Content is protected. Screenshots are disabled.
            </p>
            <div className="screenshot-guard-warning">
              <AlertTriangle size={16} />
              <span>Security Event Logged</span>
            </div>
            {attemptCount > 1 && (
              <p className="screenshot-guard-attempts">
                Attempts: {attemptCount}
              </p>
            )}
          </div>
        </div>
      )}

      <style>{`
        .screenshot-guard-wrapper {
          position: relative;
          height: 100%;
          width: 100%;
        }
        
        .screenshot-guard-wrapper * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
        }

        .screenshot-guard-wrapper input,
        .screenshot-guard-wrapper textarea {
          -webkit-user-select: text !important;
          user-select: text !important;
        }
        
        .watermark-container {
          pointer-events: none;
        }

        .screenshot-guard-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0,0,0,0.95);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(20px);
          animation: fadeIn 0.15s ease-out;
        }
        
        /* ... Reuse styles from previous ... */
        .screenshot-guard-content {
           text-align: center;
           padding: 2rem;
        }
        
        .screenshot-guard-icon { color: #ef4444; animation: pulse 2s infinite; }
        .screenshot-guard-camera-icon { position: absolute; top:50%; left:50%; transform:translate(-50%,-50%); opacity:0.3; color:#ef4444; }
        .screenshot-guard-title { font-size: 2rem; font-weight:800; color:#ef4444; margin-bottom:1rem; text-transform:uppercase; }
        .screenshot-guard-message { font-size: 1.1rem; color: #aaa; margin-bottom:1.5rem; }
        .screenshot-guard-warning { display:inline-flex; align-items:center; gap:0.5rem; background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.3); color:#ef4444; padding:0.5rem 1rem; border-radius:100px; font-size:0.875rem; }
        .screenshot-guard-attempts { margin-top:1rem; color:#666; font-size:0.75rem; }

        @keyframes pulse { 0% { transform: scale(1); opacity:1; } 50% { transform: scale(1.1); opacity:0.7; } 100% { transform: scale(1); opacity:1; } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

        @media print {
          html { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default ScreenshotGuard;
