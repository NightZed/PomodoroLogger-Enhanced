/**
 * 按需注册 echarts 所需模块并作为渲染进程 echarts 的入口。
 * 通过 webpack alias 将 `echarts` 重定向至 `echarts/lib/echarts.js`（仅核心），
 * 配合此处显式注册用到的图表/组件，避免打包整个 echarts（约 1.5MB），
 * 降低渲染进程的 JS 体积与 V8 常驻堆内存。
 */
import 'echarts/lib/chart/pie';
import 'echarts/lib/chart/sankey';
import 'echarts/lib/component/tooltip';
import 'echarts/lib/component/legend';
import 'echarts/lib/component/title';
