# 设置页：分组排版与滑块

> `AGENTS.md` 的「滑块 / 不透明度」区域详情。新增或修改任何拖动驱动的设置前先读这里；改完回 `AGENTS.md` 核对硬约束。

## 分组与行

页面是「左侧栏 + 右侧一列 inset 分组卡片」：`Setting/layout.tsx` 提供 `SettingsContent`、`SettingsSection`、`GroupTitle`、`Card`、`SettingsRow`，不要在每个分区里各写一套内边距。

- 内容列 `max-width: 880px` 居中。参考图是 1280px 画布上的 1210px 卡片，这里不照搬那个跨度：880px 在默认 1440px 窗口下留出自然的左右留白，同时让三个透明度滑块和数据按钮簇都能排在一行。
- 普通行左侧是标题与说明，右侧是宽度 300px 的控件栏；开关、分段控件共用同一条右边缘。
- 滑块行（`SliderRow`）是另一套排版：标题与说明在同一行，轨道在它们下方横跨整张卡片，读数停在轨道右端。
- 行与行之间用 `rowSeparator` 的伪元素画 1px 内缩分隔线，不用 `border`（border 会占布局，切换时整行会挪动）。普通行、滑块行、快捷键行都渲染同一个 `RowShell`，所以不同类型相邻时也能画线。
- 侧栏固定 216px 并始终在左侧；窗口变窄时收窄的是内容区，不把侧栏改成顶部布局。

## 八个滑块

四个时长、音量、三个不透明度全部用 `Setting/PreviewSlider.tsx`。

拖动驱动的设置走两条路之一，**新滑块必须明确选边**：

| 类别           | 写到哪里         | 提交时机                               |
| -------------- | ---------------- | -------------------------------------- |
| 四个时长、音量 | 留在 slider 内部 | 松手提交一次                           |
| 三个不透明度   | 直接写 CSS 变量  | 拖动中每帧折一次，松手 `onCommit` 提交 |

### 范围与刻度

| 滑块           | 范围                         | 刻度点（无文字）    |
| -------------- | ---------------------------- | ------------------- |
| 专注时长       | 生产 15–90，开发 2–90        | 25                  |
| 短休息         | 1–90                         | 5                   |
| 长休息         | 1–90                         | 15                  |
| 最短专注       | 0–当前专注时长               | 无                  |
| 三个不透明度   | 10–100（步长 5）             | 10 / 40 / 70 / 100  |
| 音量           | 0–100                        | 0 / 50 / 100        |

刻度通过 `marks={{ 25: ' ' }}` 传入一个空格，`PreviewSlider` 的作用域样式只做一件事：把 `.ant-slider-mark-text` 隐藏。**不要传空字符串**：rc-slider 的 `isReactRenderable` 会把空标签过滤掉，刻度会整条消失。**也不要自己在标记上画点**：rc-slider 对每个 mark 同时渲染一个 `.ant-slider-dot`（轨道上的圆点，真正要保留的刻度）和一个 `.ant-slider-mark-text`（下方的文字），再给后者画点就会在轨道下方多出一条第二个刻度。带文字的 `'25min'` 同样不行，会把行高撑开，也和右侧读数重复。

## 一律非受控

一律用 `defaultValue` + `key` 重新播种，**不要改回受控 `value`**：

rc-slider 会用 layout effect 把每个新 value 抄进自己的 state，于是每帧变化的 value 每帧加一次嵌套更新，拖到第 50 帧 React 直接抛 `Maximum update depth exceeded`。v1.4 的时长滑块一直带着这个 bug，只是没人拖得那么快。

## 右侧读数与编辑

tooltip 已移除：实测它的弹层链占一次快速拖动主线程时间的约 93%。当前值由轨道右侧的 `Readout`（`<button>`）显示：

- React 渲染 `formatValue(seed.value)`；
- 拖动中 `onChange` 直接写 `textContent`——React 只在它记录的 children 变化时才重写文本节点，所以直写不会被重渲染冲掉；
- 读数从编辑框切回来时会重新挂载，`useLayoutEffect` 用 `liveValue` 在绘制前把文本写回去；
- **不要给读数走 store**。

**不要再用一个 React 状态去同步读数**：拖动提交不会更新 `seed`（store 回写同一个值不算外部变化），如果读数由额外状态驱动，那次状态更新会在 store 回写前先渲染一次，此时 prop 还是旧值、`expected` 已是新值，render 阶段的重新播种会把滑块退回旧值并重挂载（丢焦点）。拖动的结果靠 `liveValue` + 直接写文本，编辑框退出时靠 layout effect 回写。

读数同时是数字编辑器，外观一直保持「可编辑输入框」：72×26、1px 边框、`--pl-bg-hover` 底色，指针悬浮时边框转为主色。点击后换成与读数**同尺寸同位置**的编辑框，单位是框内右侧的静态文字（不可编辑），所以切换时不会跳位。Enter 或失焦提交，Esc 取消；提交时 `Math.round` 再夹到 `min`/`max`，非法输入直接放弃。

时长读数的单位固定写 `min`，两种界面语言都一样，不走 i18n；`0` 就显示 `0 min`，没有「任意」这种特殊文案。

读数、编辑框和滑块圆点的焦点环一律用无偏移的 `box-shadow` 画，**不要用 `outline-offset`**：偏移会在环和控件之间留出一条缝，点击时看起来像环浮在外面。

滑块圆点固定为 antd 原始的 10px，hover / focus 只换外圈颜色，不改宽高。不要恢复 antd 的 hover 放大：尺寸过渡和聚焦环叠在一起时，鼠标移出会看到圆点先涨一下再回落。

编辑提交后**不要**更新 `expected`：`expected` 的职责是避免「拖动松手」时把滑块在指针下重挂载。键盘编辑没有指针按下，store 回写时按外部变化再播种一次是安全的，也能让拇指落到输入的值上。

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

## 默认值与「恢复默认设置」

默认值只有一份：`Timer/defaults.ts` 的 `createDefaultSettings()`。

- `defaultState` 展开它再加运行时字段（计时、窗口档位、当前页），所以新装、重置、`fetchSettings` 缺失时读到的都是同一组值。
- 加字段时改这里，不要在两处各写一个字面量。

可空设置（`screenShotInterval`、三条提示音路径、`wallpaperPath`、`customThemes`）**不在**返回对象里，由 `NULLABLE_SETTINGS` 列出；重置时用 `$unset` 清掉，**不要写 `undefined`**：`SettingsRepository.write` 会把每个值 `JSON.stringify` 后绑定进 SQL，`undefined` 绑定不上（better-sqlite3 直接抛错），而缺键才是「没有值」的表达。

默认主题是**跟随系统**，`DEFAULT_THEME_ID`（`day`）只是兜底：

- `main/init.ts` 只在设置表里显式写了 `false` 时才关掉跟随；没有这一行（首次启动、从未改过主题的老用户）就是跟随。
- 非跟随时 `nativeTheme` 和 `resolveTheme` 的兜底都是浅色，深色只在 `themeId === night` 时出现。
- 默认最短专注是 25 分钟，等于默认专注时长：跑满一节就能结束，提前结束被挡住，想放开就调到 0。

「恢复默认设置」在系统分区的最后一张卡片，走 `feedback.confirm`，确认文案要列出按钮标签说不出来的部分（自定义主题、壁纸、分心应用列表、自定义提示音）。执行时：

1. 先丢弃 `pendingSettingWrites` 里的定时器——否则 300ms 后那次拖动写入会把旧值盖回来；
2. 一次 `settingDB.update` 写完 `$set` 与 `$unset`，而不是逐个调用 setter：每次 update 都重写整表，三十次调用就是三十次 fsync，中途失败还会留下一半新一半旧；
3. dispatch 一次 `resetSettingsToDefaults`，reducer 只替换设置字段，运行中的计时、窗口档位与当前页保持不变；
4. 主进程那一半（`setLogLevel`、`openAtLogin`，以及 compact 模式下窗口高度）随后同步。

会话与看板不属于设置，重置不碰它们。

## 关于页与更新检查

关于页是**一张卡片**：顶部是居中的 hero（图标、名称、版本、说明、GitHub 图标），下面接更新状态行与三个链接行。整张卡片靠 `SettingsContent` 的 `$center` 开关垂直居中：`min-height` 取 `100vh - TITLE_BAR_HEIGHT`，内容不满一屏时卡片落在可见区域正中，超过一屏照常滚动。其他分区不要打开它，列表从顶部开始才是可预期的。

- hero 是 `AboutHero`，它自己画下边框（`rowSeparator` 只在两个 `RowShell` 相邻时才画线），所以不要把它挪到卡片外面。
- 卡片里第一行是更新状态，后面三个 `LinkRow`（更新说明、反馈、许可证协议）整行可点，右侧箭头是装饰。`src/shared/links.ts` 是这些 URL 的唯一来源。
- **检查更新只有关于页一个入口**。系统分区的「更新」只留「自动检查更新」开关，它只管启动时的后台检查；进入关于页属于用户主动查看版本，无论开关如何都会检查一次。
- 检查结果是一个 `UpdateCheckState`：`checking` / `latest` / `available`（带版本号）/ `skipped`（未打包的构建，不是失败）/ `failed`（含 30 秒超时）。原来「已是最新版本」用 toast 提示，现在显示在状态行里，不要再加 toast。
- 离开关于页要释放监听（effect 的 cleanup 调 `releaseCheckUpdate`）；检查未返回时切走再回来，不能留下三份监听。

