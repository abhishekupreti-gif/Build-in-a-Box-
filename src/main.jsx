import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register Service Worker for offline capability
if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[SignalSAR] Service Worker registered successfully:', registration.scope);
      })
      .catch((error) => {
        console.warn('[SignalSAR] Service Worker registration failed:', error);
      });
  });
} else if ('serviceWorker' in navigator) {
  // Also register in dev preview mode if supported
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[SignalSAR] Service Worker registered in preview/dev:', registration.scope);
      })
      .catch((err) => {
        console.log('[SignalSAR] SW note:', err.message);
      });
  });
}

