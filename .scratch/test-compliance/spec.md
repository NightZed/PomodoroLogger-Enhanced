# 测试合规：存量违规清单

Status: open（持续追加，不排期）

## 这份文件怎么用

`docs/testing.md` 的判据针对所有测试，不只是新写的。改某个测试文件时如果发现**既有**用例也不合规，不要顺手重写（见 `AGENTS.md`「测试约定」最后一条），在这里按测试文件加一节，写清现象、规范依据、修法，把 slug 记进下面的索引。

修完之后整节删掉（`.scratch/` 只放还没做完的工作），并更新索引。

| 测试文件 | 条目 | 记录于 |
| --- | --- | --- |
| `Timer/Timer.test.tsx` | 内部 monitor / sessionManager / 子组件被 mock，断言 mock 调用次数 | 2026-11-28 |
| `Setting/Setting.test.tsx` | 内部数据层与三个对话框被 mock | 2026-11-28 |

## 待修复

### `src/renderer/components/Timer/Timer.test.tsx`

- **现象**：`jest.mock('../../monitor')`、`jest.mock('../../monitor/sessionManager')`、`jest.mock('../Kanban/Board')`、`jest.mock('./FocusSelector')`、`jest.mock('./Progress')`、`jest.mock('./SessionEndingMask')`、`jest.mock('../../../components/common/Mini/MiniLogger')`、`jest.mock('../UserGuide/HelpIcon')`、`jest.mock('./iconMaker')`；用例断言 `mockMonitorInstances[0].start`、`setTrayImageWithMadeIcon` 的调用。
- **依据**：`docs/testing.md`「mock 只停在边界」——应用内部一切跑真实现；「行是行为，次数是实现」，断言 mock 被调用不算观察点。
- **修法**：数据层换 `test/dbBridge` 的内存库；遮罩、迷你条、进度环、项目选择器跑真实组件，按 role 与可见文本断言；托盘图标改断言 `window.api.setTrayImage` 收到的 payload（IPC 是边界）。`iconMaker` 用 canvas，jsdom 没有 2d 上下文，这一层可以留作环境边界，但它的调用次数仍不是断言对象。

### `src/renderer/components/Setting/Setting.test.tsx`

- **现象**：`jest.mock('./DistractingList')`、`jest.mock('./DataRepairDialog')`、`jest.mock('./ImportReportDialog')`、`jest.mock('../../dbs')`、`jest.mock('../../monitor/sessionManager')`。
- **依据**：同上。
- **修法**：`dbs` 换真实内存库；三个对话框跑真实组件，按 `role="dialog"` 与可见文本定位。页面主题是编排（扫描 / 打开 / 应用 / 重扫），对话框行为由各自的测试覆盖，页面测试只需断言打开的对话框与结果文本。

## 已修复

- `Kanban/List/List.test.tsx`（2026-11-26）：窗口用例不再数 `[data-card-id]`，改成比较隐藏前后可见卡片数量；预览用例不再读 `.kanban-card-preview` / `.kanban-card`，改为三张卡片的标题都能读到。`List scroll state` 整条删除——`pl-list-scrolling` 是纯视觉类名，jsdom 观察不到滚动条外观，滚动跟随窗口的行为已有窗口用例覆盖。`data-pl-scroller` 保留为 dnd mock 注入的事件手柄，不参与断言。
- `Kanban/Card/Card.test.tsx`（2026-11-26）：5 条 `getComputedStyle().backgroundImage` 悬停用例删除，几何与时序判断提成 `Card/hover.ts` 的 `isPointerInside` / `isElementUnderPointer` / `isPostDropCheck`，并补 `hover.test.ts`（矩形边界、命中栈含后代、500ms 落位窗口）。标签点击改按 `#prod` 文本定位，删除 `.pl-tag` 与 `.kanban-card*` 断言。`.search-highlight` 保留：它被 `style/Markdown.ts` 消费，高亮没有 role，jsdom 观察不到背景色，是唯一观察点。
- `Kanban/Kanban.test.tsx`（2026-11-26）：删掉 Board、Overview、UnassignedPanel、useUnassignedSessions、PlayPauseButton、BoardEditor、Hotkeys、Search、feedback 共 9 个内部 mock，改为真实 reducer + Provider 渲染整页；断言从 `__formProps` / `__hotkeys` / `__searchProps` / `data-testid` 改为 role、可见文本、真实确认框与 dispatch 的 action。只保留 dnd 与 antd TextArea 两个外部库边界（TextArea 在 jsdom 里会写 `height: NaN`，`BoardEditor.test.tsx` 同法）。未挂卡查询用 pending promise 挡住，避免断言后落 setState；重挂载计数改成 `dragActivity` 重置加列表仍可见。

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
