/* Simple horizontal bars, one hue, with a text summary. Phone-first: no
   legend (single series), labels on the bars, tooltip on touch. */
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

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

export function Bars({ rows, format, summary, testId, height }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || rows.length === 0) return;
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const ink = dark ? '#cbd5e1' : '#334155';
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.setOption({
      animation: false,
      grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
      tooltip: { trigger: 'item', formatter: (p: { name: string; value: number }) => `${p.name}: ${format(p.value)}` },
      xAxis: { type: 'value', show: false, min: Math.min(0, ...rows.map((r) => r.value)) },
      yAxis: { type: 'category', data: rows.map((r) => r.label), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: ink, fontSize: 12 } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: rows.map((r) => ({ value: r.value, itemStyle: { color: r.emphasis ? '#0369a1' : '#7dd3fc', borderRadius: 4 } })),
          label: { show: true, position: 'right', color: ink, fontSize: 12, formatter: (p: { value: number }) => format(p.value) },
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [rows, format]);
  const h = height ?? Math.max(72, rows.length * 34 + 8);
  return (
    <figure data-testid={testId}>
      <div ref={ref} style={{ height: h }} aria-hidden="true" />
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
