# 测试合规：存量违规清单

Status: open（持续追加，不排期）

## 这份文件怎么用

`docs/testing.md` 的判据针对所有测试，不只是新写的。改某个测试文件时如果发现**既有**用例也不合规，不要顺手重写（见 `AGENTS.md`「测试约定」最后一条），在这里按测试文件加一节，写清现象、规范依据、修法，把 slug 记进下面的索引。

修完之后整节删掉（`.scratch/` 只放还没做完的工作），并更新索引。

| 测试文件 | 条目 | 记录于 |
| --- | --- | --- |
| `src/renderer/components/Application.test.tsx` | 1 处（antd 内部类名） | 2026-11-22 |
| `src/components/common/Mini/MiniLogger.smoke.test.tsx` | 2 处（antd 内部类名） | 2026-11-22 |

已修复：

- `src/renderer/components/Kanban/Board/BoardBrief.test.tsx`（2026-11-21，17 条用例全部改跑真实组件与真实存储）。
- `src/components/Visualization/Badge/Badge.test.tsx`（2026-11-21，10 条用例改断言纯函数与 hook 状态，不再读 `clipPath` 的 `transform`）。

## `src/renderer/components/Application.test.tsx`

**现象**：第 447 行用 `document.querySelectorAll('.ant-tabs-extra-content button')` 找标题栏右侧的窗口按钮（`captionButtons`）。断言本身已经从 `title` 改成 `aria-label`，但定位仍挂在 antd 的内部类名上。

**规范依据**：`docs/testing.md` 的判据表把 `className` 列在「不算」一侧；antd 换版重命名这个容器时，行为不变而测试全红。

**修法**：窗口按钮是 `WindowControls` 渲染的，可以直接按可访问名称定位——`getByRole('button', { name: /^(Minimize|Maximize|Restore Down|Close)$/ })`，或者给这一组按钮的容器加一个 `data-` 钩子（引导已经在用 `data-tour`）。注意右上角还可能有置顶按钮，按名称过滤比按位置稳。

## `src/components/common/Mini/MiniLogger.smoke.test.tsx`

**现象**：
- `iconClasses()`（第 35 行）用 `querySelectorAll('[class*="anticon-"]')` 拼出所有图标的类名，再由断言逐个 `toContain('anticon-swap')` 等。
- `withClass(container, 'control-row')`（第 49 行起多处）用同样的方式取布局容器。

**规范依据**：`docs/testing.md:42` 已经点名过这个文件的 `querySelector('.anticon-close')`——测的是 antd 的内部类名，而不是「按钮存在、能关掉窗口」。同一个模式在 `iconClasses` 里还有一份。

**修法**：图标改按 `aria-label` 断言（按钮上已经有动作名称，例如 `Stop`、`Expand (F12)`，本次改动已经把按钮断言切过去了）；`control-row` 这类布局容器改用 `data-` 钩子，或者按角色/文本反推，而不是类名。修的时候整段一起改，别只换一处。
