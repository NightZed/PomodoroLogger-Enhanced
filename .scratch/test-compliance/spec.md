# 测试合规：存量违规清单

Status: open（持续追加，不排期）

## 这份文件怎么用

`docs/testing.md` 的判据针对所有测试，不只是新写的。改某个测试文件时如果发现**既有**用例也不合规，不要顺手重写（见 `AGENTS.md`「测试约定」最后一条），在这里按测试文件加一节，写清现象、规范依据、修法，把 slug 记进下面的索引。

修完之后整节删掉（`.scratch/` 只放还没做完的工作），并更新索引。

| 测试文件 | 条目 | 记录于 |
| --- | --- | --- |
| `src/components/common/Mini/MiniLogger.smoke.test.tsx` | 2 类 SVG 图形类名（无合规替代） | 2026-11-22 |

已修复：

- `src/renderer/components/Kanban/Board/BoardBrief.test.tsx`（2026-11-21，17 条用例全部改跑真实组件与真实存储）。
- `src/components/Visualization/Badge/Badge.test.tsx`（2026-11-21，10 条用例改断言纯函数与 hook 状态，不再读 `clipPath` 的 `transform`）。
- `Application.test.tsx` 的窗口按钮（2026-11-22，`.ant-tabs-extra-content button` → `getByRole('button', { name })`）。
- `MiniLogger.smoke.test.tsx` 的图标与布局类名（2026-11-22，`[class*="anticon-"]` 与 `withClass` 全部删除：图标改按按钮的 `aria-label`，两行布局的结构断言在 jsdom 里观察不到，换成任务名可见 + 控制按钮存在）。
- `Application.test.tsx` 的其余 DOM 内部细节（2026-11-22）：`.ant-tabs-tab` → `getAllByRole('tab')`；`.ant-modal` → `within(popupLayer).getByRole('dialog')`；`.ant-modal-wrap` → `getByRole('dialog').parentElement`；`[data-testid="window-ring"]` → 按图层顺序取 `main.children[2]`（产品里的 testid 已删除）；`kanban-page` 的 mock 改成带文本的 div，按文本观察挂载。CSS 形状断言保留，定位从 `style[data-styled]` 换成全部 `style` 标签，仍用元素自身的 `classList` 关联规则——这是 jsdom 里唯一能观察两条渲染性能硬约束的方式。

## `src/components/common/Mini/MiniLogger.smoke.test.tsx`

**现象**：`.timer-orbit`（秒针）与 `.timer-confirm`（确认态的扫描高亮）仍作为查询与断言的锚点，前者还用它读内联 `transform` 的角度。

**为什么还没改**：这两个都是纯 SVG 图形，没有 role、没有文本、没有可访问名称，jsdom 也没有布局与合成层。角度和动画是真实行为，但唯一能观察到的载体就是这两个节点本身；换成 `data-testid` 只是把耦合改个名字，规范同样不允许。可选的方向只有两个：

- 把「秒针角度」从渲染里提成一个纯函数（输入 `secondsLeft` / 运行状态，输出角度），像 `Badge.tsx` 的 `halfAtOffset` 那样单独测，DOM 只留一条「图形存在」；
- 或者接受这个仓库在 jsdom 里不覆盖动画细节，删除这几条，交给真机检查。

前者是产品重构，后者会丢回归保护（「跨分钟时不倒转」是一次真实事故），需要单独排期决定。在做出选择之前，这两处保持现状。
