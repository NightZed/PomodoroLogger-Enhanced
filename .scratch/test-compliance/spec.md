# 测试合规：存量违规清单

Status: open（持续追加，不排期）

## 这份文件怎么用

`docs/testing.md` 的判据针对所有测试，不只是新写的。改某个测试文件时如果发现**既有**用例也不合规，不要顺手重写（见 `AGENTS.md`「测试约定」最后一条），在这里按测试文件加一节，写清现象、规范依据、修法，把 slug 记进下面的索引。

修完之后整节删掉（`.scratch/` 只放还没做完的工作），并更新索引。

| 测试文件 | 条目 | 记录于 |
| --- | --- | --- |
| `Kanban/List/List.test.tsx` | 窗口挂载数读 `data-card-id`；预览/完整视图与滚动状态读 `.kanban-card*`、`.pl-list-scrolling` | 2026-11-26 |
| `Kanban/Card/Card.test.tsx` | 点击与悬停用例读 `.kanban-card*`、`.pl-tag`，并用 `getComputedStyle().backgroundImage` 断言悬停色 | 2026-11-26 |
| `Kanban/Kanban.test.tsx` | mock 了 8 个应用内部模块（Board/Overview/Search/Hotkeys/feedback 等），并断言 `__searchProps` 收到的 props | 2026-11-26 |

## 待修复

### `Kanban/List/List.test.tsx`

**现象**：窗口用例用 `document.querySelectorAll('[data-card-id]')` 数挂载的卡片（第 145、176 行）；预览用例断言 `container.querySelectorAll('.kanban-card-preview')` 与 `.kanban-card`（第 363–364 行）；滚动用例读 `scroller.classList.contains('pl-list-scrolling')`（第 520–535 行）。

**依据**：`docs/testing.md` 把 `className`、`data-testid` 列在「不算行为」；`data-card-id` 是窗口化渲染的内部记账属性，不是用户可见结果。

**修法**：挂载数量改成断言可见卡片的标题/正文文本集合（窗口只挂一段时，被裁掉的标题自然不在集合里）；预览与完整视图改按内容是否渲染 + 点击正文能否打开编辑器来区分；`pl-list-scrolling` 在 jsdom 里观察不到滚动条外观，应像 `common/Mini/secondHand.ts` 那样把「滚动中」提成可测的状态/纯函数，或删掉类名断言只保留窗口跟随滚动位置的行为。

### `Kanban/Card/Card.test.tsx`

**现象**：标签点击读 `.pl-tag`（第 159、172 行），卡片的预览/完整/注册状态读 `.kanban-card`、`.kanban-card-preview`（第 165–166、251–340 行），悬停高亮用 `getComputedStyle(card).backgroundImage` 断言 `linear-gradient` / `none`（第 254–340 行）。

**依据**：`className` 不算行为；`getComputedStyle` 读到的渐变形状是当前实现（叠加色方案），换一种同样可见的方案就会挂。

**修法**：点击目标与卡片身份改按 role、可访问名称或卡片标题定位；预览/完整视图按正文是否渲染区分（文件里已有 `p` 的断言可复用）；悬停高亮把「是否悬停」提成组件状态或纯函数再断言，jsdom 无法观察背景图时不要用样式字符串代替。

### `Kanban/Kanban.test.tsx`

**现象**：文件 mock 了 `./Board`、`./Board/Overview`、`./Board/UnassignedPanel`、`./Board/useUnassignedSessions`、`./Board/PlayPauseButton`、`./BoardEditor`、`../Hotkeys`、`../../../components/common/Search/Search`、`../feedback`，并把 `__searchProps` 里的 props 当作接线证据（本次新增用例沿用了这一模式）。

**依据**：`docs/testing.md` 规定 mock 停在 `fs` / `electron` / `get-windows` / `electron-updater` / 时钟 / worker；应用内部一律跑真实现。断言 mock 收到的 props 检查的是内部调用方式，用户可见行为变了它未必挂。

**修法**：分批换成真实渲染，按 role 与可见文本断言页面行为（`BoardBrief.test.tsx` 有全量改真实现的先例）。`Search` 换成真组件后，直接点 `.*` 按钮断言 `setSearchRegex` 被 dispatch，而不是读 props。

## 已修复

- `Setting.test.tsx`（2026-11-25）：`Slider` 桩上的 `data-testid` 删除，6 处取数改成 `getAllByRole('slider')`——桩本身就是 `input[type=range]`，role 来自元素语义，换掉桩也不会静默失效。数据检查失败的用例原先只数 `mockAlert` 的次数，现在断言标题序列 `['Could Not Check the Data']` 与失败原因：重复弹窗或弹错文案都会落在失败信息里。其余 feedback 断言本来就带 payload（标题、`content`、`actions`），次数只作为「不重复弹」的补充，未改。
- `PreviewSlider.test.tsx`（2026-11-25）：`onPreview` 的 `toHaveBeenCalledTimes(2)` 换成断言收到的值序列 `[20, 25]`。原来只数次数，丢了值也照样通过；现在失败信息直接列出实际收到的值，仍能发现「某次移动没上报」这个可见卡顿。
- `src/renderer/components/Timer/Timer.test.tsx` 的圆点组件 mock（2026-11-24）：删掉 `jest.mock('./PomodoroNumView')`，整页测试第一次真的渲染圆点；新增「draws one dot per pomodoro of the day」按 `role="img"` + `HH:MM` 的名称数点，确认真实组件与今日数据对得上。同一提交里 `SessionEndingMask.test.tsx` 也做了同样的清理。

- `src/renderer/components/Timer/SessionEndingMask.test.tsx` 的圆点组件 mock（2026-11-24）：删掉 `jest.mock('./PomodoroNumView')`，夹具换成完整的 `PomodoroRecord` 工厂；两条计数用例同时断言标题数字与 `role="img"` 的圆点数量，于是「标题数量和下方圆点一致」第一次真的被覆盖。

- `src/renderer/components/Timer/Timer.test.tsx` 的提示音用例（2026-11-24）：9 处 `targetTime: Date.now() + 1` 换成 `justExpired()`（`Date.now() - 1`）。原先靠开发环境的 120 倍速才能在 1 秒内把「剩 1ms」算成负数；1 倍速下第一次 500ms 采样仍是 0 秒，`onDone` 不触发，三条播放断言挂掉、几条静默断言变成空跑。改成已过期 1ms 后第一次采样就结束，与 `timeScale()` 无关；已分别在 120 与 1 两种倍速下跑通。

- `src/renderer/components/Kanban/Board/BoardBrief.test.tsx`（2026-11-21，17 条用例全部改跑真实组件与真实存储）。
- `src/components/Visualization/Badge/Badge.test.tsx`（2026-11-21，10 条用例改断言纯函数与 hook 状态，不再读 `clipPath` 的 `transform`）。
- `Application.test.tsx` 的窗口按钮（2026-11-22，`.ant-tabs-extra-content button` → `getByRole('button', { name })`）。
- `MiniLogger.smoke.test.tsx` 的图标与布局类名（2026-11-22，`[class*="anticon-"]` 与 `withClass` 全部删除：图标改按按钮的 `aria-label`，两行布局的结构断言在 jsdom 里观察不到，换成任务名可见 + 控制按钮存在）。
- `Application.test.tsx` 的其余 DOM 内部细节（2026-11-22）：`.ant-tabs-tab` → `getAllByRole('tab')`；`.ant-modal` → `within(popupLayer).getByRole('dialog')`；`.ant-modal-wrap` → `getByRole('dialog').parentElement`；`[data-testid="window-ring"]` → 按图层顺序取 `main.children[2]`（产品里的 testid 已删除）；`kanban-page` 的 mock 改成带文本的 div，按文本观察挂载。CSS 形状断言保留，定位从 `style[data-styled]` 换成全部 `style` 标签，仍用元素自身的 `classList` 关联规则——这是 jsdom 里唯一能观察两条渲染性能硬约束的方式。
- `MiniLogger.smoke.test.tsx` 的秒针与确认动画（2026-11-22）：把秒针角度提成 `common/Mini/secondHand.ts` 的 `advanceSecondHand` / `isSecondHandVisible`，组件只保留一个 `handState` 字段。跨分钟不回退、节流渲染一次跳多秒、暂停保持刻度、新一轮归零都由纯函数测试覆盖，DOM 测试里依赖 `.timer-orbit` / `.timer-confirm` 的 5 条全部删除——它们断言的是 SVG 图形与生成的动画 CSS，jsdom 没有观察点。
- `TimeTreemap.test.tsx` 的调参值与 `levels` 结构（2026-11-23）：删掉 `animationDuration` / `animationDurationUpdate` / `animationEasing` / `itemStyle.borderRadius` / `squareRatio > 1` 与 `borderWidth` 断言，主用例只留面板身份、左右分区与「不可平移缩放」；`levels[].color` 拆成独立用例「两层共用同一条调色板，夜间不复用日间那套」，只比较结构内的一致性，不钉具体色值。`BLOCK_RADIUS` 随之不再导出。
- `Search.test.tsx` 的展开驱动与输入框取值（2026-11-23）：`container.firstElementChild.click()` → `getByRole('button', { name: 'Search' })`，`container.querySelector('input')` → `getByRole('textbox', { name: 'Search' })`；「失活后清空」改成离开再回来重新展开、断言输入框为空，不再读取已隐藏 input 的 `value`。
