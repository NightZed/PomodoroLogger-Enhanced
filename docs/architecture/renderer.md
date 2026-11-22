# 渲染层：状态、页面与渲染性能

> `AGENTS.md` 的「渲染层状态与 UI」区域详情。页面卸载的四档规则在 `window-modes.md`，看板在 `kanban.md`，滑块在 `settings.md`。改动 Redux 结构、页面切换、主题、悬停提示或窗口渲染性能前先读这里。

## Redux 结构

`src/renderer/store/index.ts` 是朴素 Redux + thunk；`src/renderer/reducers/index.ts` 合并 `timer`、`history`、`kanban`、`story`。

每个功能目录（`components/Timer`、`History`、`Kanban`、`UserGuide`）自己持有 `action.ts` + reducer + 测试——按这个模式来，**不要加横切的 slice**。

## 看板快照必须一次替换

`kanban.boards` / `lists` / `cards` 互相用 id 引用，所以整棵树重读时必须一次替换。

`applyKanbanSnapshot`（`components/Kanban/snapshot.ts`）让三个 reducer 响应同一个 action，`readKanbanSnapshot` 负责读库；导入、「删除所有数据」和看板首次加载都走它。

分成三次 dispatch 会留下「新 lists + 旧 boards」（删库时 lists 先空、boards 后空）这类中间态，任何沿 `board.lists → lists[id].cards` 走的组件都会在那一帧读到 `undefined`。

## 页面清单

`src/renderer/components/appTabs.ts` 是页面的唯一事实来源；标签栏、Ctrl+Tab 处理和紧凑模式切换全部从 `APP_TABS` / `planTabChange` 推导。

不要加一份并行的标签列表。

## 标题栏拖动

标题栏保留 `-webkit-app-region: drag`，这样普通窗口能拿到原生移动和 Aero Snap，但 Chromium 在滚动容器滚动后会把那块区域裁掉（被裁掉的条带跟着滚动容器的宽度走）。

因此任何仍能到达渲染层的标题栏按下事件都必须同时启动 `windowDrag`，否则滚动之后窗口就拖不动了——见 `src/renderer/components/AppTitleBar/dragRegion.ts` 和 `src/main/ipc/windowDrag.ts`。

## 共享组件库

`src/components/**` 是共享的可视化/小部件库（`Visualization/*`、`common/*`），渲染层用相对路径引用它——它不是渲染层自己的组件树。

## 悬停提示

所有悬停提示走 `src/components/common/Hint`。应用里没有单独使用的 antd `Tooltip`，也没有把提示写在 SVG `<title>` 或 HTML `title` 上——原生 `title` 要等约一秒，样式也由系统决定。仍然保留的 `title` 属性都是对话框、`Statistic`、notification 的标题，不是提示。

### 两类提示

`kind` 决定打开时机，默认 `static`：

| kind     | 何时出现                                | 用在哪                                                                   |
| -------- | --------------------------------------- | ------------------------------------------------------------------------ |
| `static` | 指针停留 `HINT_STATIC_DELAY_MS`（0.4s） | 按钮动作的说明：开始、停止、添加、设置                                   |
| `live`   | 指针进入的那一帧                        | 跟着数据变的标签：卡片标题、看板名、番茄的时间与效率、当前计时状态、计数 |

判断标准只有一条：**这段文字下次悬停时会不会变。** 不变就是 `static`——看一次就记住，指针扫过一排图标时立刻弹出一串标签只是噪音；会变就必须 `live`，否则用户要多等 0.4s 才能读到已经变过的内容。

### 为什么不用 antd 的延迟

antd 的 `mouseEnterDelay` 也能做延迟，但 `Hint` 把它关掉了（`trigger={[]}`）：延迟为 0 时它仍要经过一次 `setTimeout`，再挂载 portal、测量定位，比在同一个事件里 `setState` 晚一到两帧；而 `live` 的手感基准是树图和日历那种「指针一进就出来」。所以 `Hint` 自己监听 `mouseenter` / `mouseleave`，延迟、提前移出时取消、卸载清理都在内部，`live` 直接跳过定时器。

### 外观与层级

表面由 `GlobalStyle` 统一：背景 `--pl-bg-elevated`、文字 `--pl-text`、阴影 `--pl-shadow`，箭头跟随；antd 默认的 `zoom-big-fast` 动画时长压成 0。不要在调用点另写颜色或动画。

全窗口浮层的层级走 `layers.ts`：`LAYER.tooltip`（1070）是默认值，会话结束遮罩（1100）内的提示必须传 `zIndex={LAYER.sessionMaskTooltip}`（1110），否则会被遮罩盖住。`PomodoroNumView` 为此有一个 `hintZIndex`。

### 不该加的提示

文字已经完整显示的元素不需要提示：图标旁就有页面名的标签栏（普通模式）、显示文件名的声音路径、名称就在按钮里的主题选择。提示只回答「这个图标是什么」，不重复屏幕上已有的文字。

日历格子的浮层是例外：它保留 `GridCalendar` 自己的共享气泡，因为 53 周 × 7 天逐个包 `Hint` 会多出 371 个组件实例；只把颜色、字号、圆角、阴影换成与 `Hint` 相同的变量。

### 可访问性

提示不提供可访问名称。只有图标或符号的触发元素必须自己带 `aria-label`，内容随状态变时（播放/暂停、显示/隐藏）要一起变。非 `<button>` 的可点击元素另需 `pressable()`，见 `AGENTS.md`。

复合控件按状态切换语义，不要一直挂按钮角色：`Search` 收起时整条是一个不可聚焦的 `div`，键盘用户只能靠 Ctrl+F；现在收起态挂 `pressable()` 与 `aria-label`，展开后立刻撤掉 `role` / `tabIndex` / 按键转发，否则按钮的 Enter/Space 处理会在输入框里 `preventDefault()`，空格打不出来。

输入控件的名称来自 `aria-label` 或关联的 `label`，`placeholder` 不算（输入后它就不见了）。不移动焦点的结果变化要让屏幕阅读器感知：空结果、加载完成用 `role="status"`，失败走 `alert`。

焦点环由 `GlobalStyle` 统一提供（`data-pressable` 是它的挂点，`outline: 2px solid var(--pl-primary)`）。不要在组件里写 `outline: none` 而不留替代：为了去掉原生边框而关掉它时，用 `:focus-visible` 或 `:focus-within` 给一个可见替代，且颜色走主题变量——主题切换后焦点必须仍然看得见。

已知限制：`disabled` 元素不派发鼠标事件，`Hint` 不会出现，而原生 `title` 会。未分配面板里的链接按钮属于这种情况；按钮本身有可见文字，可以接受。

## 主题

`src/renderer/theme`（tokens + `applyTheme`，CSS 自定义属性 `--pl-*`）通过 `ThemeController` 应用。

首次绘制的主题经 `additionalArguments` → `window.api.initialTheme` 跨进程边界传递，这样渲染层不会闪一下错误的主题；动启动主题时两侧都要同步改。

## 样式

样式用 styled-components（外加少量 `.scss` 全局文件）；不要为组件添加独立 CSS 文件。

## 渲染性能：两条硬约束

整个应用默认禁用硬件加速（`src/main/main.ts`）。下面两条都是在 CPU 光栅化下量出来的，换硬件加速也不会好转。

### 占满窗口的平面必须保持纯 `background-color`

实时 resize 每帧都会重绘整个窗口，在那里用 `color-mix()`（把 `themeBackgroundOpacity` 折进颜色最直觉的写法）每次重绘要吃掉四个核里约 10 个点；纯色填充 + 元素自身的 `opacity` 是同样的算术。

在 1440×960 窗口上实测 45% → 33%，开不开硬件加速都一样。

见 `Application.tsx` 里的图层表。

### resize 期间去掉圆角与高亮圈

窗口裁剪容器（`Main`）上的圆角 1px 高亮圈会让每帧多一次全窗口合成 pass，所以渲染层在窗口 resize 期间把圆角和高亮圈都去掉（`WindowEventName.ResizingChanged`，由 `init.ts` 在 120 ms 空闲计时后发出）：软件渲染下，每个呈现帧 8.8 ms → 6.5 ms，3.33 Mpx 下 55 → 37 个 quad。

高亮圈画在 Content 之上的专用覆盖层 `WindowRing`（inset box-shadow，z-index 3）而不是真实 border：border 占布局空间，拖拽松手恢复时会把内容整体往内挤 1px；而画在 Main 本体上的 inset shadow 会被 `::before` / `::after` 背景色带盖住（Main 的这两个伪元素已被 3a4526c 的背景色带占用）。

没有这个处理，大窗口做不到每个鼠标事件呈现一帧，会明显跟不上光标——也就是关掉硬件加速时那个「拉大卡顿」的报告。

**触发器是 `resize` 事件而不是 `will-resize`**（后者只对用户手势触发，脚本无法验证），代价是程序性 resize 也会触发；一次性 resize 的两步边框变化没有人手拖动遮着，会被看成窗口跳一下（v1.4.0 没有这套机制、不跳）。

所以模式切换（`MinimizeWindow` / `CompactWindow`）和最大化按钮在 resize 前先调 `init.ts` 的 `suppressResizingNotification()`（300 ms 抑制窗），这几条路径上圆角全程不动。

因此只有用户拖动期间圆角是方的。没在 trace 里量过 `Display::DrawAndSwap` 之前，不要给那个元素加回真实圆角边框或换成占布局的画法，也不要让新的程序性 resize 路径漏掉抑制调用。
