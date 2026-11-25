# 会话：活动追踪、统计与提示音

> `AGENTS.md` 的「活动追踪 / 统计 / 提示音」区域详情。改动计时、会话落库、时长聚合或提示音前先读这里；改完回 `AGENTS.md` 核对硬约束。

## 会话生命周期

`src/renderer/monitor` 采集活动窗口（`src/main/activeWin.ts` 包装 `get-windows`，懒加载并记录到 `logs/active-win.log`），按应用/按标题把时间聚合成 `PomodoroRecord`，可选截图。

番茄结束时由主进程 `recordFinishedSession`（`src/main/db/finishedSession.ts`）在一条事务里写入会话行、看板汇总与卡片归属，失败整笔回滚、不挂卡，渲染层用 `applyFinishedSession` 替换事务返回的行。

## 采样时钟

`UsageRecorder` 的采样差分用单调时钟（`performance.now()`），`record.startTime` 仍用墙钟（它决定会话归到哪一天）。

单次采样间隔被 `MAX_TICK_MS`（30 s）截断，负差值按 0 处理。所以改系统时钟不会给某个应用凭空加减时间，休眠唤醒也不会把整段挂起记给前台应用。

## 今日列表的缓存

「今日」按 `startTime` 归属，区间是 [今天 0 点, 明天 0 点)，边界只有一处定义：`src/renderer/monitor/day.ts` 的 `todayStart()` / `tomorrowStart()`。**查询必须带两端**——只有下界时，时钟被拨到未来期间写入的会话（`startTime` 在明天之后）会一直算进今天，重启也不会消失；`History` 的日视图本来就是两端过滤。Timer 页用 `todayStart()` 判断缓存是否过期，两处各写一遍会让查询和失效判断落到不同的日子。

Timer 页的 `pomodorosToday` 是缓存：挂载与数据重载（导入 / 全删，见 `sessionReloadToken`）时查库，之后每确认一个番茄直接 `concat`，不再查询。它不会因为跨天自己失效，所以 `onStart` 先比较 `todayStart()` 与上次成功加载的日期，不同才重新查询。所以 0 点后到第一次开始会话之间，页面、圆点、模式行计数和结束遮罩显示的都还是前一天的数据。

## 时长归一化

会话确认时 `normalizeAppHours`（`src/shared/normalizeAppHours.ts`）把 `apps` 和 `stayTimeInSecond` 按最终 `spentTimeInHour`（含延长）等比缩放。

**`Σapps === spentTimeInHour` 是一条不变量**，不要退回「应用记墙钟、总时长写名义值」：那样每结束一个番茄都会让 History 的树图比总时长徽章多 0.5–1 s，一万个番茄就是一小时以上。

效率打分在 `src/shared/efficiency/efficiency.ts`；历史聚合在 `src/utils/aggPomodoro.ts` 和 `src/shared/dataMerger`。

## 存量数据的应用时长校准

`src/main/db/sessionHours.ts`：

- 扫描用 `json_each` 在 SQLite 里求每条会话的 `apps` 合计，主线程只拿到 `{_id, startTime, spentTimeInHour, appHours}` 四个标量（用 `findFieldsSync` 读 `apps` 会把全库的标题明细都解析一遍）。
- 扫描和写回都按批分页，每批之间 `await` 一次让出事件循环：所有 SQLite 调用都是同步的，整表一次扫完会把 Electron 主进程占满，窗口在扫描期间停止重绘——表现就是「点一下先卡住、转圈等活儿干完了才出现」。批量大小见 `SCAN_BATCH` / `WRITE_BATCH`（3.2k 条会话的实测依据）。
- 修复时主进程重新扫描，**不接受渲染层传来的 id 列表**——那边拿到的只是快照。
- 三组默认策略：`over`（应用多于总时长）默认勾选，`under`（少于）默认不勾（可能是手工补录），`missing`（没有应用明细）只展示不可修。
- 写回只改 `apps` / `stay_time_in_second` / `doc` 三列，所以会话总时长、日历和项目统计不受影响。每批一个事务，中途失败只留下还没处理的会话，重跑即可（归一化是幂等的）。

## 卡片归属：一番茄一卡

结束遮罩（`SessionEndingMask`）在 `focusedList` 只有一张卡时自动选它，多张时让用户选一张或选「不挂卡」，然后 `Timer.onSessionConfirmed` 把单个 `cardId` 交给 `timerFinished` → `recordFinishedSession`，只有那张卡的 `actual` 增加。

遮罩用 portal 挂到 `Application` 的 `SESSION_MASK_LAYER_ID` 层，不随当前页面隐藏：它必须盖住整个窗口，而页面 pane 在非激活时是 `display: none`。因此「会话结束回到番茄钟页」只是偏好（`returnToTimerOnSessionEnd`，默认开），不再是为了让遮罩可见——那次强制切页会打断正在编辑的看板/卡片和进行中的拖拽。

全窗口浮层的顺序集中在 `src/renderer/components/layers.ts`（`LAYER`，带顺序断言 `layers.test.ts`）：新增一层先在那里定位，不要在组件里就地写数字。

**遮罩里的下拉菜单必须挂到遮罩自己身上。** 遮罩在 `LAYER.sessionMask`（1100），而 antd 默认把 Select 菜单放进共享 popup 层（`LAYER.popup`，1050）；遮罩搬到应用级层后两者同处 `Content` 的堆叠上下文，菜单会画在遮罩下面。遮罩里的两个 Select（项目、卡片）都把 `getPopupContainer` 指回遮罩，菜单因此落在遮罩自己的层里，随遮罩一起显示、一起隐藏，不需要再抬高任何共享层级。

**不要退回「挂到 `focusedList` 的每一张卡」**：那会让卡片时长按列表卡片数放大，而 `dataMerger` 的 `setBoardInfo` 按卡片重算看板时长，导出再导入后 `spentHours` 会变成实际的 N 倍。

事后改归属（改项目 / 挂卡 / 删除）统一走主进程的 `applySessionEdits` 单事务：

- 卡片按 `board.lists → list.cards` 反查归属；
- 跨看板挂卡整批拒绝；
- 换卡先解绑再挂一次；
- 改项目同时把看板 `spentHours` / `relatedSessions` 转到新板。

它的返回值必须 `dispatch(applySessionEditsResult)` 写回 store——只写库不更新 `kanban.cards` / `kanban.boards`，界面要等重启才看到新的卡片归属。

## 提示音与桌面通知

会话自然结束时（`Timer.onDone`，`shouldRemind` 为真）响两次提示音——立即一次、60 秒后再一次——并按 `desktopNotification` 决定是否发系统通知；手动点 Finish 结束的会话两者都不做。

三种会话各有音源（`workSoundPath` / `shortBreakSoundPath` / `longBreakSoundPath`）和独立开关（`*SoundEnabled`）；路径为 `undefined` = 内置 `src/res/ding.mp3`。「恢复」只清空路径，不删用户的文件。

**长休判定**与 `getDuration` / `startTimer` 一致：休息结束且 `iBreak % 4 === 0`。

**音源和音量必须在 `remindUserTimeout` 被调用的那一刻快照**，60 秒后的回调里 `isFocusing` / `iBreak` 已经指向下一场会话。

### 文件如何播放

自定义文件不拷贝，只存绝对路径，经 `sound://local?path=...` 播放：`init.ts` 用 `protocol.handle` + `net.fetch(pathToFileURL(...))`（privileges 带 `stream`，媒体栈需要 Range 请求）。

**CSP 的 `media-src` 必须含 `sound:`**，少写这一项文件会被静默拦掉。

加载失败（文件被删、Chromium 不支持该格式）回退内置铃声并 toast 一次。`src/renderer/sound.ts` 是拼 URL 和播放的唯一入口，设置页的「测试」也走它。

音量用 `PreviewSlider`（松手提交）：Timer 页映射整个 store，拖动时每帧写 store 会让进度环和番茄墙整页重渲染。详见 `settings.md`。

## 打开文件对话框

所有「打开文件」对话框都走 `src/main/fileDialog.ts` 的 `showOpenFileDialog(options, kind)`。

每种用途（`sound` / `wallpaper` / `import`）记住自己的目录，作为下次的 `defaultPath`。三个目录存在 settings 文档的 `fileDialogDirs` 里（不是 `Setting`，渲染层不读）；取消不覆盖，目录不存在时退回系统默认。

**不要合并成一份记忆**：音频、图片和备份通常不在同一个文件夹，共享会让第二个对话框落到上一个用途的目录。

新增选择文件的功能不要直接调 `dialog.showOpenDialog`（导出用的 `showSaveDialog` 仍直接调用，它自己给 `defaultPath` 传文件名）。

## CPU 密集任务

`src/main/worker/fork.ts` 懒加载 fork `worker.js` 做 History 聚合（为词云分词每一个窗口标题）。

- 空闲 60 秒后关掉子进程。
- 窗口**关闭到托盘**时由 `init.ts` 的 `applyTrayState` 调 `releaseWorkerNow` 立即释放（有请求在途就等它落地）。普通最小化不触发——那和正常窗口行为一致，子进程仍走 60 秒空闲退出。
- `releaseWorkerNow` 只有那一个调用点；页面卸载和子进程释放必须共用同一个托盘判据，不要再各自挂窗口事件。详见 `window-modes.md`。
- worker 出故障时 `src/main/db/ipc.ts` 回退到进程内聚合。

渲染层剩下的那个 web worker（`src/renderer/workers`）是分词器；`DBWorker` 只是 IPC 代理上的一层薄封装。

## 开发期时间缩放

`src/config.ts` 在非生产环境按 `DEBUG_TIME_SCALE`（120）压缩计时器：写入走 `scaleMs`，读取再展开回名义值，统计数据保持名义值。

**任何新的计时/会话代码都必须经过这些工具函数**，否则开发时钟、进度环和历史总计会互相矛盾。
