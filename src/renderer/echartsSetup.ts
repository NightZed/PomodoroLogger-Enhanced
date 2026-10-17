/**
 * Register only the ECharts modules used by the renderer.
 * ECharts 6 exposes the tree-shakable core/charts/components entrypoints.
 */
import * as echarts from 'echarts/core';
import { SankeyChart, TreemapChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([SankeyChart, TreemapChart, TitleComponent, TooltipComponent, CanvasRenderer]);
