import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RELOAD_KEY = 'maintenance:chunk-reload-attempted';
const CHUNK_RECOVERY_PARAM = '__maintenance_reload';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

const isChunkLoadError = (error: Error) => (
  /failed to fetch dynamically imported module|importing a module script failed|chunkloaderror|loading chunk .* failed|unexpected token '<'/i.test(error.message)
);

const getChunkReloadAttempt = () => {
  try {
    return Number(sessionStorage.getItem(CHUNK_RELOAD_KEY));
  } catch {
    return 0;
  }
};

const markChunkReloadAttempt = () => {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // The recovery URL below is the fallback when sessionStorage is blocked.
  }
};

const clearChunkReloadAttempt = () => {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // Ignore storage failures; this must never hide the original error.
  }
};

const hasRecentChunkReloadAttempt = () => {
  const attemptedAt = getChunkReloadAttempt();
  return Number.isFinite(attemptedAt)
    && attemptedAt > 0
    && Date.now() - attemptedAt < CHUNK_RELOAD_COOLDOWN_MS;
};

const hasRecoveryQuery = () => (
  typeof window !== 'undefined'
  && new URL(window.location.href).searchParams.has(CHUNK_RECOVERY_PARAM)
);

const clearRecoveryQuery = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has(CHUNK_RECOVERY_PARAM)) return;
  url.searchParams.delete(CHUNK_RECOVERY_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};

const clearStaleReleaseAndReload = async () => {
  await Promise.allSettled([
    navigator.serviceWorker?.getRegistrations().then(registrations => (
      Promise.all(registrations.map(registration => registration.unregister()))
    )) ?? Promise.resolve(),
    'caches' in window
      ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
      : Promise.resolve(),
  ]);

  const url = new URL(window.location.href);
  url.searchParams.set(CHUNK_RECOVERY_PARAM, String(Date.now()));
  window.location.replace(url.toString());
};

if (typeof window !== 'undefined') {
  // A successful recovery should not permanently disable future recovery
  // attempts. The cooldown also prevents an actually missing chunk from
  // causing an infinite reload loop.
  window.setTimeout(clearChunkReloadAttempt, CHUNK_RELOAD_COOLDOWN_MS);
  window.addEventListener('load', () => {
    window.setTimeout(clearRecoveryQuery, 500);
  }, { once: true });
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error inside ErrorBoundary:", error, errorInfo);

    // A deployment replaces Vite's hashed lazy chunks. If a PWA tab still has
    // an older app shell, clear that one stale release and reload once.
    if (isChunkLoadError(error) && !hasRecoveryQuery() && !hasRecentChunkReloadAttempt()) {
      markChunkReloadAttempt();
      void clearStaleReleaseAndReload();
    }
  }

  private handleReset = () => {
    clearChunkReloadAttempt();
    this.setState({ hasError: false, error: null });
    void clearStaleReleaseAndReload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2.5rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
          fontFamily: 'var(--font-ui)'
        }}>
          <div style={{
            maxWidth: '500px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            border: '1px solid #e2e8f0',
            padding: '2.5rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              backgroundColor: '#fef2f2',
              color: '#ef4444',
              borderRadius: '50%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              margin: '0 auto 1.5rem',
              border: '1px solid #fee2e2'
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            
            <h3 style={{ margin: '0 0 0.5rem', color: '#1e293b', fontSize: '1.25rem', fontWeight: 700 }}>
              เกิดข้อผิดพลาดในการโหลดส่วนนี้
            </h3>
            <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
              ไม่สามารถแสดงผลเนื้อหาของหน้านี้ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง หรือกลับไปยังหน้าหลักของระบบ
            </p>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '10px 18px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                กลับหน้าแรก
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '10px 18px',
                  backgroundColor: '#0277bd',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s'
                }}
              >
                โหลดหน้าเว็บใหม่
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
