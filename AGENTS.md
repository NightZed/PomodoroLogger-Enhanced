# AGENTS.md

写给在本仓库工作的 AI 编码助手。
本文件是唯一事实来源：`CODEBUDDY.md` 里只有 `@AGENTS.md`，所以改这个文件，不要改那个。

## 项目

Electron 桌面应用（番茄钟 + 看板 + 桌面活动追踪 + 统计）。
渲染层是 React 19 + Redux；主进程独占 SQLite（`better-sqlite3`）。
需要 Node.js 24+ 和 pnpm 11（版本钉在 `packageManager` 里）。

## Shell

本地命令一律在 **PowerShell 7（`pwsh`）** 里跑——构建、测试、打包、进程检查都一样。
从 bash/CI 拷来的片段必须翻译：

- 环境变量写成 `$env:NAME = '...'`，不是 `NAME=x cmd` 前缀。
- `$PWD` 在双引号内会展开（`"$PWD/.local/prod-run"`）；路径里用正斜杠没问题。
- 如果执行策略拦住 `pnpm.ps1`，就调用 `pnpm.cmd`。

进程/内存检查放这里而不是 bash：`ps -W` 不报告内存和 CPU，`tasklist` 的输出又依赖控制台代码页。

```powershell
# 会话/进程树，按本检出目录过滤，避免误伤其他 Electron 应用
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match [regex]::Escape('PomodoroLogger-Enhanced') } |
  Select-Object ProcessId, ParentProcessId, Name

Get-Process -Name electron |
  Select-Object Id, @{n='WS_MB';e={[math]::Round($_.WorkingSet64/1MB,1)}},
                   @{n='Private_MB';e={[math]::Round($_.PrivateMemorySize64/1MB,1)}}

taskkill /PID <pid> /T /F      # Electron 子进程不会随父进程一起退出
Get-NetTCPConnection -LocalPort 2003 -State Listen | Select-Object OwningProcess
```

## 常用命令

```powershell
pnpm                                # 安装；postinstall 重建原生模块（electron-builder install-app-deps）
pnpm build                          # tsc --noEmit + 两个 webpack bundle
pnpm typecheck                      # 只跑 tsc --noEmit -p tsconfig.json
pnpm lint                           # eslint src/**/*.{ts,tsx} test/**/*.{ts,js}
pnpm test                           # jest --forceExit
pnpm test src/renderer/components/Timer/Timer.test.tsx   # 单个文件
pnpm test -t "some test name"       # 按名字跑单个测试
pnpm test:watch
pnpm test:coverage
```

团队工作流：`/init` 仍会写 `CODEBUDDY.md`；跑完之后把内容挪进本文件，并恢复 `@AGENTS.md` 存根。

开发（两个终端——`pnpm start` **不会**自己拉起 Electron）：

```powershell
pnpm start        # webpack 主进程（watch）+ 渲染层 dev server，端口 :2003
npx electron .    # 第二个终端；首次运行会下载 Electron
```

生产构建 / 打包：

```powershell
# 构建并运行生产 bundle。release 构建每个 Electron profile 会拿单实例锁，
# 所以不给独立 profile 的话，只要安装版开着，这次运行会立刻退出
# （src/main/init.ts）。
# 只有 Electron 的 profile 换了位置：SQLite 数据库仍在
# %APPDATA%\PomodoroLogger 下（src/main/config.ts），也就是说这次运行
# 读写的是和安装版同一份数据。下面那行 $env: 同时改掉数据目录
# （它在本 shell 会话剩余时间里一直生效）。
pnpm start:prod -- --user-data-dir="$PWD/.local/prod-run"

$env:APPDATA = "$PWD/.local/prod-appdata"
pnpm start:prod -- --user-data-dir="$PWD/.local/prod-run"

pnpm run pack     # electron-builder --dir（单跑 pnpm pack 只会打一个 npm tarball）
pnpm run dist-win # 或 dist-mac / dist-linux / dist-all（每个都是独立脚本）
```

CI（`.github/workflows/test.yml`）在每次 push/PR 上跑 `pnpm lint`、`pnpm typecheck` 和 `pnpm test --ci`；`build.yml` 分平台用 `pnpm exec electron-builder` 打包（老的 `action-electron-builder` 已移除，因为它把 yarn 写死了）。
发版通过 `Build/release` workflow → semantic-release 手工触发；永远不要手动改 `package.json` 版本号或打 tag。

### 包管理器

pnpm 11，版本钉在 `packageManager`。
`pnpm-workspace.yaml` 是安装行为的唯一位置：`nodeLinker: hoisted`（electron-builder 需要扁平的 `node_modules`）、`overrides`（取代 yarn 的 `resolutions`）、`allowBuilds`。
pnpm 11 的 `strictDepBuilds` 默认为 `true`，所以一个带未审核安装脚本的依赖会让整个安装以非零码失败——要显式列成 `true` 或 `false`，不要指望只给个警告。
`electron` 44 和 `better-sqlite3` 13 不带安装脚本：前者在第一次 `electron .` 时下载二进制，后者加载自带的 `prebuilds/`。
`get-windows` 10 是唯一带真实 `install` 脚本的原生模块（`node-pre-gyp install --fallback-to-build`）：`@electron/rebuild` 在 `pnpm install` 期间用 `binding.gyp` 编译它的 napi addon，所以这一步需要 node-gyp 加一个 Python（CI runner 自带），并且 `get-windows` 必须留在 `allowBuilds` 里。
打包后的应用加载预构建的 `lib/binding/napi-9-<platform>-<arch>/*.node`（node-pre-gyp 的 `module_path`）；`build/` 被排除在 `build.files` 之外。

`pnpm pack` 是内置命令，**不会**执行 `scripts.pack`；要用 `pnpm run pack`。
store 位于仓库之外（全局配置，本机在 `E:\pnpm-store`），并且必须和检出目录在同一个盘，否则 pnpm 会静默地复制而不是硬链接。

## 构建工具链约束

- Babel 8（`babel-loader`）负责 webpack 和 Jest 里的全部转译。
  这里**没有** `ts-loader` / `ts-jest`：`typescript` 被别名到 `@typescript/typescript6`，因为 typescript-eslint 需要 TS 6 的 JS 编译器 API，而 `@typescript/native` 只提供类型检查用的 `tsc`。
  加一个依赖 TS 编译器 API 的 loader 会直接搞坏构建。
- 产物：`dist/main.js`（入口 `src/main/main.ts`）、`dist/preload.js`、`dist/worker.js`（子进程 worker）、`dist/app.js` + `dist/index.html`（渲染层）。
  只有 `.tsx` 会拿到 React 转换，所以 `.ts` 里的泛型箭头函数不会产生歧义——`preset-react` 要一直限定在 `.tsx`。
- 原生/纯 ESM 模块（`better-sqlite3`、`get-windows`、`electron-updater`）在主进程构建里是 webpack `externals`，在 Jest 里通过 `jest.config.js` 的 `moduleNameMapper` / `transformIgnorePatterns` 打桩。

## 架构

### 进程与安全模型

- `src/main/main.ts` 同步读取硬件加速设置（在 `app.ready` 之前），然后动态 import `src/main/init.ts`，由它创建无边框/透明 `BrowserWindow`（`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`）、托盘、关闭到托盘行为、窗口模式处理和自动更新。
- 渲染层只能通过 `src/main/preload.ts` 触达主进程，它暴露一个很窄的 `window.api`（`ExposedAPI`，定义在 `src/main/ipc/type.ts`）。
  每个通道名、payload 结构和发送方都在主进程侧校验（`src/main/ipc/ipc.ts` 的 `handleCommand` + `src/main/ipc/validate.ts`）。
  新增能力时，类型联合、preload 方法和主进程 handler 要一起改。
- 应用内所有提示都走 feedback 层（`src/renderer/components/feedback`）：`feedback.toast` / `notice` / `confirm` / `alert`。
  直接 import antd 的 `message` / `notification` 会被 `no-restricted-imports` 拦下。
  内容型对话框必须用 `AppModal`（`src/renderer/components/AppModal.tsx`），它套了统一的「立即弹出」动效；直接 import antd 的 `Modal` 同样被拦。
  一个对话框在同一个 commit 里关闭、另一个打开时（例如「检查并修复数据」跳转到「校准应用时长」），必须给关闭的那个传 `instant`：
  antd 每个 Modal 自带一层 `rgba(0,0,0,0.45)` 的 mask，两层重叠一帧会把画面压到约 0.70 再回弹，看起来就是闪一下。
  `instant` 用空 `transitionName` 让 rc-motion 跳过状态机、同帧卸载 mask；普通关闭仍要走那 1ms 淡出，否则面板会在 `display: none` 之前露一帧。
  同理，任何先 loading 再出内容的对话框都要给两态同一个固定高度，否则打开后会被内容撑大。
  antd 的点击波纹在 `Application` 里被全局关掉，因为软件渲染（默认）会把那个 2 秒动画变成整窗 60fps 重绘。

### 数据层（单写入者）

- 主进程独占唯一的 SQLite 连接（`src/main/db/index.ts`、`connection.ts`、`schema.ts`、`repository.ts`）。
  repository 沿用旧的 NeDB API（`find`/`findOne`/`insert`/`update`/`remove`/`count`），这样 action 代码不用重写。
- 只读扫描不要用 `findSync`：它会把每行的 `doc` 列整段 `JSON.parse`，而 sessions 的 `doc` 含每个应用/标题的明细。只要 id 时用 `idsSync()`，只要部分字段时用 `findFieldsSync(query, fields)`——两者都只 `SELECT` 需要的列，不碰 `doc`。
  2 万条会话上全量读一次约 1 秒，主进程单线程被占满，窗口会停止重绘（表现是点击按钮后先卡住、转圈和弹窗一起迟到）。
- 渲染层从不直接碰 SQLite。
  `src/renderer/dbs.ts` 构造名为 `sessionDB`、`settingDB`、`kanbanDB`、`cardsDB`、`listsDB`、`moveDB` 的 IPC 代理；`src/main/db/ipc.ts` 白名单化数据库名和七个允许的操作。
  测试则通过 `test/dbBridge.ts` 安装一个真实的内存桥接。
- 旧 NeDB → SQLite 迁移在 `initializeDatabaseFile()`（`migrate.ts`）里跑，旧的 `.nedb` 文件保持不动，并备份到 `db-bk/pre-sqlite-<ts>`。
- `NODE_ENV=test` 把数据库切到 `:memory:`，数据目录钉在 `.local/test`（`src/main/config.ts`）；开发运行用 `.local/dev`；生产用 `%APPDATA%\PomodoroLogger`。

### 诊断（日志与崩溃页）

- `src/main/log.ts` 是唯一写日志文件的组件。
  日志在 `<dataDir>/logs`（生产是 `%APPDATA%\PomodoroLogger\logs`），按 scope 拆分：`app.log`、`active-win.log`、`crash.log`、`data.log`；`migration.log` 由 `migrate.ts` 写一次，也放在同一目录。
  诊断信息绝不进 `db/`，也绝不进 asar。
- 级别是 `debug < info < warn < error`（`src/shared/log.ts`）；生产默认 `info`，开发和测试默认 `debug`，`--log-level` / `POMODORO_LOG_LEVEL` 能覆盖已存的设置。
  `crash` 和 `data` 完全忽略级别（见 `LEVEL_EXEMPT_SCOPES`）。
  写入是同步的（崩溃报告必须能活过 `app.exit`），并受这些限制：单文件 1 MiB 轮转、相同消息 5 秒窗口、每秒最多 20 行。
- `ImportData` 在每条退出路径上都把结果写进 `data.log`：JSON 解析器的报错信息；文件被拒时写校验器最多 500 条发现（`ValidationResult.recordedIssues`，按 8 KiB 以下分块）。
  文件被接受后，`importSummary.ts` 在合并结果上统计卡片不在任何列表、死 move、悬空会话引用、项目已删除、无项目与自动放回，写一行 `import issues ...`，然后每类一个分组块（标题 + 4 空格缩进明细，每类上限 500 条，超出写 `N more not shown`）。
  时间字段用 `formatTimestamp`（本地墙钟 + 显式 UTC 偏移）。明细按 8 KiB 分块，**不要一行一条**：logger 每秒最多 20 行，逐行会被丢弃。
  导入不清理任何数据——无效引用原样入库，清理统一交给「检查并修复数据」，所以日志只描述「导入后它在哪里、怎么处理」，不再说「将被丢弃」。
  拒绝路径的对话框只展示前 20 条（`ValidationResult.issues`），并提供一个 **Open Log Folder** 按钮。
  导入成功后重载 store（`src/renderer/dataReload.ts`）而不是重启；有需要处理的项时打开 `ImportReportDialog`（只显示数量，按钮可打开日志或直接进入数据检查），没有则只 toast。
  删除全部数据同样不再重启：删库后调用 `reloadDataStore()`；`ClearUserFiles` 仍记录「删除全部」的完成。
- 渲染层崩溃经 `IpcEventName.ReportError`（`send`）上报，写进 `crash.log`。
  React 渲染错误显示在整窗的 `src/renderer/components/ErrorScreen.tsx` 上；**应用不再自己重启**，重启是那个页面上的一个按钮。
  `AppErrorBoundary` 必须留在 `app.tsx` 里 `Application` 的*外面*——放在里面的话，它会和它本该替换的那棵树一起卸载。
  这个页面自己画拖拽条和窗口按钮，因为无边框窗口没有原生的。
- `src/renderer/errorReporting.tsx` 是唯一的上报入口，按指纹（`kind|message`）累积：
  首次立即写一行，此后同一指纹每 60 秒最多再写一行，行内带累计次数 `(x37)`（`RendererErrorPayload.count`）。
  一个在指针事件里的重复异常（例如鼠标每移动一次抛一次）因此只留每分钟一行，而不是一行一次。
  界面可用的错误（`window 'error'`、`unhandledrejection`、Timer 页内层边界的 `component`）额外弹**一次** `feedback.notice`
  （`ReportExtra.notify`）：同一指纹每次启动只弹一次、带「打开日志文件夹」、没有遮罩所以点空白关不掉。
  整窗的渲染错误已经换成 `ErrorScreen`，不再弹提示。`FeedbackContextBridge` 尚未挂载时（启动早期）视为未提示，下一次仍会弹。
- 番茄钟页的内层边界就长在 `Timer` 自己身上（`getDerivedStateFromError` + `hasError` + `renderFallback`），**不要**改成包住 `<Timer />` 的包装组件：
  `Timer.componentWillUnmount` 会 `monitor.discard()`，卸载实例等于丢掉正在跑的番茄和它的截图。
  只有渲染阶段抛出的后代错误会进 fallback；`Timer.render()` 自身抛出的错误仍走整窗错误页。
- 开发版的运行时错误有两个遮罩：`ReactRefreshWebpackPlugin` 的和 webpack-dev-server 自带的（`client.overlay` 默认开启，深色面板）。
  后者已在 `webpack.renderer.dev.config.js` 里关掉，否则关掉第一个之后会露出第二个，看着像同一个错误报了两次。
- 主进程故障由 `src/main/crashHandlers.ts`（`uncaughtException` / `unhandledRejection`）和 `init.ts` 里的 `installWindowDiagnostics()`（`did-fail-load`、`preload-error`、`unresponsive`、`render-process-gone`、`child-process-gone`）记录。

### CPU 密集任务

- `src/main/worker/fork.ts` 懒加载 fork `worker.js` 做 History 聚合（为词云分词每一个窗口标题）。
  空闲 60 秒后关掉子进程；worker 出故障时 `src/main/db/ipc.ts` 回退到进程内聚合。
- 渲染层剩下的那个 web worker（`src/renderer/workers`）是分词器；`DBWorker` 只是 IPC 代理上的一层薄封装。

### 渲染层状态与 UI

- `src/renderer/store/index.ts` 是朴素 Redux + thunk；`src/renderer/reducers/index.ts` 合并 `timer`、`history`、`kanban`、`story`。
  每个功能目录（`components/Timer`、`History`、`Kanban`、`UserGuide`）自己持有 `action.ts` + reducer + 测试——按这个模式来，不要加横切的 slice。
- `kanban.boards` / `lists` / `cards` 互相用 id 引用，所以整棵树重读时必须一次替换。
  `applyKanbanSnapshot`（`components/Kanban/snapshot.ts`）让三个 reducer 响应同一个 action，`readKanbanSnapshot` 负责读库；导入、「删除所有数据」和看板首次加载都走它。
  分成三次 dispatch 会留下「新 lists + 旧 boards」（删库时 lists 先空、boards 后空）这类中间态，任何沿 `board.lists → lists[id].cards` 走的组件都会在那一帧读到 `undefined`。
- `src/renderer/components/appTabs.ts` 是页面的唯一事实来源；标签栏、Ctrl+Tab 处理和紧凑模式切换全部从 `APP_TABS` / `planTabChange` 推导。
  不要加一份并行的标签列表。
- 非活动页面不会永远保留：`DestroyOnTimeoutWrapper` 在每页各自的宽限期后丢弃该页子树（`Application.tsx` 里的 `TAB_UNLOAD_DELAY`）。
  这些延迟不同是有意的——history 每次 mount 都会重跑整个 `aggHistory` 聚合，kanban 只重读看板行，setting 可能还有导入/导出在飞——所以新页面需要显式加一条，缩短延迟是行为变更，不是白捡的好处。
  `timer` 永久挂载，因为它持有正在运行的会话。
  开了 `unloadOnCloseToTray` 时，隐藏窗口会把宽限期压缩到 `HIDDEN_TAB_UNLOAD_DELAY`（30 秒），所以新页面在这两处都要接上。
- 标题栏保留 `-webkit-app-region: drag`，这样普通窗口能拿到原生移动和 Aero Snap，但 Chromium 在滚动容器滚动后会把那块区域裁掉（被裁掉的条带跟着滚动容器的宽度走）。
  因此任何仍能到达渲染层的标题栏按下事件都必须同时启动 `windowDrag`，否则滚动之后窗口就拖不动了——见 `src/renderer/components/AppTitleBar/dragRegion.ts` 和 `src/main/ipc/windowDrag.ts`。
- `src/components/**` 是共享的可视化/小部件库（`Visualization/*`、`common/*`），渲染层用相对路径引用它——它不是渲染层自己的组件树。
- 拖动驱动的设置走两条路之一，新滑块必须明确选边。
  四个时长用 `Setting/PreviewSlider.tsx`：整个拖动过程中值留在本地 state，只在松手时提交一次。
  它们必须这样，因为 `Timer/index.tsx` 映射了整个 store，其 `shouldComponentUpdate` 会对四个时长中的任何一个重渲染，所以每事件写一次 store 会让整个番茄钟页面（进度环、`PomodoroNumView` 的 SVG 墙）在一次拖动里重渲染约 100 次。
  三个不透明度不能这么做——它们的值*就是*窗口显示的内容——所以它们走 `Setting/useSliderChange.ts`（折到每帧一次变更），再按 key 做 300 ms 防抖写入（`Timer/action.ts` 的 `persistSettingWithDebounce`）；每次设置写入都会在自己的 WAL 提交里重写整张 `settings` 表，所以每事件持久化就是每个指针事件一次 fsync。
- 主题：`src/renderer/theme`（tokens + `applyTheme`，CSS 自定义属性 `--pl-*`）通过 `ThemeController` 应用。
  首次绘制的主题经 `additionalArguments` → `window.api.initialTheme` 跨进程边界传递，这样渲染层不会闪一下错误的主题；动启动主题时两侧都要同步改。
- 样式用 styled-components（外加少量 `.scss` 全局文件）；不要为组件添加独立 CSS 文件。
- 占满窗口的平面必须保持纯 `background-color`。
  实时 resize 每帧都会重绘整个窗口，在那里用 `color-mix()`（把 `themeBackgroundOpacity` 折进颜色最直觉的写法）每次重绘要吃掉四个核里约 10 个点；纯色填充 + 元素自身的 `opacity` 是同样的算术。
  在 1440x960 窗口上实测 45% → 33%，开不开硬件加速都一样。
  见 `Application.tsx` 里的图层表。
- 窗口裁剪容器（`Main`）上的圆角 1px 边框会让每帧多一次全窗口合成 pass，所以渲染层在窗口 resize 期间把两者都去掉（`WindowEventName.ResizingChanged`，由 `init.ts` 在 120 ms 空闲计时后发出）：软件渲染下，每个呈现帧 8.8 ms → 6.5 ms，3.33 Mpx 下 55 → 37 个 quad。
  没有这个处理，大窗口做不到每个鼠标事件呈现一帧，会明显跟不上光标，也就是关掉硬件加速时那个「拉大卡顿」的报告。
  因此拖动期间圆角是方的；没在 trace 里量过 `Display::DrawAndSwap` 之前，不要给那个元素加回圆角或边框。

### 国际化

界面提供英文和简体中文，用的是一个小自研 `t()` 而不是 i18n 库——渲染层没有 Provider，所以裸写的 `render(<Component />)` 测试能继续工作，语言切换也能让被 `React.memo` / `shouldComponentUpdate` 保护的组件重渲染。
`src/shared/i18n/en.ts` 是 key 树和插值签名的唯一事实来源；`zh.ts` 的类型是 `CatalogShape<typeof en>`，所以缺 key 或参数表不对都会让 `pnpm typecheck` 失败。
渲染层通过 `useI18n()`（函数组件）或模块级 `t()`（类组件、工具函数、常量表）取文案；主进程有自己的 `m()`，在 `src/main/i18n.ts`。
`Setting.language`（`'system' | 'en' | 'zh'`）放在 `timer` slice 里，和主题一样经 `additionalArguments` 到达首次绘制。
要把 `language` 留在 `settingUiStates` / `uiStateNames` / `trayStateKeys` 白名单里。
见 `docs/i18n.md`。

### 活动追踪与统计

`src/renderer/monitor` 采集活动窗口（`src/main/activeWin.ts` 包装 `get-windows`，懒加载并记录到 `logs/active-win.log`），按应用/按标题把时间聚合成 `PomodoroRecord`，可选截图；番茄结束时由主进程 `recordFinishedSession`（`src/main/db/finishedSession.ts`）在一条事务里写入会话行、看板汇总与卡片归属，失败整笔回滚、不挂卡，渲染层用 `applyFinishedSession` 替换事务返回的行。
`UsageRecorder` 的采样差分用单调时钟（`performance.now()`），`record.startTime` 仍用墙钟（它决定会话归到哪一天）；单次采样间隔被 `MAX_TICK_MS`（30 s）截断，负差值按 0 处理，所以改系统时钟不会给某个应用凭空加减时间，休眠唤醒也不会把整段挂起记给前台应用。
会话确认时 `normalizeAppHours`（`src/shared/normalizeAppHours.ts`）把 `apps` 和 `stayTimeInSecond` 按最终 `spentTimeInHour`（含延长）等比缩放，`Σapps === spentTimeInHour` 是一条不变量——不要退回「应用记墙钟、总时长写名义值」，那样每结束一个番茄都会让 History 的树图比总时长徽章多 0.5–1 s，一万个番茄就是一小时以上。
效率打分在 `src/shared/efficiency/efficiency.ts`；历史聚合在 `src/utils/aggPomodoro.ts` 和 `src/shared/dataMerger`。

存量数据的应用时长校准在 `src/main/db/sessionHours.ts`：扫描用 `json_each` 在 SQLite 里求每条会话的 `apps` 合计，主线程只拿到 `{_id, startTime, spentTimeInHour, appHours}` 四个标量（用 `findFieldsSync` 读 `apps` 会把全库的标题明细都解析一遍）。修复时主进程重新扫描并单事务写回，不接受渲染层传来的 id 列表——那边拿到的只是快照。三组默认策略：`over`（应用多于总时长）默认勾选，`under`（少于）默认不勾（可能是手工补录），`missing`（没有应用明细）只展示不可修。写回只改 `apps` / `stay_time_in_second` / `doc` 三列，所以会话总时长、日历和项目统计不受影响。

番茄的卡片归属是**一番茄一卡**：结束遮罩（`SessionEndingMask`）在 `focusedList` 只有一张卡时自动选它，多张时让用户选一张或选「不挂卡」，然后 `Timer.onSessionConfirmed` 把单个 `cardId` 交给 `timerFinished` → `recordFinishedSession`，只有那张卡的 `actual` 增加。
不要退回「挂到 `focusedList` 的每一张卡」：那会让卡片时长按列表卡片数放大，而 `dataMerger` 的 `setBoardInfo` 按卡片重算看板时长，导出再导入后 `spentHours` 会变成实际的 N 倍。
事后改归属（改项目 / 挂卡 / 删除）统一走主进程的 `applySessionEdits` 单事务：卡片按 `board.lists → list.cards` 反查归属，跨看板挂卡整批拒绝，换卡先解绑再挂一次，改项目同时把看板 `spentHours` / `relatedSessions` 转到新板。
它的返回值必须 `dispatch(applySessionEditsResult)` 写回 store——只写库不更新 `kanban.cards` / `kanban.boards`，界面要等重启才看到新的卡片归属。

### 开发期时间缩放

`src/config.ts` 在非生产环境按 `DEBUG_TIME_SCALE`（120）压缩计时器：写入走 `scaleMs`，读取再展开回名义值，统计数据保持名义值。
任何新的计时/会话代码都必须经过这些工具函数，否则开发时钟、进度环和历史总计会互相矛盾。

## 测试约定

- `jest.config.js` 使用 `jsdom`、Babel 转译、`maxWorkers: min(8, cpus)`、每测试 30 秒超时和 JUnit 输出（`junit.xml`）。
  `test/setup-env.js` 钉住 `NODE_ENV=test`，并为 antd polyfill `matchMedia`/`MessageChannel`/`ResizeObserver`。
- `test/` 里的 `setupFilesAfterEnv` 装配提供了 DB 桥接、React act 环境、jsdom 兼容和 console 拦截——新测试自动获得这些。
- `posttest` 删除 `.local/test`；action 测试跑的是真实 SQLite 事务，所以优先断言 repository 层的结果而不是 mock。
- 流程（红绿循环、seam、垂直切片）可参考 `/tdd` skill（已随仓库提供）；本仓库的判据（哪些契约可测、mock 停在哪、时钟与隔离、覆盖率）见 `docs/testing.md`。

## 约定

- 提交信息必须符合 Conventional Commits（commitlint）；类型决定 semantic-release 的版本号。
- **提交信息一律用简体中文**：`type` 和 `scope` 保持英文小写（`fix(timer): 应用时长与会话总时长保持一致`），subject 与 body 都用中文，不要写英文句子再翻译。commit 历史与 changelog 是给中文使用者读的，混入英文正文会让检索和复盘都变差。
  Husky + lint-staged 会对暂存文件跑 prettier 和 `eslint --fix`。
- 撤销未推送的提交要重写，而不是 revert：`git reset --soft <base>`（工作可丢弃时用 `git reset --hard`），然后重新提交想要的改动。
  `revert:` 不是 semantic-release 认识的类型，所以 revert 提交会往 changelog 里加一条发版根本不需要的记录，而被它抵消的那条又会留下来，描述一个已经不再发布的功能。
  `git status -sb` 会告诉你这些提交是否还在本地（`ahead N`）；一旦到了 `origin`，就什么都不要重写，改用 revert。
- 渲染层代码不要出现 Node 全局——文件系统路径和原生模块属于 `src/main`。

## Agent skills

工程类 skill（`/to-tickets`、`/to-spec`、`/grill-with-docs` 等）从 `docs/agents/` 读这几份配置，不要另立约定。

### Issue tracker

issue 和 spec 是 `.scratch/<feature-slug>/` 下的 markdown 文件，不是 GitHub Issues。见 `docs/agents/issue-tracker.md`。

### Domain docs

单上下文：根目录 `GLOSSARY.md` + `docs/adr/`，文件不存在时静默跳过。见 `docs/agents/domain.md`。

## 保持本文件的准确性

随着代码的变更，本文档会逐渐偏离实际情况；把它当作需要验证的声明，而不是事实。
依赖这里写的某条命令、路径或行为之前，先对着 `package.json`、配置文件或源码确认一遍。

某项任务证明这里的说法错了或不完整时（脚本改名了、文件挪走了、行为变了、某个约束解除了），在同一次改动里更新本文件，并在交接时说明。
优先改原有条目，而不是在后面补一句关于旧行为的注记。
保持密集：只写命令、不显然的约束和跨文件架构，不写通用的工程建议。
