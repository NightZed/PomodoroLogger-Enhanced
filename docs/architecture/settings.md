# 设置页滑块

> `AGENTS.md` 的「滑块 / 不透明度」区域详情。新增或修改任何拖动驱动的设置前先读这里；改完回 `AGENTS.md` 核对硬约束。

七个滑块（四个时长、音量、三个不透明度）全部用 `Setting/PreviewSlider.tsx`。

拖动驱动的设置走两条路之一，**新滑块必须明确选边**：

| 类别           | 写到哪里         | 提交时机                               |
| -------------- | ---------------- | -------------------------------------- |
| 四个时长、音量 | 留在 slider 内部 | 松手提交一次                           |
| 三个不透明度   | 直接写 CSS 变量  | 拖动中每帧折一次，松手 `onCommit` 提交 |

## 一律非受控

一律用 `defaultValue` + `key` 重新播种，**不要改回受控 `value`**：

rc-slider 会用 layout effect 把每个新 value 抄进自己的 state，于是每帧变化的 value 每帧加一次嵌套更新，拖到第 50 帧 React 直接抛 `Maximum update depth exceeded`。v1.4 的时长滑块一直带着这个 bug，只是没人拖得那么快。

## tooltip 已移除，用常驻 KeyBadge

实测 A/B：tooltip 弹层链占一次快速拖动主线程时间的约 93%（见 `PreviewSlider.test` 的 badge 注释）。

当前值由轨道右端上方、与上方文案齐平的常驻 `KeyBadge`（`Setting/KeyBadge.tsx`，与快捷键表格同一样式）显示：

- React 渲染提交值（`formatValue` + seed）；
- 拖动中 `onChange` 直接写 `textContent`——React 只在它记录的 children 变化时才重写文本节点，所以直写不会被重渲染冲掉；
- **不要给 badge 走 store**。

badge 用列布局（badge 行右对齐 + slider）而非绝对定位，负 margin 上提到 hint 行；-16px 对「有 hint」与「上方直接是标题」两种上文都安全，因为标题/hint 在左端、badge 在右端，横向天然错开。

## 时长与音量：松手才提交

四个时长和音量的拖动值留在 slider 内部、松手才提交一次。

必须这样，因为 `Timer/index.tsx` 映射了整个 store，其 `shouldComponentUpdate` 会对四个时长中的任何一个重渲染。所以每事件写一次 store 会让整个番茄钟页面（进度环、`PomodoroNumView` 的 SVG 墙）在一次拖动里重渲染约 100 次。

**重新播种只在设置被别处改动时发生**：`expected` ref 记住刚提交的值，store 回写同一个值不算外部变化。否则松手瞬间重挂载会丢焦点，键盘用户接着按方向键就没反应了。

## 不透明度：不进 store

三个不透明度的值*就是*窗口显示的内容，但它们同样不进 store：

- 拖动经 `onPreview` 折到每帧一次（`Setting/useSliderChange.ts`），直接写 CSS 变量（`theme/opacity.ts`；`ThemeController` 是 store 侧的写入者，松手 `onCommit` 提交一次后两边写同一个值）。
- 每帧 store 写入会让每个 connect 组件重渲染；一旦快速拖动让渲染跟不上指针，react-redux 给 `useSyncExternalStore` 的 getSnapshot 在 passive flush 里返回新的 props 对象，React 便在 flush 内再次调度渲染，连续 50 次就是控制台里的 `Maximum update depth exceeded`。

## 持久化只在提交时

持久化只发生在提交时（`Timer/action.ts` 的 `persistSettingWithDebounce`）。

每次设置写入都会在自己的 WAL 提交里重写整张 `settings` 表，所以每事件持久化就是每个指针事件一次 fsync。
