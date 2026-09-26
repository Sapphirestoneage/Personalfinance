/* ==========================================================================
   One chart component for every number set. She can switch how it is
   drawn (bars, columns, ring, line) and which hue it uses; the choice is
   remembered per chart on her profile. Every chart has a text summary and
   a screen-reader table; the library loads on demand. One hue per chart:
   a ring uses lighter steps of the same hue, so identity stays in the
   labels, never in a rainbow.
   ========================================================================== */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/data/store';
import { CHART_HUES, CHART_KINDS, type ChartHue, type ChartKind } from '@/data/schemas';

export interface VizRow {
  label: string;
  value: number;
  emphasis?: boolean;
}

interface Props {
  /** stable id, so the choice sticks */
  id: string;
  rows: VizRow[];
  format(v: number): string;
  summary: string;
  /** which drawings make sense for this data; the first is the default */
  kinds?: ChartKind[];
  testId?: string;
  height?: number;
  /** hide the switcher (a chart inside a tool result) */
  quiet?: boolean;
}

export const HUES: Record<ChartHue, { name: string; strong: string; soft: string; steps: string[] }> = {
  rose: { name: 'Rose', strong: '#be185d', soft: '#f9a8d4', steps: ['#be185d', '#db2777', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3'] },
  plum: { name: 'Plum', strong: '#6d2a58', soft: '#c9a0bb', steps: ['#4b1a3c', '#6d2a58', '#8b3d72', '#a85f8f', '#c286ad', '#d9aecb', '#ecd3e3'] },
  gold: { name: 'Gold', strong: '#9a6512', soft: '#e9c27a', steps: ['#7c500e', '#9a6512', '#b8801c', '#d09a34', '#e0b45b', '#eccb8a', '#f6e3ba'] },
  green: { name: 'Green', strong: '#1f6b47', soft: '#86c9a3', steps: ['#185539', '#1f6b47', '#2a8659', '#43a172', '#6bb98f', '#9ad1b3', '#c8e7d6'] },
  teal: { name: 'Teal', strong: '#0f6b6b', soft: '#7fc9c9', steps: ['#0b5252', '#0f6b6b', '#178585', '#2aa0a0', '#54b8b8', '#88cfcf', '#bde5e5'] },
  slate: { name: 'Slate', strong: '#4b3544', soft: '#ab8ea0', steps: ['#33212d', '#4b3544', '#634a59', '#85687a', '#ab8ea0', '#c9b3c0', '#e3d3dc'] },
};

const KIND_WORD: Record<ChartKind, string> = { bar: 'Bars', column: 'Columns', donut: 'Ring', line: 'Line' };

type Echarts = typeof import('./echarts-lite');
let loader: Promise<Echarts> | null = null;
function loadEcharts(): Promise<Echarts> {
  if (!loader) loader = import('./echarts-lite');
  return loader;
}

export function Viz({ id, rows, format, summary, kinds, testId, height, quiet = false }: Props) {
  const allowed = useMemo(() => {
    const base = kinds ?? ['bar', 'column', 'donut', 'line'];
    const hasNeg = rows.some((r) => r.value < 0);
    return base.filter((k) => !(hasNeg && k === 'donut') && !(k === 'line' && rows.length < 2));
  }, [kinds, rows]);
  const pref = useAppStore((s) => s.profile?.chartPrefs?.[id]);
  const setChartPref = useAppStore((s) => s.setChartPref);
  const kind: ChartKind = pref?.kind && allowed.includes(pref.kind) ? pref.kind : (allowed[0] ?? 'bar');
  const hue: ChartHue = pref?.hue ?? 'rose';
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadEcharts().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || rows.length === 0) return;
    let chart: import('./echarts-lite').Chart | null = null;
    let cancelled = false;
    void loadEcharts().then((echarts) => {
      if (cancelled || !ref.current) return;
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const ink = dark ? '#e3d3dc' : '#4b3544';
      const grid = dark ? '#33212d' : '#ecdce6';
      const h = HUES[hue];
      const labels = rows.map((r) => r.label);
      const colorFor = (r: VizRow, i: number) => (kind === 'donut' ? h.steps[Math.min(i, h.steps.length - 1)] : r.emphasis ? h.strong : h.soft);
      chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
      const tooltip = { trigger: 'item' as const, confine: true, formatter: (p: { name: string; value: number }) => `${p.name}: ${format(p.value)}` };
      if (kind === 'donut') {
        const total = rows.reduce((t, r) => t + Math.max(0, r.value), 0);
        chart.setOption({
          animation: false,
          tooltip,
          legend: {
            bottom: 0,
            left: 'center',
            icon: 'circle',
            itemWidth: 10,
            itemHeight: 10,
            textStyle: { color: ink, fontSize: 11 },
            formatter: (name: string) => {
              const r = rows.find((x) => x.label === name);
              return r && total > 0 ? `${name} ${Math.round((Math.max(0, r.value) / total) * 100)}%` : name;
            },
          },
          series: [
            {
              type: 'pie',
              radius: ['46%', '72%'],
              center: ['50%', '42%'],
              data: rows.map((r, i) => ({ name: r.label, value: Math.max(0, r.value), itemStyle: { color: colorFor(r, i), borderColor: dark ? '#22131d' : '#ffffff', borderWidth: 2 } })),
              label: { show: false },
              labelLine: { show: false },
            },
          ],
        });
      } else if (kind === 'line') {
        chart.setOption({
          animation: false,
          grid: { left: 8, right: 16, top: 12, bottom: 4, containLabel: true },
          tooltip,
          xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: grid } }, axisTick: { show: false }, axisLabel: { color: ink, fontSize: 11 } },
          yAxis: { type: 'value', splitLine: { lineStyle: { color: grid } }, axisLabel: { color: ink, fontSize: 11, formatter: (v: number) => format(v) } },
          series: [{ type: 'line', data: rows.map((r) => r.value), smooth: true, symbolSize: 8, lineStyle: { color: h.strong, width: 2 }, itemStyle: { color: h.strong }, areaStyle: { color: h.soft, opacity: 0.25 } }],
        });
      } else {
        const horizontal = kind === 'bar';
        const perColumn = Math.max(40, Math.floor(((ref.current?.clientWidth ?? 320) - 60) / Math.max(1, rows.length)) - 6);
        const cat = { type: 'category' as const, data: labels, inverse: horizontal, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: ink, fontSize: horizontal ? 11 : 10, width: horizontal ? 118 : perColumn, overflow: 'break' as const, lineHeight: 13, interval: 0 } };
        const val = { type: 'value' as const, show: !horizontal, min: Math.min(0, ...rows.map((r) => r.value)), splitLine: { lineStyle: { color: grid } }, axisLabel: { color: ink, fontSize: 11, formatter: (v: number) => format(v) } };
        chart.setOption({
          animation: false,
          grid: { left: 4, right: horizontal ? 72 : 8, top: horizontal ? 4 : 24, bottom: horizontal ? 4 : 6, containLabel: true },
          tooltip,
          xAxis: horizontal ? val : cat,
          yAxis: horizontal ? cat : val,
          series: [
            {
              type: 'bar',
              barMaxWidth: horizontal ? 18 : 36,
              data: rows.map((r, i) => ({ value: r.value, itemStyle: { color: colorFor(r, i), borderRadius: 4 } })),
              label: { show: true, position: horizontal ? 'right' : 'top', color: ink, fontSize: 11, formatter: (p: { value: number }) => format(p.value) },
            },
          ],
        });
      }
    });
    const onResize = () => chart?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      chart?.dispose();
    };
  }, [ready, rows, format, kind, hue]);

  const h = height ?? (kind === 'bar' ? Math.max(72, rows.length * 40 + 8) : kind === 'donut' ? 230 + Math.ceil(rows.length / 3) * 18 : 220);
  return (
    <figure data-testid={testId} data-kind={kind} data-hue={hue}>
      {!quiet && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex gap-1" role="radiogroup" aria-label="Chart type">
            {allowed.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} data-testid={`${testId ?? id}-kind-${k}`} onClick={() => void setChartPref(id, { kind: k })} className={`rounded-full px-2.5 py-1 text-xs ${kind === k ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {KIND_WORD[k]}
              </button>
            ))}
          </div>
          <button type="button" aria-label="Chart color" aria-expanded={open} data-testid={`${testId ?? id}-color`} onClick={() => setOpen(!open)} className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700">
            <span className="h-4 w-4 rounded-full" style={{ background: HUES[hue].strong }} />
          </button>
        </div>
      )}
      {open && !quiet && (
        <div className="mb-2 flex gap-2" role="radiogroup" aria-label="Chart hue">
          {CHART_HUES.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={hue === x} aria-label={HUES[x].name} data-testid={`${testId ?? id}-hue-${x}`} onClick={() => { void setChartPref(id, { hue: x }); setOpen(false); }} className={`h-7 w-7 rounded-full ${hue === x ? 'ring-2 ring-offset-2 ring-sky-700 dark:ring-offset-slate-900' : ''}`} style={{ background: HUES[x].strong }} />
          ))}
        </div>
      )}
      <div ref={ref} style={{ height: h }} aria-hidden="true" className={ready ? '' : 'animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800'} />
      <figcaption className="mt-1 text-sm text-slate-600 dark:text-slate-300">{summary}</figcaption>
      <table className="sr-only">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{format(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export { CHART_KINDS };
