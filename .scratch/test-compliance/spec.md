# 测试合规：存量违规清单

Status: open（持续追加，不排期）

## 这份文件怎么用

`docs/testing.md` 的判据针对所有测试，不只是新写的。改某个测试文件时如果发现**既有**用例也不合规，不要顺手重写（见 `AGENTS.md`「测试约定」最后一条），在这里按测试文件加一节，写清现象、规范依据、修法，把 slug 记进下面的索引。

修完之后整节删掉（`.scratch/` 只放还没做完的工作），并更新索引。

| 测试文件 | 条目 | 记录于 |
| --- | --- | --- |
| `src/renderer/components/Kanban/Board/BoardBrief.test.tsx` | 10 | 2026-11-21 |

## `src/renderer/components/Kanban/Board/BoardBrief.test.tsx`

行号截至 `5274a5f`，改动后请以测试名定位。

| 位置 | 现状 | 规范依据 | 修法 |
| --- | --- | --- | --- |
| 12–16 `jest.mock('./PlayPauseButton')` | 换成 `<button data-testid="play-pause" data-play>` | 应用内部组件应跑真实现 | 用真实组件，按可见语义（图标 / aria-label）判别播放与暂停 |
| 17–19 三个 `jest.mock('...action')` | `setPin` / `setBoardId` / `setConfiguringBoardId` 全被替身 | 内部模块不是边界；应断言 dispatch 出去的 action 或落库的行 | 用真实 store，断言 `store.dispatch` 收到的 action 对象；`setPin` 走 `dbBridge` 的真实 repository，断言 board 那一行 |
| 20–22 `ProjectTrend` → `<div data-testid="trend">` | 内部组件替身 | 同上 | 真实 `IdTrend` 需要 session 数据；确认能否在 `dbBridge` 下渲染，否则把「是否挂载」的判断落在外层容器可见文本上 |
| 23 `ListsCountBar` → `null` | 内部组件被置空 | 同上 | 评估真实组件的查询成本；若它只是纯展示，直接跑真的 |
| 24–30 `TimeBadge` 替身 | 断言 `spent-3-left-1` | 同上。原先的理由「时长在 SVG 里、没有可读文本」不成立——SVG `<text>` 是 DOM 文本，`container.textContent` 能读到 | 真实 `TimeBadge`，断言卡片里出现的小时文本（`formatTime` 的产物） |
| 35–39 `Pin` 替身 + 40–43 `feedback` 替身 | 断言 `data-pinned`、`feedback.toast` 的调用参数 | 内部模块 mock；toast 内容属于用户可见 | 真实 `Pin` 与 feedback 层，断言 toast 的可见文本 |
| 212 `getByTestId('trend-animation').classList.contains('pl-trend')` | 断言 `className` | 判据表明确列为「不算」 | 删除；同一用例已经在断言图表仍挂载，CSS 显隐本来就不可在 jsdom 里验证 |
| 337 `getAttribute('data-play')` | 断言替身收到的 prop | 实现断言 | 随 `PlayPauseButton` 换成真实组件后改为断言可见状态 |
| 325 / 371 / 380 `expect(actions.xxx).toHaveBeenCalledWith(...)` | 断言被 mock 的内部函数被调用 | 应断言 dispatch 的 action / 落库的行 | 与上面的 action mock 一并解决 |
| 5 条 trend 用例 | 没有 `// Regression:` | 不显而易见的行为要写明防什么 | 补注释，说明防的是「悬停扫过就发查询 / 图表常驻」这类事故 |

`renderBrief` 已经 `jest.spyOn(store, 'dispatch')` 并把 `dispatch` 返回出去了，但没有任何断言用到它——改造时优先复用它。

### 这一节的验收

- 文件里不再有应用内部的 `jest.mock`（`fs` / `electron` / 时钟 / worker 除外）。
- 没有断言 `className`、`data-testid` 的存在、或 mock 函数被调用。
- `pnpm test src/renderer/components/Kanban/Board/BoardBrief.test.tsx`、`pnpm typecheck`、`pnpm lint` 通过。

### 非目标

- 不改 `BoardBrief` 的组件实现与行为。
- 不重命名现有测试；只在需要时补 `// Regression:`。
- 不动其它测试文件——它们各自在本文件里加一节。
