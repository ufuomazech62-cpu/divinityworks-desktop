// Web Preload Shim — must run before any React code so window.ipc exists.
// In Electron this is injected via contextBridge; in the browser it sets up
// the WebSocket connection to the bridge server.
import './web-preload'

import { StrictMode, Component } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PostHogProvider } from 'posthog-js/react'
import type { CaptureResult } from 'posthog-js'
import { ThemeProvider } from '@/contexts/theme-context'
import { configureAnalyticsContext } from './lib/analytics'
import { VideoPopout } from '@/components/video-popout'

class CrashBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[CrashBoundary]', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#ff6b6b', background: '#1a1a1a', minHeight: '100vh', fontFamily: 'monospace', fontSize: 14, whiteSpace: 'pre-wrap' }}>
          <h2 style={{ marginBottom: 16 }}>Divinity crashed</h2>
          <p style={{ marginBottom: 12 }}>{this.state.error.message}</p>
          <pre style={{ overflow: 'auto', maxHeight: 400 }}>{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

// Fetch the stable installation ID from main so renderer + main share one
// PostHog distinct_id. Falls back to PostHog's auto-generated anonymous ID
// if the IPC call fails (rare — main is always up before renderer).
async function bootstrap() {
  let installationId: string | undefined
  let apiUrl: string | undefined
  let appVersion: string | undefined
  try {
    const result = await window.ipc.invoke('analytics:bootstrap', null)
    installationId = result.installationId
    apiUrl = result.apiUrl
    appVersion = result.appVersion
  } catch (err) {
    console.error('[Analytics] Failed to bootstrap from main:', err)
  }

  configureAnalyticsContext({ apiUrl, appVersion })

  const options = {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    defaults: '2025-11-30' as const,
    ...(installationId ? { bootstrap: { distinctID: installationId } } : {}),
    before_send: (event: CaptureResult | null) => {
      if (!event) return event
      if (appVersion) {
        event.properties = {
          ...event.properties,
          app_version: appVersion,
        }
      }
      return event
    },
    loaded: () => {
      configureAnalyticsContext({ apiUrl, appVersion })
    },
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CrashBoundary>
        <PostHogProvider apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY} options={options}>
          <ThemeProvider defaultTheme="system">
            <App />
          </ThemeProvider>
        </PostHogProvider>
      </CrashBoundary>
    </StrictMode>,
  )

  // The loaded callback applies api_url/app_version once PostHog has initialized.
}

// The video-mode popout window loads the same bundle with a hash route and
// renders only the mini-call UI — no analytics or app bootstrap needed.
if (window.location.hash === '#video-popout') {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <VideoPopout />
    </StrictMode>,
  )
} else {
  bootstrap()
}
