# 测试合规：存量违规清单

Status: open（持续追加，不排期）

## 这份文件怎么用

`docs/testing.md` 的判据针对所有测试，不只是新写的。改某个测试文件时如果发现**既有**用例也不合规，不要顺手重写（见 `AGENTS.md`「测试约定」最后一条），在这里按测试文件加一节，写清现象、规范依据、修法，把 slug 记进下面的索引。

修完之后整节删掉（`.scratch/` 只放还没做完的工作），并更新索引。

| 测试文件 | 条目 | 记录于 |
| --- | --- | --- |
| `src/renderer/components/Timer/SessionEndingMask.test.tsx` | 整份文件 mock 掉应用内部的 `PomodoroNumView` | 2026-11-24 |

## `src/renderer/components/Timer/SessionEndingMask.test.tsx`

**现象**：文件顶部的 `jest.mock('./PomodoroNumView')` 把应用内部的圆点组件替换成一个占位 div（`Timer.test.tsx` 里也有同一个 mock）。遮罩自己画的圆点因此完全不可见，涉及计数的用例只能断言标题里的数字，无法验证「标题数量和下方实际画出的圆点一致」——而这正是 `pomodoros` 与 `newPomodoro` 两个来源最容易分叉的地方。用例里的 `PomodoroRecord` 也因此被写成 `{ _id } as any`，只是没炸而已。

**规范依据**：`docs/testing.md` 的「mock 停在哪」——只 mock `fs` / `electron` / `get-windows` / `electron-updater` / 时钟 / 随机数 / worker，应用内部的一切跑真实现。

**修法**（待做）：去掉这个 mock，让 `PomodoroNumView` 跑真实现；夹具补上组件实际读取的字段（`_id`、`startTime`、`efficiency`），按 `role="img"` 的 `aria-label` 或圆点数量断言。`Timer.test.tsx` 有同一个 mock，两处要一起改，否则会出现一个文件跑真实现、另一个打桩的分裂。属于存量整治，不要和功能改动混在一次提交里。

## 已修复

- `src/renderer/components/Timer/Timer.test.tsx` 的提示音用例（2026-11-24）：9 处 `targetTime: Date.now() + 1` 换成 `justExpired()`（`Date.now() - 1`）。原先靠开发环境的 120 倍速才能在 1 秒内把「剩 1ms」算成负数；1 倍速下第一次 500ms 采样仍是 0 秒，`onDone` 不触发，三条播放断言挂掉、几条静默断言变成空跑。改成已过期 1ms 后第一次采样就结束，与 `timeScale()` 无关；已分别在 120 与 1 两种倍速下跑通。

- `src/renderer/components/Kanban/Board/BoardBrief.test.tsx`（2026-11-21，17 条用例全部改跑真实组件与真实存储）。
- `src/components/Visualization/Badge/Badge.test.tsx`（2026-11-21，10 条用例改断言纯函数与 hook 状态，不再读 `clipPath` 的 `transform`）。
- `Application.test.tsx` 的窗口按钮（2026-11-22，`.ant-tabs-extra-content button` → `getByRole('button', { name })`）。
- `MiniLogger.smoke.test.tsx` 的图标与布局类名（2026-11-22，`[class*="anticon-"]` 与 `withClass` 全部删除：图标改按按钮的 `aria-label`，两行布局的结构断言在 jsdom 里观察不到，换成任务名可见 + 控制按钮存在）。
- `Application.test.tsx` 的其余 DOM 内部细节（2026-11-22）：`.ant-tabs-tab` → `getAllByRole('tab')`；`.ant-modal` → `within(popupLayer).getByRole('dialog')`；`.ant-modal-wrap` → `getByRole('dialog').parentElement`；`[data-testid="window-ring"]` → 按图层顺序取 `main.children[2]`（产品里的 testid 已删除）；`kanban-page` 的 mock 改成带文本的 div，按文本观察挂载。CSS 形状断言保留，定位从 `style[data-styled]` 换成全部 `style` 标签，仍用元素自身的 `classList` 关联规则——这是 jsdom 里唯一能观察两条渲染性能硬约束的方式。
- `MiniLogger.smoke.test.tsx` 的秒针与确认动画（2026-11-22）：把秒针角度提成 `common/Mini/secondHand.ts` 的 `advanceSecondHand` / `isSecondHandVisible`，组件只保留一个 `handState` 字段。跨分钟不回退、节流渲染一次跳多秒、暂停保持刻度、新一轮归零都由纯函数测试覆盖，DOM 测试里依赖 `.timer-orbit` / `.timer-confirm` 的 5 条全部删除——它们断言的是 SVG 图形与生成的动画 CSS，jsdom 没有观察点。
- `TimeTreemap.test.tsx` 的调参值与 `levels` 结构（2026-11-23）：删掉 `animationDuration` / `animationDurationUpdate` / `animationEasing` / `itemStyle.borderRadius` / `squareRatio > 1` 与 `borderWidth` 断言，主用例只留面板身份、左右分区与「不可平移缩放」；`levels[].color` 拆成独立用例「两层共用同一条调色板，夜间不复用日间那套」，只比较结构内的一致性，不钉具体色值。`BLOCK_RADIUS` 随之不再导出。
- `Search.test.tsx` 的展开驱动与输入框取值（2026-11-23）：`container.firstElementChild.click()` → `getByRole('button', { name: 'Search' })`，`container.querySelector('input')` → `getByRole('textbox', { name: 'Search' })`；「失活后清空」改成离开再回来重新展开、断言输入框为空，不再读取已隐藏 input 的 `value`。
