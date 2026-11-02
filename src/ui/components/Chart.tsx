import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, SankeyChart, TreemapChart, ScatterChart, PieChart, CustomChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent, MarkLineComponent, MarkAreaComponent, DatasetComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, SankeyChart, TreemapChart, ScatterChart, PieChart, CustomChart, GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, MarkLineComponent, MarkAreaComponent, DatasetComponent, VisualMapComponent, CanvasRenderer, SVGRenderer]);

export type EOption = echarts.EChartsCoreOption;

export interface Pal {
  ink: string; ink2: string; muted: string; green: string; greenD: string; mid: string; gray: string; orange: string; blue: string;
  ei: string; idm: string; grid: string; axis: string; ord: string[]; options: string[]; src: Record<string, string>;
  thr: string; thrUp: string; node: string; paper: string; ramp: string[]; font: string; tipBg: string; tipInk: string; tipLine: string;
}

/** Report palette (white A4 paper, Calibri, the Excel tool's greens). */
export const PAPER: Pal = {
  ink: '#1f2a24', ink2: '#52514e', muted: '#898781', green: '#2a7a4b', greenD: '#1b6e45', mid: '#3f9a63', gray: '#858c88',
  orange: '#e8853a', blue: '#2a78d6', ei: '#a9864e', idm: '#eb6834', grid: '#e1e0d9', axis: '#c3c2b7',
  ord: ['#174a2e', '#2a7348', '#3f9a63', '#7fbf96'], options: ['#2f7f86', '#7a8b3a', '#4c6a92', '#9a5b8c', '#b08a2e'],
  src: { EPD: '#2a7a4b', 'ÖKOBAUDAT': '#2a78d6', IDEMAT: '#eb6834', ecoinvent: '#a9864e' },
  thr: '#9db7a6', thrUp: '#e8a37a', node: '#7fbf96', paper: '#ffffff', ramp: ['#2a7348', '#2a7a4b', '#3f9a63', '#5d8f74', '#456b56', '#7fa58c'],
  font: 'Calibri, Carlito, Segoe UI, sans-serif', tipBg: '#ffffff', tipInk: '#1f2a24', tipLine: '#d5e3da',
};

let paperDepth = 0;
let deskCache: Pal | null = null;
/** Build chart options for the report: colours and font of the paper palette. */
export function withPaper<T>(fn: () => T): T {
  paperDepth++;
  try { return fn(); } finally { paperDepth--; }
}
/** Forget the cached screen palette (after a theme change). */
export function invalidatePalette() { deskCache = null; }
function desk(): Pal {
  if (deskCache) return deskCache;
  if (typeof document === 'undefined') return PAPER;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  const ink = v('--ink', '#22252a'), ink2 = v('--ink-2', '#4e535a'), ink3 = v('--ink-3', '#7c828a'), ghost = v('--ink-ghost', '#a9aeb4');
  const red = v('--redline', '#a6392b'), cold = v('--cold', '#3d6478'), warm = v('--warm', '#b4552a'), ei = v('--src-ei', '#86702c');
  const sheet = v('--sheet', '#f6f3ec');
  deskCache = {
    ink, ink2, muted: ink3, green: red, greenD: cold, mid: ink2, gray: ghost, orange: warm, blue: cold, ei, idm: v('--src-idm', warm),
    grid: v('--rule-soft', 'rgba(34,37,42,0.07)'), axis: v('--rule-firm', 'rgba(34,37,42,0.32)'),
    ord: [ink2, cold, warm, ghost], options: [cold, warm, ei, '#8a6aa0', ink3],
    src: { EPD: v('--src-epd', cold), 'ÖKOBAUDAT': v('--src-obd', ink2), IDEMAT: v('--src-idm', warm), ecoinvent: ei },
    thr: ink3, thrUp: warm, node: ink3, paper: sheet, ramp: [ink2, cold, warm, ei, ink3, red],
    font: "'IBM Plex Sans', system-ui, 'Segoe UI', sans-serif", tipBg: sheet, tipInk: ink, tipLine: v('--rule-firm', '#999'),
  };
  return deskCache;
}
export function pal(): Pal { return paperDepth ? PAPER : desk(); }
/** The palette of the current target (screen theme, or paper inside withPaper), read when a chart is built. */
export const PAL: Pal = new Proxy({} as Pal, { get: (_t, k: string) => (pal() as any)[k] });
export const SRC_COLOR: Record<string, string> = new Proxy({} as Record<string, string>, { get: (_t, k: string) => pal().src[k] });

export function withBase(o: EOption): EOption {
  const P = pal();
  const base: EOption = {
    textStyle: { fontFamily: P.font, color: P.ink2, fontSize: 12 },
    animationDuration: 450,
    tooltip: { confine: true, backgroundColor: P.tipBg, borderColor: P.tipLine, textStyle: { fontFamily: P.font, fontSize: 12.5, color: P.tipInk } },
  };
  return { ...base, ...o, textStyle: { ...(base.textStyle as object), ...((o as any).textStyle ?? {}) },
    tooltip: (o as any).tooltip ? { ...(base.tooltip as object), ...((o as any).tooltip as object) } : base.tooltip };
}

export function Chart({ option, height = 320, onClick }: { option: EOption; height?: number; onClick?: (p: any) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    inst.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); c.dispose(); inst.current = null; };
  }, []);
  useEffect(() => { inst.current?.setOption(withBase(option), { notMerge: true }); }, [option]);
  useEffect(() => {
    const c = inst.current;
    if (!c || !onClick) return;
    c.on('click', onClick);
    return () => { c.off('click', onClick); };
  }, [onClick]);
  return <div ref={el} className="chart-box" style={{ height }} />;
}

/** Render a chart off-screen and return a PNG data URL (report export). */
export async function chartPng(option: EOption, width = 900, height = 420): Promise<string> {
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(div);
  const c = echarts.init(div, undefined, { renderer: 'canvas', width, height, devicePixelRatio: 2 });
  c.setOption({ ...withBase(option), animation: false });
  await new Promise((r) => setTimeout(r, 30));
  const url = c.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
  c.dispose();
  div.remove();
  return url;
}
