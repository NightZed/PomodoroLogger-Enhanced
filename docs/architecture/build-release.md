# 打包、发版与依赖安装

> `AGENTS.md` 的「打包 / 发版 / 依赖」区域详情。改动构建产物、CI、更新通道或依赖安装行为前先读这里；改完回 `AGENTS.md` 核对硬约束。

## Linux AppImage

固定走新 static runtime：`build.toolsets.appimage: "1.0.3"`。

- runtime 静态链接 FUSE，产物不依赖宿主机的 `libfuse2`。
- electron-builder 会把全局 `compression: "maximum"` 映射成 zstd 而非 xz，因为旧 FUSE2 runtime（含 appimage.github.io 校验用的那个）只能挂载 zlib/zstd 镜像。
- 删掉这个字段会退回 legacy FUSE2 工具集，产物重新依赖 `libfuse2`，且 `maximum` 下 mksquashfs 会用 xz，导致这些环境报 `Squashfs image uses xz compression, this version supports only zlib, zstd`。

## Windows

**差分当前关闭**（`nsis.differentialPackage: false`），快速开发阶段优先控制安装包体积。开启时用 `"store-asar"`：`app.asar` 在 7z 里以 Store 方式存放，实测安装包从 93.8 MB 涨到 112.4 MB（+19%），换来改一行代码只下载零点几个百分点。

**arm64 由 CI 单独构建**：`--win --arm64`，`win.target` 不写 arch（写了会让本地 `pnpm run dist-win` 也同时触发 arm64 编译）。两个架构各用一条更新通道：CI 分两步构建，x64 生成 `latest.yml`，arm64 用 `--config.publish.channel=latest-arm64` 生成 `latest-arm64.yml`；`src/main/AutoUpdater.ts` 按 `process.arch` 选 channel。

`nsis.buildUniversalInstaller` 固定为 `false`：默认的 universal 包会把两个架构合并成 ~182 MB 的文件，而 `NsisUpdater` 只按扩展名选文件，`latest.yml` 会指向它。

arm64 的 `get-windows` 没有上游预编译，`@electron/rebuild` 会走 node-gyp 从源码编译，依赖 runner 的 VS ARM64 工具集（windows-2022 镜像带 `Microsoft.VisualStudio.Component.VC.Tools.ARM64`）。

## macOS

`artifactName` 写死成 `Pomodoro-Logger-Enhanced-`，不要用 `${productName}`：它展开后带空格，上传时 zip 与 blockmap 会分别被改成 `-` 和 `.`（`Pomodoro-Logger-Enhanced-*.zip` 对不上 `Pomodoro.Logger.Enhanced-*.zip.blockmap`），而 updater 拼的是 `<zip>.blockmap`，404 后差分退化成全量下载。

## CI 与发版

- `.github/workflows/test.yml`：每次 push/PR 跑 `pnpm lint`、`pnpm typecheck`、`pnpm test --ci`。
- `.github/workflows/build.yml`：分平台用 `pnpm exec electron-builder` 打包（老的 `action-electron-builder` 已移除，因为它把 yarn 写死了）。
- 发版通过 `Build/release` workflow → semantic-release 手工触发。**永远不要手动改 `package.json` 版本号或打 tag。**

## pnpm 与依赖安装

pnpm 11，版本钉在 `packageManager`。

`pnpm-workspace.yaml` 是安装行为的唯一位置：`nodeLinker: hoisted`（electron-builder 需要扁平的 `node_modules`）、`overrides`（取代 yarn 的 `resolutions`）、`allowBuilds`、`patchedDependencies`。

### 唯一的 patch

`patches/@rc-component__portal@2.2.1.patch`：Portal 的 container effect 无依赖数组且每次渲染无条件 `setState`，平时靠 React 的 eager bail-out 兜底；React 19 在 fiber 还有 pending lanes 时跳过 bail-out，于是拖动任何滑块时（antd Slider 的 tooltip 弹层每帧带着新值重渲染 Portal）每帧一次真实 dispatch 落在 passive flush 里，50 帧后打出一串 `Maximum update depth exceeded`。

patch 在值未变化时跳过 setState。用 `git apply` 更新 patch 后要跑 `pnpm install` 重放。升 antd / `@rc-component/*` 时先检查该上游是否已修，已修就撤掉 patch。

### 安装脚本

`strictDepBuilds` 默认为 `true`，所以一个带未审核安装脚本的依赖会让整个安装以非零码失败——要显式列成 `true` 或 `false`，不要指望只给个警告。

| 包                  | 安装行为                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron` 44       | 不带安装脚本；第一次 `electron .` 时下载二进制                                                                                                                                                                                                            |
| `better-sqlite3` 13 | 不带安装脚本；加载自带的 `prebuilds/`                                                                                                                                                                                                                     |
| `get-windows` 10    | 唯一带真实 `install` 脚本的原生模块（`node-pre-gyp install --fallback-to-build`）；`@electron/rebuild` 在 `pnpm install` 期间用 `binding.gyp` 编译它的 napi addon，所以这一步需要 node-gyp 加一个 Python（CI runner 自带），并且必须留在 `allowBuilds` 里 |

打包后的应用加载预构建的 `lib/binding/napi-9-<platform>-<arch>/*.node`（node-pre-gyp 的 `module_path`）；`build/` 被排除在 `build.files` 之外。

### 两个容易踩的命令行细节

- `pnpm pack` 是内置命令，**不会**执行 `scripts.pack`；要用 `pnpm run pack`。
- pnpm store 位于仓库之外（全局配置，本机在 `E:\pnpm-store`），并且必须和检出目录在同一个盘，否则 pnpm 会静默地复制而不是硬链接。
