import { useState, useEffect } from 'react';

/**
 * SignInGate — the first thing a user sees when they open Divinity for the
 * first time (or after signing out). Just the logo + one button.
 *
 * No onboarding, no LLM setup, no tour, no explanations. Click "Sign in with
 * Google" → browser opens → authenticate → app receives tokens via
 * divinity://auth/callback → this screen disappears and the full app loads.
 *
 * This is the same pattern Slack, Linear, Notion, and Figma use: a sign-in
 * screen before the app, not the app with a sign-in button buried in a sidebar.
 */

export function SignInGate() {
  const [isOpening, setIsOpening] = useState(false);

  // Listen for the sign-in completing (oauth:didConnect fires from main when
  // the divinity://auth/callback deep link arrives with tokens). The parent
  // App component re-renders when useRowboatAccount().signedIn flips to true,
  // so this component just needs to handle the button click.
  useEffect(() => {
    const cleanup = window.ipc.on('oauth:didConnect', () => {
      setIsOpening(false);
    });
    return cleanup;
  }, []);

  const handleSignIn = async () => {
    setIsOpening(true);
    // This calls connectProvider('rowboat') in the main process, which opens
    // the browser to dash.divinityworks.space/signin?desktop=1
    await window.ipc.invoke('oauth:connect', { provider: 'rowboat' });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: '#fff',
        fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: '40px' }}>
        <img
          src="https://divinityworks.space/i/logo.png"
          alt="Divinity"
          width="80"
          height="80"
          style={{ borderRadius: '18px' }}
        />
      </div>

      <h1
        style={{
          fontSize: '28px',
          fontWeight: 600,
          letterSpacing: '-0.035em',
          color: '#0a0a0a',
          marginBottom: '8px',
        }}
      >
        Divinity Works
      </h1>

      <p
        style={{
          fontSize: '16px',
          color: '#525258',
          marginBottom: '32px',
          maxWidth: '360px',
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        Your AI coworker with a real memory.
      </p>

      <button
        onClick={handleSignIn}
        disabled={isOpening}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 28px',
          fontSize: '15px',
          fontWeight: 500,
          background: isOpening ? '#f4f4f5' : '#fff',
          color: '#0a0a0a',
          border: '1px solid #d4d4d8',
          borderRadius: '10px',
          cursor: isOpening ? 'default' : 'pointer',
          fontFamily: 'inherit',
          letterSpacing: 'inherit',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          opacity: isOpening ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isOpening) e.currentTarget.style.borderColor = '#0a0a0a';
        }}
        onMouseLeave={(e) => {
          if (!isOpening) e.currentTarget.style.borderColor = '#d4d4d8';
        }}
      >
        {isOpening ? (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Opening browser…
          </>
        ) : (
          <>
            {/* Google "G" icon */}
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </>
        )}
      </button>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
