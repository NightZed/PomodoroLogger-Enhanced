# 原生 title 迁移到 antd Tooltip

Status: pending（清单与批次已定，未开始）

## 背景

原生 `title` 属性要悬停约 1 秒才出现提示，样式也由系统决定；看板卡片、计时器、窗口控制这些高频位置的手感因此很差。目标是把提示统一换成 antd `Tooltip`（默认约 0.1s），同时不牺牲键盘与读屏语义。

## 现状

`src/` 非测试代码共 79 处 `title=`：

| 类别 | 数量 | 处理 |
| --- | --- | --- |
| `Modal` / `AppModal` / `Statistic` / notification 的标题 | ~18 | 不动，不是 tooltip |
| 已经是 `Tooltip` | ~5 | 不动 |
| 原生 HTML `title` 属性 | ~49 | 迁移 |
| SVG 内部 `<title>` 元素 | 7 | 待定 |

处数以 `grep -rn "title=" --include=*.tsx --include=*.ts src/` 为准，逐行核对时更新本节。

## 统一封装（已实现）

`src/components/common/Hint/Hint.tsx`：

- `mouseEnterDelay` 0.05s、`mouseLeaveDelay` 0（几乎瞬时，离开立刻消失）；
- `maxWidth` / `zIndex` / `getPopupContainer` 按需透传；
- `label` 为空或只含空白时直接返回子元素，不挂 Tooltip；
- 不改子元素的 `aria-label`，上一轮补的动作名称保留。

测试在 `Hint.test.tsx`：50ms 后出现提示；空白 label 不渲染 overlay。

## 第一批：窗口与计时（已完成 2026-11-21）

| 文件 | 处数 | 说明 |
| --- | --- | --- |
| `src/renderer/components/WindowControls.tsx` | 4 | 最小化 / 最大化 / 还原 / 关闭 |
| `src/components/common/Mini/MiniLogger.tsx` | 11 | 播放、暂停、结束、停止、扩展、任务名 |
| `src/renderer/components/Timer/Timer.tsx` | 10 | 控制按钮、紧凑 / 迷你、主题 |
| `src/renderer/components/Timer/SessionEndingMask.tsx` | 3 | +5 / +10、卡片名 |

原来只有原生 title 的按钮补了 `aria-label`，测试从读 `title` 改为读 `aria-label`。

## 已统一：历史页日历的自定义浮层

`src/components/Visualization/GridCalendar/GridCalendar.tsx` 的格子提示是一个手写的绝对定位气泡，不是原生 title。这里保留共享浮层（53 周 × 7 天，371 个 Tooltip 实例会明显增加历史页挂载成本），只把背景、文字色、字号、行高、圆角、阴影换成 antd token，外观与 `Hint` 一致。


## 第二批：看板

| 文件 | 处数 | 说明 |
| --- | --- | --- |
| `src/renderer/components/Kanban/Board/BoardBrief.tsx` | 2 | 标题、描述 |
| `src/components/Visualization/Badge/Badge.tsx` | 1 | 评级字母（`AccuracyGrade` 的 title） |
| `src/renderer/components/Kanban/Card/CardEditor.tsx` | 2 | 删除线、插入链接（`Modal` 的 title 不动） |
| `src/renderer/components/Kanban/Card/LabelEditor.tsx` | 2 | 标签名、移除 |
| `src/renderer/components/Kanban/CardPicker.tsx` | 1 | 卡片标题 |
| `src/renderer/components/Kanban/ListPickerBody.tsx` | 1 | 列表标题 |
| `src/renderer/components/Kanban/ProjectPicker.tsx` | 1 | 看板名 |
| `src/renderer/components/Kanban/Board/UnassignedPanel.tsx` | 1 | 第 377 行，逐行核对时确认元素 |

## 第三批：设置、历史与对话框

| 文件 | 处数 |
| --- | --- |
| `src/renderer/components/Setting/Setting.tsx` | 1 |
| `src/renderer/components/Setting/DataRepairDialog.tsx` | 2 |
| `src/renderer/components/History/SessionDayEditor.tsx` | 2 |
| `src/renderer/components/AppTitleBar/AppTitleBar.tsx` | 1 |
| `src/renderer/components/UserGuide/UserGuide.tsx` + `HelpIcon.tsx` | 2 |

## 待定：SVG 内部 `<title>`

| 文件 | 处数 | 问题 |
| --- | --- | --- |
| `src/components/Visualization/Badge/Badge.tsx` | 2 | 已花 / 剩余两个分区提示，一个 Tooltip 表达不了 |
| `src/components/Visualization/Bar/Bar.tsx` | 1 | 每列一个提示，包外层后只剩一个 |
| `src/components/common/Mini/MiniLogger.tsx` | 2 | 图形内部 |
| `src/renderer/components/Timer/PomodoroNumView.tsx` | 1 | 图形内部 |
| `src/components/Visualization/PomodoroDot.tsx` | 1 | 图形内部 |

## 风险

- **测试**：大量 `getByTitle` 依赖 title 属性，预计 15–20 条要改成 tooltip 文本断言（内容在 portal 里）。
- **自定义组件**：`Chip`、`ChipName`、`ThemeToggle`、`Pin`、`HelpIcon` 需要 `forwardRef`，否则 Tooltip 拿不到 DOM 节点。
- **看板性能**：一张卡片有 Pin、时间、评级、标签多个触发点；Tooltip 参与 hover 后成本高于「改一个 CSS 类」。第二批动手前先量一次 hover 帧率。
- **可访问性**：原生 title 对键盘与读屏也生效；迁移后 `aria-label` 不能丢，否则上一轮的图标语义修复会退化。

## 验收

- 所有迁移处的提示在 0.2s 内出现；
- `pnpm test` 全绿；
- 看板 hover 与迁移前相比无可感知的卡顿。
