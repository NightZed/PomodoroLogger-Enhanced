# AGENTS.md

写给在本仓库工作的 AI 编码助手。

本文件是**唯一事实来源**：`CODEBUDDY.md` 里只有 `@AGENTS.md`，所以改这个文件，不要改那个。

领域细节不在本文件，在 `docs/architecture/`。按「区域索引」取用：动手前先读对应的那份，改完回来核对「硬约束」。

## 项目

Electron 桌面应用（番茄钟 + 看板 + 桌面活动追踪 + 统计）。
渲染层是 React 19 + Redux；主进程独占 SQLite（`better-sqlite3`）。
需要 Node.js 24+ 和 pnpm 11（版本钉在 `packageManager` 里）。

## 硬约束

这些违反会直接导致数据错误、功能损坏或明显卡顿。每条都有一份细节文档记着原因。

**数据与统计**

- 只读扫描禁用 `findSync`；只要 id 用 `idsSync()`，只要部分字段用 `findFieldsSync()`。
- 会话的 `Σapps` 必须等于 `spentTimeInHour`，不要退回「应用记墙钟、总时长写名义值」。
- 一个番茄只挂**一张**卡，不要挂到 `focusedList` 的全部卡片。
- 渲染层不直接碰 SQLite，也不出现 Node 全局——文件系统路径和原生模块属于 `src/main`。

**看板**

- 不要调大 `WINDOW_SIZE`，那只是把 50ms 换回 1s。
- 卡片悬停高亮不要改回 `:hover`，也不要换回模糊阴影。
- 列表顶部遮罩**不能用 `mask-image`**，dnd 的拖拽层会被裁剪。
- `inWindow` 与 `contentLimit` 是两个开关，不要合并。

**设置与渲染**

- 七个滑块一律非受控，拖动值不进 store。
- 占满窗口的平面保持纯 `background-color`，不要用 `color-mix()`。
- 不要 import antd 的 `message` / `notification` / `Modal`，走 feedback 层与 `AppModal`。
- `kind: 'error'` 只能出现在 `alert` 或 `notice`；走 notice 前必须先落盘。
- `AppErrorBoundary` 必须留在 `Application` 外面；Timer 的内层边界不能被包装组件替代。

**窗口与生命周期**

- 只有「关闭到托盘」算 `tray`；不要改回 `document.visibilityState`。
- 页面卸载延迟不要缩短，那是行为变更。

**构建与提交**

- 不要加依赖 TS 编译器 API 的 loader（这里没有 ts-loader / ts-jest）。
- 永远不要手动改 `package.json` 版本号或打 tag。
- 提交信息用简体中文，类型与 scope 小写。
- 提交前跑 `pnpm typecheck && pnpm lint`，约 11 秒。

## 区域索引

| 你在改…                              | 先读                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| 打包、CI、更新通道、依赖安装         | `docs/architecture/build-release.md`                             |
| 主进程启动、IPC、preload、弹窗与提示 | `docs/architecture/process-ipc.md`                               |
| SQLite、repository、迁移             | `docs/architecture/data.md`                                      |
| 日志、错误上报、崩溃页               | `docs/architecture/diagnostics.md`（文件表在 `docs/logging.md`） |
| Redux 结构、页面清单、主题、渲染性能 | `docs/architecture/renderer.md`                                  |
| 窗口档位、托盘、页面卸载、今日统计   | `docs/architecture/window-modes.md`                              |
| 看板、列表、拖拽、卡片               | `docs/architecture/kanban.md`                                    |
| 设置页滑块、窗口不透明度             | `docs/architecture/settings.md`                                  |
| 计时、活动追踪、会话落库、提示音     | `docs/architecture/session.md`                                   |
| 写测试                               | `docs/testing.md`                                                |
| 界面文案                             | `docs/i18n.md`                                                   |

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

打包细节（AppImage runtime、Windows 差分与 arm64 双通道、mac `artifactName`、CI、pnpm 安装脚本）见 `docs/architecture/build-release.md`。

## 构建工具链约束

- Babel 8（`babel-loader`）负责 webpack 和 Jest 里的全部转译。
  这里**没有** `ts-loader` / `ts-jest`：`typescript` 被别名到 `@typescript/typescript6`，因为 typescript-eslint 需要 TS 6 的 JS 编译器 API，而 `@typescript/native` 只提供类型检查用的 `tsc`。
  加一个依赖 TS 编译器 API 的 loader 会直接搞坏构建。
- 产物：`dist/main.js`（入口 `src/main/main.ts`）、`dist/preload.js`、`dist/worker.js`（子进程 worker）、`dist/app.js` + `dist/index.html`（渲染层）。
  只有 `.tsx` 会拿到 React 转换，所以 `.ts` 里的泛型箭头函数不会产生歧义——`preset-react` 要一直限定在 `.tsx`。
- 原生/纯 ESM 模块（`better-sqlite3`、`get-windows`、`electron-updater`）在主进程构建里是 webpack `externals`，在 Jest 里通过 `jest.config.js` 的 `moduleNameMapper` / `transformIgnorePatterns` 打桩。

## 测试约定

写测试前先读 `docs/testing.md`（完整判据在那），但下面五条是高频自检项，不需要翻文档：

- **判据**：把实现重写一遍、只保留外部可观察行为，测试应当仍然通过。它挂了，就说明钉在了实现上。
  算行为：落库的那一行、IPC payload、dispatch 出去的 action、用户看得见的 role / 文本 / 启用禁用 / 焦点。
  不算：私有字段、内部调用顺序、`className`、`data-testid`。
- **mock 只停在边界**：`fs` / `electron` / `get-windows` / `electron-updater` / 时钟 / worker。
  应用内部一切跑真实现——断言落库的那一行，而不是 repository mock 被调了几次。
- **失败信息必须指出元凶**：把变化的那部分塞进断言值；`expect(true).toBe(true)` 只说明「某处坏了」。
- **不显而易见的测试带 `// Regression:`**，写明防的是哪次事故。写之前先回答「什么改动会让它失败」——答不上来就是代理断言（检查代码怎么写，而不是做了什么）。
- **不加覆盖率阈值，不用快照**。`toMatchSnapshot` 目前是 0，保持这样。

`jest.config.js` 使用 `jsdom`、Babel 转译、`maxWorkers: min(8, cpus)`、`workerIdleMemoryLimit`（worker 空闲超限即重启，防全量跑累积 OOM）、每测试 30 秒超时和 JUnit 输出（`junit.xml`）。
`test/setup-env.js` 钉住 `NODE_ENV=test`，并为 antd polyfill `matchMedia`/`MessageChannel`/`ResizeObserver`。

`test/` 里的 `setupFilesAfterEnv` 装配提供了 DB 桥接、React act 环境、jsdom 兼容和 console 拦截——新测试自动获得这些。

`posttest` 删除 `.local/test`；action 测试跑的是真实 SQLite 事务，所以优先断言 repository 层的结果而不是 mock。

改动后的验证按影响面选范围，不要默认全量：局部组件/样式/单文件逻辑只跑受影响的测试文件 + `pnpm typecheck` + `pnpm lint`；动了共享基建（`jest.config.js`、`test/setup-*`、被多处引用或 mock 的模块）或提交前的最终确认才跑 `pnpm test` 全量。新增测试文件会加重全量跑的 worker 内存（见 `workerIdleMemoryLimit`），改完基建后跑一次全量确认稳定。

流程（红绿循环、seam、垂直切片）可参考 `/tdd` skill（已随仓库提供）。

## 约定

- 需求有歧义或关键信息缺失时，**先追问、后动手**：不确定要改什么就提问澄清，弄清楚需求之前不要开始改代码；基于猜测写出的代码返工成本高于一次提问。
- 提交信息必须符合 Conventional Commits（commitlint）；类型决定 semantic-release 的版本号。
- **提交信息一律用简体中文**：`type` 和 `scope` 保持英文小写（`fix(timer): 应用时长与会话总时长保持一致`），subject 与 body 都用中文，不要写英文句子再翻译。commit 历史与 changelog 是给中文使用者读的，混入英文正文会让检索和复盘都变差。
  Husky + lint-staged 会对暂存文件跑 prettier 和 `eslint --fix`。
- 撤销未推送的提交要重写，而不是 revert：`git reset --soft <base>`（工作可丢弃时用 `git reset --hard`），然后重新提交想要的改动。
  `revert:` 不是 semantic-release 认识的类型，所以 revert 提交会往 changelog 里加一条发版根本不需要的记录，而被它抵消的那条又会留下来，描述一个已经不再发布的功能。
  `git status -sb` 会告诉你这些提交是否还在本地（`ahead N`）；一旦到了 `origin`，就什么都不要重写，改用 revert。

## Agent skills

工程类 skill（`/to-tickets`、`/to-spec`、`/grill-with-docs` 等）从 `docs/agents/` 读这几份配置，不要另立约定。

### Issue tracker

issue 和 spec 是 `.scratch/<feature-slug>/` 下的 markdown 文件，不是 GitHub Issues。见 `docs/agents/issue-tracker.md`。

`.scratch/` 只放**还没做完的**工作。已经做完、后面的人还会依赖的内容 → `docs/architecture/`（稳定事实）或 `docs/adr/`（决策记录）。

### Domain docs

单上下文：根目录 `GLOSSARY.md` + `docs/adr/`，文件不存在时静默跳过。见 `docs/agents/domain.md`。

## 保持本文件的准确性

随着代码的变更，本文档会逐渐偏离实际情况；把它当作需要验证的声明，而不是事实。
依赖这里写的某条命令、路径或行为之前，先对着 `package.json`、配置文件或源码确认一遍。

某项任务证明这里的说法错了或不完整时（脚本改名了、文件挪走了、行为变了、某个约束解除了），在同一次改动里更新对应文件，并在交接时说明。
优先改原有条目，而不是在后面补一句关于旧行为的注记。
保持密集：只写命令、不显然的约束和跨文件架构，不写通用的工程建议。

**改哪个文件**：全局约束、命令、索引 → 本文件；领域细节 → `docs/architecture/` 下对应的那份。
一份内容只写一次，另一处只放指针。
