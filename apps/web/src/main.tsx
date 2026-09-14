import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { getDevnoteStore } from './lib/store.js';
import './index.css';

// Dev-only store handle for Playwright seeding (never in production builds).
// Cast form: typechecks without vite/client types (root lint covers this
// file); Vite still statically replaces import.meta.env at build time.
const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false;
if (isDev) {
  (window as unknown as { __devnoteStore?: unknown }).__devnoteStore = getDevnoteStore();
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary name="app">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
