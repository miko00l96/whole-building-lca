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

export const PAL = {
  ink: '#1f2a24', ink2: '#52514e', muted: '#898781', green: '#2a7a4b', greenD: '#1b6e45', mid: '#3f9a63', gray: '#858c88',
  orange: '#e8853a', blue: '#2a78d6', ei: '#a9864e', idm: '#eb6834', grid: '#e1e0d9', axis: '#c3c2b7',
  ord: ['#174a2e', '#2a7348', '#3f9a63', '#7fbf96'], options: ['#2f7f86', '#7a8b3a', '#4c6a92', '#9a5b8c', '#b08a2e'],
};
export const SRC_COLOR: Record<string, string> = { EPD: PAL.green, 'ÖKOBAUDAT': PAL.blue, IDEMAT: PAL.idm, ecoinvent: PAL.ei };

const BASE: EOption = {
  textStyle: { fontFamily: 'Calibri, Carlito, Segoe UI, sans-serif', color: PAL.ink2, fontSize: 12 },
  animationDuration: 450,
  tooltip: { confine: true, textStyle: { fontFamily: 'Calibri, Carlito, sans-serif', fontSize: 12.5 }, borderColor: '#d5e3da' },
};

export function withBase(o: EOption): EOption {
  return { ...BASE, ...o, textStyle: { ...(BASE.textStyle as object), ...((o as any).textStyle ?? {}) } };
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
