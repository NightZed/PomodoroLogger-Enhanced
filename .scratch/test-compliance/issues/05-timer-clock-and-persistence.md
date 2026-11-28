# 05: Timer 计时与落库去替身

**What to build:** 计时推进、暂停继续、到期结束与今日会话加载都跑真实实现：用例通过会话夹具与倍速函数驱动时间，看到的是真实的到期与落库结果；托盘图标的断言看主进程实际收到的 payload，而不是制图函数的调用次数。

**Blocked by:** 04

**Status:** resolved

- [x] 计时引擎与会话管理不再被替身替换，用例里不再有持有替身实例的数组
- [x] 时间推进靠已过期的会话夹具与倍速函数完成，不新增 sleep，也不依赖开发环境的加速
- [x] 托盘断言看主进程收到的图片 payload（IPC 是边界）；制图函数因缺少 2d 上下文仍需替换，只作为环境边界保留，其调用次数不作为断言对象
- [x] 会话结束时落库的那一行可被断言，自动衔接仍先经确认再启动下一场
- [x] `pnpm test src/renderer/components/Timer` 全绿，57 条用例不减

## Outcome

`jest.mock('../../monitor')`、`jest.mock('../../monitor/sessionManager')`、`jest.mock('./iconMaker')` 与 `mockMonitorInstances` 数组一并删除。

**计时引擎**：真实 `Monitor` 采样 `window.api.activeWin`（IPC 桩返回一个固定的编辑器窗口）。`onStart` 之后推进 1000ms，`UsageRecorder` 就有了一条真实的应用记录，然后 `onFocusingSessionDone` 把它快照成 `stagedSession`。两处「往替身里塞 `sessionData`」因此消失。`Monitor.start` 的断言改成 `api.activeWin` 被采样——那是真实实现会碰的第一个边界。

**今日会话**：`getTodaySessions` 走 `dbs.sessionDB` 与 `test/dbBridge` 的内存库。夹具用 `insertSession()` 写真实行，`startTime` 必须落在假时钟当天——原先的 `startTime: 1, 2` 在真实查询里属于 1970 年，查不到。

失败注入改为让 `window.api.dbRequest` 对下一次 `sessionDB.find` 拒绝。「同一天不重查」这条不能靠行数判断（真实库会返回同样的行），所以断言桥上的 `find` 次数没有增加——「没有发起查询」是唯一可观察的差别。

**托盘**：jsdom 既没有 2d 上下文也不加载图片。测试补齐这两处环境缺口（`getContext` / `toDataURL` / `img.src` 的 load 事件），让 `iconMaker` 真实执行；`toDataURL` 把绘制命令编码成 src，于是断言读的是 `window.api.setTrayImage` 收到的 payload：`text:09`（倒计时）、`image`（空闲应用图标）、`🍇`（休息结束的确认盘）。制图函数不再被 mock，也不再数调用次数。

**落库**：Timer 断言的是真实采样生成的记录进入 `timerFinished`（`_id` 由 recorder 生成、`apps.editor` 来自观察到的窗口、`spentTimeInHour` 是标称时长），这是页面 dispatch 出去的行为。写进 SQLite 的那一行由 `Timer/action.test.tsx` 的 `On timerFinished` 覆盖：它跑真实事务并查回记录。两层合起来才是「会话结束时落库的那一行可被断言」，把真实 store 塞进这 57 条用例会让每个断言都依赖整棵 reducer。

`Progress`、`Board`、流程图与词云、`Hotkeys`、`feedback` 的替身保留在票 03、04 的判断里（ESM / 布局虚拟器 / canvas / 纯展示层）。
