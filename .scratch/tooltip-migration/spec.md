# 原生 title 迁移到 antd Tooltip

Status: open（只剩 5 处 SVG 内部 `<title>` 待定）

## 背景

原生 `title` 属性要悬停约 1 秒才出现，样式也由系统决定；看板卡片、计时器、窗口控制这些高频位置的手感因此很差。现在统一改成 `Hint`：受控打开、无进入延迟、过渡时长 0，外观与树图的 tooltip 一致。

## 现状

`src/` 非测试代码里已经没有单独使用的 antd `Tooltip`（只剩 `Hint` 内部一处）。剩余的原生 `title` 都是「对话框 / Statistic / notification 的标题」，不是提示，保持原样。

## 统一封装（已实现）

`src/components/common/Hint/Hint.tsx`：

- 自己监听子元素的 `mouseenter` / `mouseleave`，用受控 `open` 在同一个事件里切换，Tooltip 自身的 trigger 关闭；
- `label` 为空或只含空白时直接返回子元素；
- `maxWidth` / `zIndex` / `getPopupContainer` 按需透传；
- 不改子元素的 `aria-label`。

提示表面由 `GlobalStyle` 统一：背景 `--pl-bg-elevated`、文字 `--pl-text`、阴影 `0 2px 8px var(--pl-shadow)`、箭头跟随；`zoom-big-fast` 的动画时长设为 0。

## 已完成

### 第一批：窗口与计时

`WindowControls` 4、`MiniLogger` 11、`Timer` 10、`SessionEndingMask` 3。

### 第二批：看板

`BoardBrief` 标题 / 描述、`Badge` 评级字母、`CardEditor` 6、`LabelEditor` 2、`CardPicker`、`ListPickerBody`、`ProjectPicker`、`UnassignedPanel`。

### 第三批：设置、历史与引导

`Setting` 3、`DataRepairDialog` 2、`SessionDayEditor` 2、`AppTitleBar`、`HelpIcon`。

### 旧 Tooltip 一并统一

`ErrorNoticeActions` 3、`List` 2、`Kanban` 2、`BoardEditor` 1。

### 迷你窗计时器

中间的 SVG `<title>`（专注中 / 休息中 / 暂停）换成 `Hint`，状态名同时放到 `role="img"` 的 `aria-label` 上。

### 番茄圆点与分段控件

`PomodoroDot` 的 SVG `<title>` 换成 `Hint`，并补 `role="img"` / `aria-label`。看板总览的「活跃 / 已隐藏 / 看板 / 表格」原来用 antd `Segmented` 自带的 `tooltip`（默认进入延迟），改成 `Hint` 包 label。

### 提示去重

只给「文字已经完整显示」的元素去掉提示：

- 标题栏普通模式（页面名就在图标旁），紧凑模式只有图标，保留；
- 设置页的声音路径（显示的就是文件名）与主题按钮（名称就在按钮里）。

### 历史页日历浮层

`GridCalendar` 的格子提示是手写气泡，保留共享浮层（53 周 × 7 天，371 个 Tooltip 实例会明显增加挂载成本），只把颜色、字号、圆角、阴影换成同一组变量。

## 待定：SVG 内部 `<title>`（4 处）

| 文件 | 处数 | 问题 |
| --- | --- | --- |
| `src/components/Visualization/Badge/Badge.tsx` | 2 | 已花 / 剩余两个分区提示，一个 Hint 表达不了 |
| `src/components/Visualization/Bar/Bar.tsx` | 1 | 每列一个提示，包外层后只剩一个 |
| `src/renderer/components/Timer/PomodoroNumView.tsx` | 1 | 图形内部 |

## 风险

- **数量**：`Hint` 未打开时不渲染 popup DOM，但每个实例仍是一个组件 + 事件绑定。看板一屏几十张卡片时不要给每个标签、每行文字都加，只包需要解释的图标按钮。
- **可访问性**：原生 `title` 也提供可访问名称；迁移时凡是只有图标或符号的触发元素都补了 `aria-label`，不能再退化。
- **disabled 元素**：原生 `title` 对 disabled 按钮仍有效，`Hint` 依赖鼠标事件，disabled 时不显示。未分配面板的链接按钮属于这种情况。

## 验收

- 提示在指针进入的那一帧出现；
- `pnpm test` 全绿；
- 看板 hover 与迁移前相比无可感知的卡顿。
