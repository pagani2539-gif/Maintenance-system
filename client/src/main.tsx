import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply the persisted (or system-preferred) theme on <html> before first paint,
// so pre-auth pages (Login, ChangePassword) — which render outside Layout — are
// themed too. Layout keeps ownership of the runtime toggle from here on.
{
  const saved = localStorage.getItem('theme');
  const theme =
    saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
