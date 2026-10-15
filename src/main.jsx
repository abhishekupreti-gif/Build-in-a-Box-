import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker Registration:
// In production, register the Service Worker for offline capability.
// In development, unregister any active workers to prevent interfering with Vite HMR/modules.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[SignalSAR] Service Worker active in production scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[SignalSAR] Service Worker registration failed:', err);
        });
    });
  } else {
    // Development mode: safely unregister any lingering service workers from previous builds
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().then(() => {
          console.log('[SignalSAR] Unregistered development Service Worker to allow clean Vite module serving');
        });
      }
    }).catch(() => {});
  }
}
