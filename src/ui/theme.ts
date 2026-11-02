// Screen theme: drafting paper (light), the same sheet at night (dark), or follow the system (auto). Per browser.
import { invalidatePalette } from './components/Chart.tsx';

export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'wblca:theme';

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(t: ThemeChoice) {
  const el = document.documentElement;
  if (t === 'auto') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', t);
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked: the choice lasts for this visit */ }
  invalidatePalette();
}

export function onSystemTheme(fn: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const h = () => { invalidatePalette(); fn(); };
  mq.addEventListener('change', h);
  return () => mq.removeEventListener('change', h);
}
