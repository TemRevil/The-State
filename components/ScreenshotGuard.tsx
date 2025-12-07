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
 * SMART Detection - Only triggers on actual screenshot attempts:
 * 1. Rapid visibility flicker (hidden then visible within 300ms) - screenshot pattern
 * 2. Print Screen and screenshot keyboard shortcuts
 * 3. Print attempts (Ctrl+P / beforeprint)
 * 
 * Does NOT trigger on:
 * - Normal tab switching
 * - Leaving the app
 * - Switching to another window
 */
export const ScreenshotGuard: React.FC<ScreenshotGuardProps> = ({
  children,
  enabled = true,
  warningDuration = 3000
}) => {
  const [screenshotAttempt, setScreenshotAttempt] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hiddenTimestampRef = useRef<number | null>(null);

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
     * SMART Visibility Detection
     * 
     * Screenshots on mobile typically cause a rapid "flicker":
     * - Page goes hidden briefly (screen flash)
     * - Page comes back visible very quickly (< 300ms)
     * 
     * Normal behavior (tab switching, leaving app):
     * - Page goes hidden and STAYS hidden for longer
     * - User intentionally left, so don't trigger
     */
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page just became hidden - record the timestamp
        hiddenTimestampRef.current = Date.now();
      } else {
        // Page became visible again
        if (hiddenTimestampRef.current !== null) {
          const hiddenDuration = Date.now() - hiddenTimestampRef.current;

          // If hidden for less than 300ms, it's likely a screenshot flicker
          // Normal tab switching takes longer than this
          if (hiddenDuration < 300) {
            showWarning();
          }

          hiddenTimestampRef.current = null;
        }
      }
    };

    /**
     * Keyboard Shortcut Prevention (Desktop)
     * These are definite screenshot attempts
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      // Print Screen key
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault();
        showWarning();
        // Clear clipboard
        navigator.clipboard?.writeText('').catch(() => { });
        return false;
      }

      // Windows Snipping Tool: Win + Shift + S
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showWarning();
        return false;
      }

      // Mac Screenshot: Cmd + Shift + 3 or Cmd + Shift + 4
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) {
        e.preventDefault();
        showWarning();
        return false;
      }

      // Ctrl + P (Print - can be used to save as PDF)
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        showWarning();
        return false;
      }
    };

    /**
     * Before Print Detection
     * Definite capture attempt
     */
    const handleBeforePrint = () => {
      showWarning();
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeprint', handleBeforePrint);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeprint', handleBeforePrint);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, showWarning]);

  // CSS-based protection styles
  const protectionStyles: React.CSSProperties = enabled ? {
    WebkitUserSelect: 'none',
    userSelect: 'none',
    WebkitTouchCallout: 'none',
  } : {};

  return (
    <div style={protectionStyles} className="screenshot-guard-wrapper">
      {children}

      {/* Screenshot Detection Overlay */}
      {screenshotAttempt && (
        <div className="screenshot-guard-overlay">
          <div className="screenshot-guard-content">
            <div className="screenshot-guard-icon-container">
              <ShieldX size={80} className="screenshot-guard-icon" />
              <Camera size={40} className="screenshot-guard-camera-icon" />
            </div>
            <h2 className="screenshot-guard-title">Screenshot Blocked</h2>
            <p className="screenshot-guard-message">
              Screenshots are not allowed for this content
            </p>
            <div className="screenshot-guard-warning">
              <AlertTriangle size={16} />
              <span>This attempt has been recorded</span>
            </div>
            {attemptCount > 1 && (
              <p className="screenshot-guard-attempts">
                Attempts: {attemptCount}
              </p>
            )}
          </div>
        </div>
      )}

      {/* CSS protection layer */}
      <style>{`
        .screenshot-guard-wrapper {
          position: relative;
        }
        
        /* Make content unselectable */
        .screenshot-guard-wrapper * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
        }
        
        /* Allow selection in input fields */
        .screenshot-guard-wrapper input,
        .screenshot-guard-wrapper textarea {
          -webkit-user-select: text !important;
          user-select: text !important;
        }
        
        /* Overlay styles */
        .screenshot-guard-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.98) 0%, rgba(30, 0, 0, 0.98) 100%);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: screenshotGuardFadeIn 0.15s ease-out;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        
        @keyframes screenshotGuardFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .screenshot-guard-content {
          text-align: center;
          padding: 2rem;
          animation: screenshotGuardSlideUp 0.3s ease-out;
        }
        
        @keyframes screenshotGuardSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .screenshot-guard-icon-container {
          position: relative;
          display: inline-block;
          margin-bottom: 1.5rem;
        }
        
        .screenshot-guard-icon {
          color: #ef4444;
          animation: screenshotGuardPulse 1s ease-in-out infinite;
        }
        
        .screenshot-guard-camera-icon {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #ef4444;
          opacity: 0.3;
        }
        
        @keyframes screenshotGuardPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        
        .screenshot-guard-title {
          font-size: 2rem;
          font-weight: 800;
          color: #ef4444;
          margin: 0 0 0.75rem 0;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        
        .screenshot-guard-message {
          font-size: 1rem;
          color: rgba(255, 255, 255, 0.7);
          margin: 0 0 1.5rem 0;
        }
        
        .screenshot-guard-warning {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(245, 158, 11, 0.2);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #fbbf24;
          padding: 0.5rem 1rem;
          border-radius: 9999px;
          font-size: 0.875rem;
        }
        
        .screenshot-guard-attempts {
          margin-top: 1rem;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
        }
        
        /* Print protection */
        @media print {
          .screenshot-guard-wrapper { display: none !important; }
          body::before {
            content: "Printing is not allowed";
            display: flex;
            width: 100vw;
            height: 100vh;
            background: #000;
            color: #fff;
            font-size: 2rem;
            align-items: center;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default ScreenshotGuard;
