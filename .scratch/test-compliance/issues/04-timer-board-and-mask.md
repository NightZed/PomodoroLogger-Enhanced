# 04: Timer 看板与结束遮罩真实化

**What to build:** 会话结束时用户看到的是真实遮罩：显示今天的番茄数，而不是替身透传的计数属性；计时页下方挂载的是看板（见 Outcome：这一次没有做到）。

**Blocked by:** 03

**Status:** resolved

- [x] 结束遮罩不再被替身替换
- [x] 遮罩的显示与番茄数按角色与可见文本断言，不再读替身透传的属性
- [x] 看板这一项有了结论：保留替身，理由见 Outcome
- [x] `pnpm test src/renderer/components/Timer` 全绿（174 条）

## Outcome

**遮罩已真实化。** 断言从 `data-show` / `data-count` 换成 `role="group"` + `name="Session ending"`，计数读「Today Pomodoros 0」这句真实文案。原来的 `mask-cancel` / `mask-start` 两个替身按钮没有任何用例点击，所以没有对应断言要迁移——遮罩上的动作由 `SessionEndingMask.test.tsx` 覆盖。

**看板没有真实化。** 试着删替身：`List.tsx:524` 在测量卡片时读不到布局缓存（`estimated` of undefined），因为列表虚拟器需要 `Kanban.testSupport` 里的 `mockKanbanLayout` 才有测量数据。把那套布局 mock 搬进计时页测试，只为一棵不计任何断言的子树，是把看板测试的基建复制到另一个文件——而 `Kanban.test.tsx` 已经在真实渲染整页看板。故保留替身，并把理由写进 mock 上方的注释。

这一条与 01 的结论同类：替身是否是"行为替身"还是"环境边界"，要看换成真实现需要什么代价。这里是测量基建，不是行为。
