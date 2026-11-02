// Line icons (1.6 px stroke), drawn for this app.
import type { SVGProps } from 'react';

const S = (p: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
});

export const Icon = {
  setup: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>,
  boq: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>,
  designs: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-7h6v7" /></svg>,
  results: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></svg>,
  dashboard: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></svg>,
  insights: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.3 1 2.2h5.2c0-.9.4-1.7 1-2.2A6 6 0 0 0 12 3z" /></svg>,
  model: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M12 22V12M21 7l-9 5-9-5" /></svg>,
  report: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>,
  contractor: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M2 18h20M4 18v-4a8 8 0 0 1 16 0v4" /><path d="M10 6V4h4v2" /></svg>,
  finder: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  data: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>,
  undo: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>,
  redo: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>,
  save: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></svg>,
  open: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z" /><path d="M3 10h18l-2 9H5z" /></svg>,
  plus: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M12 5v14M5 12h14" /></svg>,
  x: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  trash: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  swap: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>,
  download: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>,
  upload: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M12 21V9M7 14l5-5 5 5M4 4h16" /></svg>,
  copy: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><rect x="8" y="8" width="13" height="13" rx="1.5" /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" /></svg>,
  dots: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>,
  reset: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>,
  word: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8l2 8 3-6 3 6 2-8" /></svg>,
  print: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" /><rect x="6" y="14" width="12" height="7" /></svg>,
  spark: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>,
  info: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>,
  chev: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M6 9l6 6 6-6" /></svg>,
  external: (p: SVGProps<SVGSVGElement>) => <svg {...S(p)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>,
};

/** Brand mark: a building section with a carbon ruler. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="2" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      <path d="M8 24V12l8-5 8 5v12" fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 24h16" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 24v-4M16 24v-6M20 24v-3" stroke="var(--redline)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
