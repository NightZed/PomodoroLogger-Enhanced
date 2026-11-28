# 测试存量清理

既有测试按 `testing.md` 整改过的记录。
它不是规范，是工作账本：每个文件一行，说明这份测试已经按判据重写过——避免后来者以为整份文件都合规，或者重复整改。

这里是**已完成**的一半。待清理的条目记在 `.scratch/test-compliance/spec.md`（单文件，按测试文件分节，不拆票）。
修完后把一行移进下面的「已清理」，再从 scratch 删掉那一节；清空即删目录。
不要顺手重写：行为改动和测试重构要能分开评审。

## 已清理

- `src/renderer/components/Timer/Timer.test.tsx`（2026-11-28）：monitor、sessionManager、iconMaker 三个替身删除，今日列表接内存库，托盘断言读 IPC payload。（2026-11-24：删圆点组件 mock；提示音用例改用 `justExpired()`。）
- `src/renderer/components/Setting/Setting.test.tsx`（2026-11-28）：`dbs` 与 `sessionManager` 替身删除，三个对话框真实渲染，`feedback` 文案不再手抄。（2026-11-25：滑块桩去掉 `data-testid`，数据检查断言文案与原因。）
- `src/renderer/components/Kanban/List/List.test.tsx`（2026-11-26）：窗口用例改比较隐藏前后的可见卡片数量，预览用例改读三张卡片标题。
- `src/renderer/components/Kanban/Card/Card.test.tsx`（2026-11-26）：悬停几何提成 `Card/hover.ts` 的纯函数，标签点击按文本定位。
- `src/renderer/components/Kanban/Kanban.test.tsx`（2026-11-26）：9 个内部 mock 删除，改真实 reducer + Provider，断言换成 role、可见文本与 dispatch 的 action。
- `src/renderer/components/Setting/PreviewSlider.test.tsx`（2026-11-25）：`onPreview` 改断言收到的值序列。
- `src/renderer/components/Timer/SessionEndingMask.test.tsx`（2026-11-24）：删圆点组件 mock，夹具换成完整的记录工厂。
- `src/components/Visualization/TimeTreemap/TimeTreemap.test.tsx`（2026-11-23）：删调参值与 `levels` 结构断言，只留面板身份与调色板一致性。
- `src/components/common/Search/Search.test.tsx`（2026-11-23）：展开与输入框改按 role 查询。
- `src/renderer/components/Application.test.tsx`（2026-11-22）：窗口按钮与 DOM 内部细节改按 role 与图层顺序。
- `src/components/common/Mini/MiniLogger.smoke.test.tsx`（2026-11-22）：图标改按 `aria-label`，秒针角度提成 `secondHand.ts`。
- `src/renderer/components/Kanban/Board/BoardBrief.test.tsx`（2026-11-21）：17 条用例改跑真实组件与真实存储。
- `src/components/Visualization/Badge/Badge.test.tsx`（2026-11-21）：改断言纯函数与 hook 状态，不再读 `clipPath` 的 transform。
