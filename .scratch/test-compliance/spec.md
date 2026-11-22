# 测试合规：存量违规清单

Status: open（持续追加，不排期）

## 这份文件怎么用

`docs/testing.md` 的判据针对所有测试，不只是新写的。改某个测试文件时如果发现**既有**用例也不合规，不要顺手重写（见 `AGENTS.md`「测试约定」最后一条），在这里按测试文件加一节，写清现象、规范依据、修法，把 slug 记进下面的索引。

修完之后整节删掉（`.scratch/` 只放还没做完的工作），并更新索引。

| 测试文件 | 条目 | 记录于 |
| --- | --- | --- |
| `src/components/common/Search/Search.test.tsx` | 用 `container.firstElementChild` 与 `querySelector('input')` 驱动展开与输入 | 2026-11-22 |
| `src/components/Visualization/TimeTreemap/TimeTreemap.test.tsx` | 断言动画时长/缓动/圆角等调参值与 `levels[].color` 结构 | 2026-11-23 |

## `src/components/Visualization/TimeTreemap/TimeTreemap.test.tsx`

**现象**：`lays the two treemap panels side by side filling the canvas` 同时断言 `animationDuration`(100)、`animationDurationUpdate`(500)、`animationEasing`、`itemStyle.borderRadius`(=`BLOCK_RADIUS`) 与 `levels[].color` 的形状。前四项是视觉调参值：把入场动画从 100ms 改成 150ms、圆角从 4 改成 3，用户看到的行为（图表很快出现、块带圆角）没变，用例却挂。`levels[].color` 更明显：加了共享项目配色后，项目面板的 `levels` 只是没有 `boards` 时的兜底，断言它钉住的是上色机制，不是「不同项目颜色不同」这个结果。

**规范依据**：`docs/testing.md`「判据」与「可测的契约」——常量与结构要能说清算契约还是代理断言；`AGENTS.md`「测试约定」要求新增/改动测试时回答这个问题。

**修法**：删掉动画时长、缓动、圆角半径这四条断言（或只保留一条带 `// Regression:` 的曲线用例）；`levels` 只断言存在与两档一致，项目颜色改由已有的 `keeps a project on the same color when its rank changes` 覆盖。

## `src/components/common/Search/Search.test.tsx`

**现象**：`clears its local query when its page becomes inactive` 与 `computes the tag panel once per open` 用 `view.container.firstElementChild.click()` 展开搜索条，用 `view.container.querySelector('input')` 取输入框。样式组件的外层结构或输入框包裹方式一变，用例就挂，而用户可见行为没变。

**规范依据**：`docs/testing.md`「判据」——`data-testid`、具体容器类型不算行为；测试把实现重写一遍后应当仍然通过。

**修法**：本次改动已让收起的搜索条带上 `role="button"` 与 `aria-label`，改用 `getByRole('button', { name: 'Search' })` 触发展开，输入框改用 `getByRole('textbox', { name: 'Search' })`。

已修复：

- `src/renderer/components/Kanban/Board/BoardBrief.test.tsx`（2026-11-21，17 条用例全部改跑真实组件与真实存储）。
- `src/components/Visualization/Badge/Badge.test.tsx`（2026-11-21，10 条用例改断言纯函数与 hook 状态，不再读 `clipPath` 的 `transform`）。
- `Application.test.tsx` 的窗口按钮（2026-11-22，`.ant-tabs-extra-content button` → `getByRole('button', { name })`）。
- `MiniLogger.smoke.test.tsx` 的图标与布局类名（2026-11-22，`[class*="anticon-"]` 与 `withClass` 全部删除：图标改按按钮的 `aria-label`，两行布局的结构断言在 jsdom 里观察不到，换成任务名可见 + 控制按钮存在）。
- `Application.test.tsx` 的其余 DOM 内部细节（2026-11-22）：`.ant-tabs-tab` → `getAllByRole('tab')`；`.ant-modal` → `within(popupLayer).getByRole('dialog')`；`.ant-modal-wrap` → `getByRole('dialog').parentElement`；`[data-testid="window-ring"]` → 按图层顺序取 `main.children[2]`（产品里的 testid 已删除）；`kanban-page` 的 mock 改成带文本的 div，按文本观察挂载。CSS 形状断言保留，定位从 `style[data-styled]` 换成全部 `style` 标签，仍用元素自身的 `classList` 关联规则——这是 jsdom 里唯一能观察两条渲染性能硬约束的方式。
- `MiniLogger.smoke.test.tsx` 的秒针与确认动画（2026-11-22）：把秒针角度提成 `common/Mini/secondHand.ts` 的 `advanceSecondHand` / `isSecondHandVisible`，组件只保留一个 `handState` 字段。跨分钟不回退、节流渲染一次跳多秒、暂停保持刻度、新一轮归零都由纯函数测试覆盖，DOM 测试里依赖 `.timer-orbit` / `.timer-confirm` 的 5 条全部删除——它们断言的是 SVG 图形与生成的动画 CSS，jsdom 没有观察点。
