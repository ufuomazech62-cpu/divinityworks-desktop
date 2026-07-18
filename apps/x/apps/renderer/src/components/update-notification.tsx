import { useEffect, useState, useCallback } from 'react';
import { X, Download, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

/**
 * UpdateNotification — in-app banner for desktop auto-updates.
 *
 * Listens to IPC events from the main process's autoUpdater bridge
 * (see apps/x/apps/main/src/ipc.ts registerUpdateIpc) and shows a toast
 * in the bottom-right corner when an update is available, downloading,
 * ready to install, or errored.
 *
 * Flow (Electron's built-in autoUpdater has limited event payloads):
 *   1. autoUpdater detects a new release on GitHub (via hazel)
 *   2. main forwards 'update:available' -> renderer shows banner
 *      "Update available" with [Update now] [Later] buttons
 *      (no version info yet — Electron doesn't pass it in this event)
 *   3. User clicks Update now -> renderer calls 'update:install' IPC
 *      -> autoUpdater starts downloading in the background
 *      -> banner switches to "Downloading… will restart automatically"
 *      (no progress %, just spinner)
 *   4. Download completes -> 'update:downloaded' -> auto-restart after 3s
 *      -> banner shows "Restarting…" with countdown
 *      -> app quits, installer runs, app relaunches into the new version
 *      (no user action required — fully automatic)
 *
 * If the user clicks Later, the banner dismisses for the current session.
 * It will reappear next time the app starts if the update is still pending.
 *
 * Errors are shown briefly (10s) and then auto-dismiss.
 */

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'available' }
  | { kind: 'downloading' }
  | { kind: 'restarting'; version: string; secondsLeft: number }
  | { kind: 'ready'; version: string; releaseNotes?: string | null }
  | { kind: 'error'; message: string };

const AUTO_RESTART_SECONDS = 3;

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    cleanups.push(
      window.ipc.on('update:checking', () => {
        console.log('[update] checking for updates...');
      })
    );

    cleanups.push(
      window.ipc.on('update:available', () => {
        console.log('[update] available');
        setState({ kind: 'available' });
        setDismissed(false);
      })
    );

    cleanups.push(
      window.ipc.on('update:not-available', () => {
        console.log('[update] not available (already on latest)');
        setState({ kind: 'idle' });
      })
    );

    cleanups.push(
      window.ipc.on('update:downloaded', (event: { version: string; releaseNotes?: string | null }) => {
        console.log(`[update] downloaded: v${event.version}, auto-restarting in ${AUTO_RESTART_SECONDS}s`);
        setState({ kind: 'restarting', version: event.version, secondsLeft: AUTO_RESTART_SECONDS });
        setDismissed(false);
      })
    );

    cleanups.push(
      window.ipc.on('update:error', (event: { message: string }) => {
        console.error('[update] error:', event.message);
        setState({ kind: 'error', message: event.message });
        setTimeout(() => setState({ kind: 'idle' }), 10000);
      })
    );

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  // Auto-restart countdown — when 'restarting' state is entered, count down
  // from AUTO_RESTART_SECONDS and call quitAndInstall when it hits 0.
  useEffect(() => {
    if (state.kind !== 'restarting') return;
    if (state.secondsLeft <= 0) {
      // Time's up — quit + install. This tears down the renderer.
      void window.ipc.invoke('update:install', null);
      return;
    }
    const timer = setTimeout(() => {
      setState((prev) =>
        prev.kind === 'restarting'
          ? { ...prev, secondsLeft: prev.secondsLeft - 1 }
          : prev
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [state]);

  const handleInstall = useCallback(async () => {
    // For 'available' state: trigger download (autoUpdater auto-downloads
    //   when update-available fires; calling checkForUpdates again is a no-op
    //   but the IPC handler kicks off the download if it hasn't started).
    //   We switch to 'downloading' to show the spinner.
    if (state.kind === 'available') {
      setState({ kind: 'downloading' });
    }
    await window.ipc.invoke('update:install', null);
  }, [state.kind]);

  const handleRestartNow = useCallback(async () => {
    // Skip the countdown — restart immediately
    await window.ipc.invoke('update:install', null);
  }, []);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    await window.ipc.invoke('update:dismiss', null);
  }, []);

  if (state.kind === 'idle') return null;
  if (dismissed && state.kind !== 'restarting' && state.kind !== 'ready') return null;
  // 'restarting' can't be dismissed (it's already happening)
  // 'ready' state can be dismissed but only via the explicit "Later" button

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        maxWidth: '380px',
        background: '#0a0a0a',
        color: '#fff',
        borderRadius: '12px',
        padding: '16px 18px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.15)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '14px',
        letterSpacing: '-0.01em',
        animation: 'dw-update-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes dw-update-slide-in {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes dw-update-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {state.kind === 'available' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
            <Download size={18} style={{ flexShrink: 0, marginTop: '1px', opacity: 0.9 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                Update available
              </div>
              <div style={{ fontSize: '13px', opacity: 0.7, lineHeight: 1.45 }}>
                A new version of Divinity is ready to download.
              </div>
            </div>
            <button
              onClick={handleDismiss}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: '2px',
                marginTop: '-2px',
              }}
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleInstall}
              style={{
                flex: 1,
                background: '#fff',
                color: '#0a0a0a',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Update now
            </button>
            <button
              onClick={handleDismiss}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Later
            </button>
          </div>
        </div>
      )}

      {state.kind === 'downloading' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Loader2
              size={18}
              style={{ flexShrink: 0, animation: 'dw-update-spin 1s linear infinite' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>Downloading update…</div>
              <div style={{ fontSize: '13px', opacity: 0.7 }}>
                Divinity will restart automatically when ready.
              </div>
            </div>
          </div>
        </div>
      )}

      {state.kind === 'restarting' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
            <RefreshCw
              size={18}
              style={{ flexShrink: 0, marginTop: '1px', color: '#4ade80', animation: 'dw-update-spin 1s linear infinite' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                Restarting in {state.secondsLeft}s…
              </div>
              <div style={{ fontSize: '13px', opacity: 0.7, lineHeight: 1.45 }}>
                Divinity v{state.version} is installed. The app will relaunch automatically.
              </div>
            </div>
          </div>
          <button
            onClick={handleRestartNow}
            style={{
              width: '100%',
              background: '#fff',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Restart now
          </button>
        </div>
      )}

      {state.kind === 'ready' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '1px', color: '#4ade80' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                Ready to install — v{state.version}
              </div>
              <div style={{ fontSize: '13px', opacity: 0.7, lineHeight: 1.45 }}>
                Divinity will restart to finish the update.
              </div>
            </div>
            <button
              onClick={handleDismiss}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: '2px',
                marginTop: '-2px',
              }}
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
          <button
            onClick={handleRestartNow}
            style={{
              width: '100%',
              background: '#fff',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Restart now
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px', color: '#f87171' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Update failed</div>
              <div style={{ fontSize: '13px', opacity: 0.7, lineHeight: 1.45 }}>
                {state.message}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
