import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Avoid React StrictMode double-mount in development, which can trigger TTS / recognition twice.
createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('pm-sw-update'));
            }
          });
        });
      })
      .catch(() => {
        // ignore registration failures (file://, unsupported path, etc.)
      });
  });
}