import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/carlito/400.css';
import '@fontsource/carlito/700.css';
import '@fontsource/carlito/400-italic.css';
import './styles/app.css';
import { App } from './App.tsx';
import { useApp } from './state/store.ts';
import { lib } from './data/libraryStore.ts';

// ?debug in the address exposes the app state for checks in the browser console
if (new URLSearchParams(location.search).has('debug')) (window as any).wblca = { useApp, lib };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
