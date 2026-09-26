/* The slice of ECharts the app uses, as one lazily loaded chunk. Static
   imports here let the bundler drop every other chart type. */
import * as core from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

core.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export const init = core.init;
export type Chart = ReturnType<typeof core.init>;
