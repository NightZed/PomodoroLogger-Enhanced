# 测试合规：存量违规清单

Status: open（持续追加，不排期）

## 这份文件怎么用

`docs/testing.md` 的判据针对所有测试，不只是新写的。改某个测试文件时如果发现**既有**用例也不合规，不要顺手重写（见 `AGENTS.md`「测试约定」最后一条），在这里按测试文件加一节，写清现象、规范依据、修法，把 slug 记进下面的索引。

修完之后整节删掉（`.scratch/` 只放还没做完的工作），并更新索引。

| 测试文件 | 条目 | 记录于 |
| --- | --- | --- |
| `src/components/Visualization/Badge/Badge.test.tsx` | 5 处（断言 `clipPath` 的 `transform` 属性） | 2026-11-21 |

已修复：`src/renderer/components/Kanban/Board/BoardBrief.test.tsx`（2026-11-21，17 条用例全部改跑真实组件与真实存储）。

## `src/components/Visualization/Badge/Badge.test.tsx`

**现象**：`transforms()` 助手取 `clipPath path` 的 `transform` 属性做断言（`translate(0 0)` / `translate(168 0)`），5 条用例全部依赖它。这是实现细节——把徽章的显隐从「平移 clipPath」换成 CSS `opacity`、`visibility` 或条件渲染，行为完全不变，测试会全红。

**规范依据**：`docs/testing.md` 的判据是「把实现重写一遍、只保留外部可观察行为，测试应当仍然通过」。`clipPath` 的 `transform` 不属于行为，也不属于用户可见的 role / 文本 / 启用禁用。

**修法**：把「当前显示哪一段」从组件里提成一个导出的纯函数（例如 `resolveVisibleHalf(spentTime, leftTime, clipState)`），单独断言它的返回值；DOM 测试只保留文本存在性（`texts()` 已经可用）。这样裁剪方式可以自由替换，而显隐规则仍有覆盖。

**为什么不顺手改**：这次只新增了两条用例，存量 3 条 + 助手都是同一个模式；重写会让「修复已花时间被隐藏」和「测试重构」混在一起，评审时分不清。

