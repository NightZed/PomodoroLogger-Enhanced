# 03: Timer 轻量展示组件真实化

**What to build:** 计时页上的进度环、项目选择、迷你条与帮助入口真实渲染：迷你条展开后能看到真实的任务名与剩余时间，点确认与「开始下一场」能落到真实回调；帮助入口的悬停提示也能真的打开。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 帮助入口、项目选择、迷你条不再被替身替换（进度环见 Outcome）
- [x] 迷你条的展开、确认、开始下一场按按钮的可访问名称与可见文本断言，不再读替身透传的属性
- [x] 「子组件抛错时落到内层错误边界」这条用例仍成立，边界仍是计时自己的边界
- [x] `pnpm test src/renderer/components/Timer` 全绿（174 条）

## Outcome

**进度环无法真实化。** `Progress` 引 `antd/es/progress/Circle`，那是 ESM 入口，Jest 的 CommonJS 运行时加载不了（`Must use import to load ES Module`）。它与 canvas 同类，是环境边界，不是行为替身，因此保留替身并在注释里写清原因。

这也意味着错误边界用例仍靠这个替身抛错：没有真实数据能让进度环失败，而边界只能由子组件抛错来触发。边界本身仍由计时页自己的 class 组件承担，没有被包装组件替代。

**页面需要 Provider。** 帮助入口与项目选择都是 `connect` 的，此前靠替身绕开。`renderTimer` 现在包一层 `<Provider>`，store 用 identity reducer 加预置的 `timer.boardId` 与 `kanban.boards`——这些测试关心页面渲染什么，不关心它存了什么。

**迷你条的确认态要 props 推动。** `sessionEnding` 是 props，真实应用里由 store 置位；测试里 `rerenderTimer` 补上这一步，替身时期那个总是存在的确认按钮不再掩盖它。

断言全部换成可访问名称与可见文本：帮助入口按 `Help`（页面传 `resume`），展开按钮按 `Expand (F12)`，确认态按 `Start Next Session` / `Finish` 两个按钮的存在与否，任务名与时间按 `Board One` 与 `25` 的文本。
