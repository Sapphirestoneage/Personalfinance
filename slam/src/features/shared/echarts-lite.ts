/* The slice of ECharts the app uses, as one lazily loaded chunk. Static
   imports here let the bundler drop every other chart type. */
import * as core from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

core.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

export const init = core.init;
export type Chart = ReturnType<typeof core.init>;
