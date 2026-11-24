# 测试合规：存量违规清单

Status: open（持续追加，不排期）

## 这份文件怎么用

`docs/testing.md` 的判据针对所有测试，不只是新写的。改某个测试文件时如果发现**既有**用例也不合规，不要顺手重写（见 `AGENTS.md`「测试约定」最后一条），在这里按测试文件加一节，写清现象、规范依据、修法，把 slug 记进下面的索引。

修完之后整节删掉（`.scratch/` 只放还没做完的工作），并更新索引。

| 测试文件 | 条目 | 记录于 |
| --- | --- | --- |
| `src/renderer/components/Timer/Timer.test.tsx` | 三条提示音用例依赖 `DEBUG_TIME_SCALE = 120` | 2026-11-24 |

## `src/renderer/components/Timer/Timer.test.tsx`

**现象**：`plays the short break sound at the configured volume when a break ends`、`plays the long break sound when the fourth break ends`、`falls back to the bundled chime when the file cannot be played` 三条用例用 `targetTime: Date.now() + 1` 加 `jest.advanceTimersByTime(1000)` 驱动会话结束。它们只在 `DEBUG_TIME_SCALE = 120`（`src/config.ts` 的非生产默认值）下通过；把倍速改成 1（本地观察动画时的常规操作）后三条全挂，`played` 为空——1ms 的墙钟剩余在 1 倍速下撑不到会话结束，`onDone` 不会触发。

**规范依据**：`docs/testing.md` 的判据——测试应只依赖被测行为。这三条测的是「会话结束 → 播放提示音」，却把结果绑在一个可被本地调试开关改写的全局配置上，属于环境耦合，不是契约。

**修法**（待做）：把 `timeScale` 变成可注入的 seam（测试里 mock `config` 模块，或让 `countdownSeconds` / `progressPercent` 的调用方接受 scale 参数），用例显式使用自己声明的倍速；或者不再用 1ms 的剩余时间去博 120 倍速，改成把 `targetTime` 设到「距离结束不足一个采样周期」的绝对时间点，让 `onDone` 在 1 倍速下也必然触发。选哪种取决于 `timeScale` 还要不要保留全局读取。

## 已修复

- `src/renderer/components/Kanban/Board/BoardBrief.test.tsx`（2026-11-21，17 条用例全部改跑真实组件与真实存储）。
- `src/components/Visualization/Badge/Badge.test.tsx`（2026-11-21，10 条用例改断言纯函数与 hook 状态，不再读 `clipPath` 的 `transform`）。
- `Application.test.tsx` 的窗口按钮（2026-11-22，`.ant-tabs-extra-content button` → `getByRole('button', { name })`）。
- `MiniLogger.smoke.test.tsx` 的图标与布局类名（2026-11-22，`[class*="anticon-"]` 与 `withClass` 全部删除：图标改按按钮的 `aria-label`，两行布局的结构断言在 jsdom 里观察不到，换成任务名可见 + 控制按钮存在）。
- `Application.test.tsx` 的其余 DOM 内部细节（2026-11-22）：`.ant-tabs-tab` → `getAllByRole('tab')`；`.ant-modal` → `within(popupLayer).getByRole('dialog')`；`.ant-modal-wrap` → `getByRole('dialog').parentElement`；`[data-testid="window-ring"]` → 按图层顺序取 `main.children[2]`（产品里的 testid 已删除）；`kanban-page` 的 mock 改成带文本的 div，按文本观察挂载。CSS 形状断言保留，定位从 `style[data-styled]` 换成全部 `style` 标签，仍用元素自身的 `classList` 关联规则——这是 jsdom 里唯一能观察两条渲染性能硬约束的方式。
- `MiniLogger.smoke.test.tsx` 的秒针与确认动画（2026-11-22）：把秒针角度提成 `common/Mini/secondHand.ts` 的 `advanceSecondHand` / `isSecondHandVisible`，组件只保留一个 `handState` 字段。跨分钟不回退、节流渲染一次跳多秒、暂停保持刻度、新一轮归零都由纯函数测试覆盖，DOM 测试里依赖 `.timer-orbit` / `.timer-confirm` 的 5 条全部删除——它们断言的是 SVG 图形与生成的动画 CSS，jsdom 没有观察点。
- `TimeTreemap.test.tsx` 的调参值与 `levels` 结构（2026-11-23）：删掉 `animationDuration` / `animationDurationUpdate` / `animationEasing` / `itemStyle.borderRadius` / `squareRatio > 1` 与 `borderWidth` 断言，主用例只留面板身份、左右分区与「不可平移缩放」；`levels[].color` 拆成独立用例「两层共用同一条调色板，夜间不复用日间那套」，只比较结构内的一致性，不钉具体色值。`BLOCK_RADIUS` 随之不再导出。
- `Search.test.tsx` 的展开驱动与输入框取值（2026-11-23）：`container.firstElementChild.click()` → `getByRole('button', { name: 'Search' })`，`container.querySelector('input')` → `getByRole('textbox', { name: 'Search' })`；「失活后清空」改成离开再回来重新展开、断言输入框为空，不再读取已隐藏 input 的 `value`。
