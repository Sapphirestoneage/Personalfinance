/* Simple horizontal bars, one hue, with a text summary. Phone-first: no
   legend (single series), labels on the bars, tooltip on touch. The chart
   library loads on demand so the first screen is not waiting on it; the
   summary and the table are there from the start. */
import { useEffect, useRef, useState } from 'react';

export interface BarRow {
  label: string;
  value: number;
  /** a highlighted row (the current one) */
  emphasis?: boolean;
}

interface Props {
  rows: BarRow[];
  format(v: number): string;
  summary: string;
  testId?: string;
  height?: number;
}

type Echarts = typeof import('./echarts-lite');
let loader: Promise<Echarts> | null = null;
function loadEcharts(): Promise<Echarts> {
  if (!loader) loader = import('./echarts-lite');
  return loader;
}

export function Bars({ rows, format, summary, testId, height }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
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
      chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
      chart.setOption({
        animation: false,
        grid: { left: 4, right: 72, top: 4, bottom: 4, containLabel: true },
        tooltip: { trigger: 'item', confine: true, formatter: (p: { name: string; value: number }) => `${p.name}: ${format(p.value)}` },
        xAxis: { type: 'value', show: false, min: Math.min(0, ...rows.map((r) => r.value)) },
        yAxis: { type: 'category', data: rows.map((r) => r.label), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: ink, fontSize: 12, width: 110, overflow: 'truncate' } },
        series: [
          {
            type: 'bar',
            barMaxWidth: 18,
            data: rows.map((r) => ({ value: r.value, itemStyle: { color: r.emphasis ? '#be185d' : '#f9a8d4', borderRadius: 4 } })),
            label: { show: true, position: 'right', color: ink, fontSize: 12, formatter: (p: { value: number }) => format(p.value) },
          },
        ],
      });
    });
    const onResize = () => chart?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      chart?.dispose();
    };
  }, [ready, rows, format]);
  const h = height ?? Math.max(72, rows.length * 34 + 8);
  return (
    <figure data-testid={testId}>
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
