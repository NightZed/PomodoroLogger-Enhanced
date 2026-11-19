# 诊断：日志、错误上报与崩溃页

> `AGENTS.md` 的「诊断」区域详情。改动 `log.ts`、错误上报、导入日志或崩溃页前先读这里；改完回 `AGENTS.md` 核对硬约束。
>
> 日志文件表、「怎么向用户索要日志」这类面向使用者/支持的内容在 `docs/logging.md`。本文件只写实现约束。

## 唯一写入者

`src/main/log.ts` 是唯一写日志文件的组件。日志在 `<dataDir>/logs`，按 scope 拆分：`app.log`、`active-win.log`、`crash.log`、`data.log`；`migration.log` 由 `migrate.ts` 写一次，也放在同一目录。

诊断信息绝不进 `db/`，也绝不进 asar。

## 级别

级别是 `debug < info < warn < error`（`src/shared/log.ts`）。

- 生产默认 `info`，开发和测试默认 `debug`。
- `--log-level` / `POMODORO_LOG_LEVEL` 能覆盖已存的设置。
- `crash` 和 `data` **完全忽略级别**（见 `LEVEL_EXEMPT_SCOPES`）。

写入是同步的（崩溃报告必须能活过 `app.exit`），并受这些限制：单文件 1 MiB 轮转、相同消息 5 秒窗口、每秒最多 20 行。

每秒 20 行这条限制会直接影响下面的导入日志写法。

## 导入日志

`ImportData` 在每条退出路径上都把结果写进 `data.log`。

- JSON 解析器的报错信息。
- 文件被拒时写校验器最多 500 条发现（`ValidationResult.recordedIssues`），按 8 KiB 以下分块。
- 文件被接受后，`importSummary.ts` 在合并结果上统计：卡片不在任何列表、死 move、悬空会话引用、项目已删除、无项目与自动放回。先写一行 `import issues ...`，然后每类一个分组块（标题 + 4 空格缩进明细，每类上限 500 条，超出写 `N more not shown`）。

**明细按 8 KiB 分块，不要一行一条**：logger 每秒最多 20 行，逐行会被丢弃。

时间字段用 `formatTimestamp`（本地墙钟 + 显式 UTC 偏移）。

**导入不清理任何数据**——无效引用原样入库，清理统一交给「检查并修复数据」。所以日志只描述「导入后它在哪里、怎么处理」，不要写「将被丢弃」。

拒绝路径的对话框只展示前 20 条（`ValidationResult.issues`），并提供一个 **Open Log Folder** 按钮。

导入成功后重载 store（`src/renderer/dataReload.ts`）而不是重启。有需要处理的项时打开 `ImportReportDialog`（只显示数量，按钮可打开日志或直接进入数据检查），没有则只 toast。删除全部数据同样不重启：删库后调用 `reloadDataStore()`；`ClearUserFiles` 仍记录「删除全部」的完成。

## 数据丢失上报

渲染层的「数据丢失」失败（已结束的番茄没能写进库）走 `reportDataFailure` → `IpcEventName.ReportDataFailure`，写进 `data.log`。

行内带 `scope`、聚合次数和 `key=value` 上下文（会话 / 看板 / 卡片 id）。它不展开窗口、不弹 notice——界面没坏，但记录已经丢了，日志是唯一事后可查的痕迹。

主进程的更新器失败由 `AutoUpdater.reportError` 写 `app.log`：打包版没有 console，只靠通知里的相位无法复盘。

## 崩溃页与渲染层错误

渲染层崩溃经 `IpcEventName.ReportError`（`send`）上报，写进 `crash.log`。

React 渲染错误显示在整窗的 `src/renderer/components/ErrorScreen.tsx` 上；**应用不再自己重启**，重启是那个页面上的一个按钮。

`AppErrorBoundary` 必须留在 `app.tsx` 里 `Application` 的**外面**——放在里面的话，它会和它本该替换的那棵树一起卸载。

这个页面自己画拖拽条和窗口按钮，因为无边框窗口没有原生的。

开发期在 DevTools 控制台执行 `__plShowErrorScreen()` 可以直接切到这一页（只改 boundary 的 state，不写 `crash.log`）；未捕获的 `window` 错误则弹下面那种错误卡片。

### 上报入口：指纹去重

`src/renderer/errorReporting.tsx` 是唯一的上报入口，按指纹（`kind|message`）累积：

- 首次立即写一行；
- 此后同一指纹每 60 秒最多再写一行，行内带累计次数 `(x37)`（`RendererErrorPayload.count`）。

一个在指针事件里的重复异常（例如鼠标每移动一次抛一次）因此只留每分钟一行，而不是一行一次。

界面可用的错误（`window 'error'`、`unhandledrejection`、Timer 页内层边界的 `component`）额外弹**一次** `feedback.notice`（`ReportExtra.notify`）：同一指纹每次启动只弹一次、没有遮罩所以点空白关不掉。

### 错误通知卡片

卡片的三个动作（复制 / 反馈 / 打开日志）是 `components/ErrorNoticeActions.tsx` 里的图标按钮，文案同时放在 tooltip 和 `aria-label` 里，和 `ErrorScreen` 用同一组 `crash.*` key。

antd 把通知放在 z-index 2050、tooltip 放在 1070，所以这几个 tooltip 必须用 `styles.root.zIndex` 抬到卡片之上，否则会被卡片盖住。

「反馈」先复制再 `openExternal`：先开浏览器会让窗口失焦，剪贴板写入随后可能被拒绝，issue 就缺了日志信息。

整窗的渲染错误已经换成 `ErrorScreen`，不再弹提示。`FeedbackContextBridge` 尚未挂载时（启动早期）视为未提示，下一次仍会弹。

### Timer 的内层边界

番茄钟页的内层边界就长在 `Timer` 自己身上（`getDerivedStateFromError` + `hasError` + `renderFallback`），**不要**改成包住 `<Timer />` 的包装组件：

`Timer.componentWillUnmount` 会 `monitor.discard()`，卸载实例等于丢掉正在跑的番茄和它的截图。

只有渲染阶段抛出的后代错误会进 fallback；`Timer.render()` 自身抛出的错误仍走整窗错误页。

### 开发期的两个遮罩

开发版的运行时错误有两个遮罩：`ReactRefreshWebpackPlugin` 的和 webpack-dev-server 自带的（`client.overlay` 默认开启，深色面板）。

后者已在 `webpack.renderer.dev.config.js` 里关掉，否则关掉第一个之后会露出第二个，看着像同一个错误报了两次。

## 主进程故障

主进程故障由 `src/main/crashHandlers.ts`（`uncaughtException` / `unhandledRejection`）和 `init.ts` 里的 `installWindowDiagnostics()`（`did-fail-load`、`preload-error`、`unresponsive`、`render-process-gone`、`child-process-gone`）记录。
