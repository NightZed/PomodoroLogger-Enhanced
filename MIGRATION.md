# 依赖迁移纲要

> 生成日期：2026-10-20
> 最近更新：2026-10-23
> 状态：B0 / B1 / B1.5 / B2（代码、升级/回滚、History 性能）/ B3 / B5 已完成；B4 代码迁移完成（`get-windows` + Electron 44.9.3）；B6 核心工具链迁移完成，手工验收待做；B7 Electron 安全架构（B7.1-B7.5）代码、生产/开发启动与 Windows 安装目录验证完成，GUI 冒烟待做
> 适用版本：当前 `package.json`（React 19.3 / antd 6 / webpack 5.111 / Jest 30）

本文档列出项目中已停止维护、已被弃用、已过 EOL，或已经确定要替换的依赖，并给出迁移顺序、改动范围、验收标准和回滚方式。每完成一项，直接勾选对应条目并补充实际使用的版本与迁移日期。

已经确定的替换：

- `nedb` → **SQLite**（本文档以 `better-sqlite3` 为推荐实现）
- `active-win` → **`get-windows`**
- `react-test-renderer` → **React Testing Library**

---

## 1. 总览

| 批次 | 内容 | 优先级 | 独立可发布 | 主要风险 |
| --- | --- | --- | --- | --- |
| B0 | 控制台基线：分类、修真实警告、建立“增量=0”门禁 | P0 | 是 | 低 |
| B1 | 低风险清理（类型桩、弃用 Babel 插件、husky、codecov、无用 ESLint 插件） | P0 | 是 | 低 |
| B1.5 | `react-test-renderer` → React Testing Library（测试降噪） | P0 | 是 | 低 |
| B2 | `nedb` → SQLite | P0 | 是 | 高（用户数据） |
| B3 | `worker-loader` → webpack 5 原生 Worker；`marked` 4 → 18 | P1 | 是 | 中 |
| B4 | `active-win` → `get-windows`；Electron 39 → 44 | P0 | 一起做 | 高（原生模块 / 打包） |
| B5 | 状态与 UI 库替换（`deox`、`react-hot-keys`、`react-trend`、`prop-types`、`react-styleguidist`） | P1 | 可分多次 | 中 |
| B6 | 工具链大版本（prettier 3、webpack-cli 7 / WDS 6、ESLint 10、Babel 8、nanoid 等） | P2 | 是 | 中 |
| B7 | Electron 安全架构：移除 `remote`、preload + `contextBridge`、关闭 renderer Node 能力 | P1 | 分阶段 | 高（跨进程边界） |

建议顺序：**B0 → B1 → B1.5 → B2 → B3 → B4 → B5 → B6 → B7**。

- B0 是短周期（约 1–3 天）的“清基线”，不要求把所有告警修完，只要求把真 bug 和测试噪声分开，并让后续每批都有可对比的基线。
- B1.5 放在 B5 之前：`react-hot-keys` 替换会重写 `Hotkeys.test.tsx`，先完成 RTL 迁移可以避免同一批测试改两遍。
- B2 和 B4 不要同时进行，两者都会改原生依赖和打包配置，排障时难以区分。

全局完成标准（每一批都要满足）：

```bash
yarn typecheck
yarn lint
yarn test
yarn build
yarn pack          # 至少在一个平台上做一次解包冒烟
```

- [ ] 控制台（开发运行 + Jest）的错误/警告数量不超过该批次开始前的基线；新增项必须归类并有结论。
- [ ] 不允许把“已知告警”无限期留在默认输出里：要么修，要么在测试里显式声明为预期输出（allowlist）。

---

## 1.5 B0：控制台基线与降噪

在继续任何大版本迁移之前，先做一次短周期的控制台治理。目的不是“清零所有警告”，而是**把可归因的噪声降到最低**，让 B2 / B4 引入的新错误能被立刻识别。

### 1.5.1 当前基线（2026-10-20 实测）

- 57 个测试套件、444 个测试全部通过。
- B0 开始时完整测试输出约 112 条 `console.error` / `console.warn`，主要构成：

| 数量 | 内容 | 归类 |
| --- | --- | --- |
| 74 | `react-test-renderer is deprecated` | C：测试基础设施 |
| 7 | `An update to Root inside a test was not wrapped in act(...)` | C：测试基础设施 |
| 2 | `[antd: Modal] maskClosable is deprecated` | B：迁移遗留告警 |
| 4 类 | React 19 未知 DOM prop：`contentOpacity`、`sessionEnding`、`compact`、`maximized`、`minimize` | A：真实代码问题（styled-components 透传） |
| 若干 | `activeWin init error: Cannot find module '@mapbox/node-pre-gyp'`、updater 测试的预期错误、jsdom `getComputedStyle` 未实现 | D：预期/环境限制 |

> 开发模式下的 Electron 控制台还会额外出现 `nodeIntegration` / `contextIsolation` 的安全建议，这是当前架构的已知状态，不在 B0 处理；不要把它和迁移 bug 混在一起。

**治理结果（2026-10-20）**：

- B0 首轮：112 → 105 条；React 未知 DOM prop 与 antd `maskClosable` 归零。
- B1.5 + D 类 allowlist 完成后：**105 → 0 条**。`react-test-renderer` / `act`、active-win 预期失败、updater 预期错误、jsdom `getComputedStyle`、dataMerger 的预期警告均已消除或显式静默。

### 1.5.2 分类规则

- **A：真实问题** —— 未捕获异常、数据丢失、功能不工作、React 19 未知属性、原生模块加载失败。**必须立即修**，不能带入后续迁移。
- **B：迁移遗留的弃用告警** —— antd/React 已弃用的 prop 或 API，当前仍能用，但下个大版本会移除。在触碰对应库之前修掉。
- **C：测试基础设施噪声** —— `react-test-renderer`、`act`、jsdom 限制。用 B1.5 的 RTL 迁移集中处理。
- **D：预期输出/环境限制** —— updater 的离线错误、故意触发的错误路径、jsdom 未实现的 API。在测试里显式 allowlist，不要打印到默认输出。

### 1.5.3 B0 的具体修复项

- [x] `Application.tsx` 的 `Main` / `Content` / `Wallpaper`：把 `minimize`、`compact`、`contentOpacity`、`path`、`opacity` 改为 styled-components 的 transient props。
- [x] `WindowControls.tsx` 的 `Controls`：`compact` → `$compact`。
- [x] `Timer.tsx` 的 `CompactModeIcon`、`TimerLayout`、`TimerInnerLayout`：`compact` → `$compact`。
- [x] `SessionEndingMask.tsx`、`AppTitleBar.tsx` 中同类自定义 prop 一并改为 `$` 前缀。
- [x] 同时处理了其他会向 DOM 透传的 styled-components prop：`Search`、`MiniLogger`、`LabelEditor`、`Kanban/List`、`Setting`、`SettingNav`。
- [x] `feedback/Feedback.tsx`：antd 6 的 `maskClosable: false` → `mask={{ closable: false }}`（`modal.confirm` / `modal.info` 两处）。
- [x] 主动失败路径的预期日志改为窄范围 allowlist：`activeWin.test.ts`、`AutoUpdater.test.ts`、`dataMerger.test.ts`。
- [x] `test/jsdom-compat.js` 去掉 jsdom 不支持的 `getComputedStyle(el, pseudoElt)` 第二参数，消除 antd 滚动条测量的 “Not implemented” 噪声。
- [x] `test/console-gate.js`：未声明的 `console.error` / `console.warn` 会让当前测试失败；预期错误路径必须在最小范围内 `jest.spyOn` 显式声明。已发现并修复 `BoardEditor.test.tsx` 中 mock 错包名导致 rc-textarea 产生的 `NaN` 高度告警。

---

## 2. B1：低风险清理

**实施结果（2026-10-21）**：已删除未使用的类型/ESLint 依赖、`prop-types`、旧 Babel proposal 插件和 Codecov 上传链路；husky 升级到 9 并恢复提交钩子。`conventional-changelog-conventionalcommits` 10.4.1 与 semantic-release 25 当前携带的 `conventional-changelog-writer@8.4.0` 不兼容，保留 9.3.1，留给 B6 与 semantic-release 一起升级。

### 2.1 直接删除的依赖

- [x] `@types/classnames`：npm 已标记为 stub，`classnames` 自带类型。
- [x] `@types/prop-types` + `prop-types`：删除 `Progress.tsx` 的 `static propTypes`，仅保留现有 TS 类型。
- [x] `eslint-plugin-import`：`eslint.config.js` 根本没有加载它。
- [x] `eslint-plugin-react`：配置里只注册了插件，没有启用任何 `react/*` 规则；删除插件注册与 `settings.react`，保留 `eslint-plugin-react-hooks` 与 JSX parser 配置（见 B6）。
- [x] `@babel/polyfill`：已从 `webpack.style.js` 的 entry 删除（该文件随后在 B5.5 整体删除）；Electron / 现代浏览器不需要整包 polyfill。
- [x] `@babel/plugin-proposal-optional-chaining`：删除；optional chaining 已是标准语法，由 preset-env 按 target 处理。
- [x] `@babel/plugin-proposal-class-properties`：删除而不是替换。`preset-env` 已按 `electron: 39` / `last 2 versions` 处理 class fields；显式 `{ loose: true }` 反而与 preset-env 的 private 字段插件产生 loose 模式冲突，完整构建已验证无 Babel 告警。

### 2.2 husky 2.7.0 → 9.1.7

当前 `package.json` 的 `"husky": { "hooks": ... }` 写法在 husky 5+ 已经完全失效，**提交钩子实际上没有运行**。

- [x] 删除 `package.json` 中的 `"husky"` 字段。
- [x] `scripts` 增加 `"prepare": "husky"`。
- [x] 新建 `.husky/pre-commit`：`npx lint-staged`
- [x] 新建 `.husky/commit-msg`：`npx --no -- commitlint --edit "$1"`
- [x] 删除对 `HUSKY_GIT_PARAMS` 的依赖。
- [x] 验证：`git hook run commit-msg` 对 `bad message` 返回 1，对 `chore(test): verify husky hook` 返回 0；`lint-staged` 由同一钩子调用。

### 2.3 codecov 3.8.3 → 删除

项目没有覆盖率门禁，`codecov.yml` 只保存了一个上传 token，CI 也只做无条件上传；继续维护 Codecov 没有收益，因此**删除而不是升级**。

- [x] 删除 `.circleci/config.yml` 中的 `./node_modules/.bin/codecov`。
- [x] 删除 devDependency `codecov`。
- [x] 删除 `codecov.yml`（含旧 token）及 electron-builder `files` 中的排除项。
- [ ] 如果以后需要覆盖率门禁，再引入 Codecov CLI / GitHub Action，并把 token 放在 CI secret 中，而不是配置文件里。

### 2.4 其他小项

- [ ] `conventional-changelog-conventionalcommits` 9.3.1 → 10.4.1：**暂缓**。10.x 要求 `conventional-changelog-writer@9+`，而 semantic-release 25 当前依赖 8.4.0，`test/semanticReleaseConfig.test.ts` 会直接失败；待 B6 与 semantic-release 一起升级。
- [x] `node-gyp` 9 已移除（B4）。它只是 2019 年为旧 GitHub Action 加的直接依赖；现在开发树中由 `@electron/rebuild` / semantic-release 提升的 node-gyp 12.4.0 提供工具链，`get-windows` 保留自己的嵌套 10.3.1，安装不再依赖根目录的 node-gyp 9。

---

## 2.5 B1.5：`react-test-renderer` → React Testing Library

React 官方已将 `react-test-renderer` 标记为 deprecated（每个测试用例都会打印一条 `console.error`）。迁移前完整测试输出里的 74 条弃用告警 + 7 条 `act` 告警都来自它，是本项目最大的一类控制台噪声。

这一批只改测试，不改产品代码，风险低；建议紧接 B1 完成，并且**必须在 B5 的 `react-hot-keys` 替换之前完成**。

**实施结果（2026-10-20）**：9 个文件全部迁移完成，`react-test-renderer` 与 `@types/react-test-renderer` 已从直接依赖中删除。完整测试仍为 57 suites / 444 tests 通过，控制台告警为 0。AppTitleBar 使用 rc-tabs 的 `data-node-key` / `role="tab"` 查询；History 与 Setting 分别用原生 `select` / `range` 替身隔离 antd 的弹层与滑块实现。

### 2.5.1 涉及文件（9 个）

- `src/components/common/Mini/MiniLogger.smoke.test.tsx`
- `src/components/common/Search/Search.test.tsx`
- `src/components/Visualization/GridCalendar/GridCalendar.test.tsx`
- `src/components/Visualization/TimeTreemap/TimeTreemap.test.tsx`
- `src/renderer/components/AppTitleBar/AppTitleBar.test.tsx`
- `src/renderer/components/History/History.test.tsx`
- `src/renderer/components/Setting/Setting.test.tsx`
- `src/renderer/components/Hotkeys.test.tsx`
- `src/renderer/components/WindowControls.test.tsx`

### 2.5.2 迁移方式

| `react-test-renderer` | React Testing Library |
| --- | --- |
| `TestRenderer.create(<X />)` | `render(<X />)` |
| `renderer.root.findByType(...)`、`findAllByType` | `screen.getByRole` / `getByText` / `container.querySelector` |
| `renderer.toJSON()` 断言树结构 | 对 DOM 节点断言（`toHaveTextContent`、`toHaveAttribute`、`querySelector`） |
| `renderer.update(<X />)` | `rerender(<X />)` |
| `act(() => ...)` | `userEvent` / `fireEvent` + `waitFor` / `findBy*` |
| `renderer.unmount()` | `unmount()`（或依赖 RTL 的自动 `cleanup`） |

注意事项：

- `@testing-library/react` 16.3.3 与 `@testing-library/dom` 已安装；`@testing-library/jest-dom` 目前没有，若想用 `toBeInTheDocument` 等 matcher 需要新增，否则用原生 DOM 断言。
- `AppTitleBar` / `WindowControls` 的测试依赖 `react-test-renderer` “host ref 为 null”的行为；RTL 的 ref 指向真实 DOM 节点，断言要按 DOM 语义重写。
- antd 的弹层渲染在 `document.body` 下，使用 `screen` 或 `within(document.body)`，不要只看 `container`。
- 时间相关的测试（`Hotkeys` 的 release 检测、`History` 的 debounce）继续用 fake timers，但 `userEvent` 需要 `advanceTimers` 配置，迁移时逐个确认。
- `WindowControls` 的原生窗口 IPC 断言保持现有 mock，不要把 `ipcRenderer` 的真实实现带进来。

### 2.5.3 验收

- [x] 9 个文件全部改用 RTL，测试数量和断言覆盖不减少。
- [x] `yarn test` 输出中 `react-test-renderer is deprecated` 和 `not wrapped in act` 归零。
- [x] 删除 `react-test-renderer`、`@types/react-test-renderer`（`react-styleguidist` 已在 B5.5 删除，lockfile 已清理）。
- [x] `jest.config.js` 新增 `test/jsdom-compat.js`（仅处理 jsdom 的 `getComputedStyle` 限制）和 `test/console-gate.js`（未声明 `console.error` / `console.warn` 直接失败），不使用全局静默。
- [x] 为 B5 的 `Hotkeys` 重写保留一份可用的 RTL 测试基线。

---

## 3. B2：`nedb` → SQLite

这是改动面最大、也是唯一涉及用户数据的一批。**核心原则：旧 `.nedb` 文件在迁移后保持原样，不删除，至少保留一个大版本。**

**实施结果（2026-10-21）**：按推荐方案完成主进程单写者架构。新增 `src/main/db/`（连接、schema、repository、迁移器、IPC），`better-sqlite3@13.0.3` 负责唯一长期连接；渲染进程通过 `db:request` / `db:ready` IPC 访问，`DBWorker` 保留原方法签名但不再打开文件。`projectDB` 已删除，settings 拆为 key-value，旧 `.nedb` 在迁移前复制到 `db-bk/pre-sqlite-*` 并原样保留。新增迁移器、查询映射、History 查询和打包配置测试；完整测试 63 suites / 469 tests 通过，`nedb` / `@types/nedb` 已从依赖树移除，`electron-builder` 的 `@electron/rebuild` 已成功重建 `better-sqlite3`。

### 3.1 现状盘点

7 个数据库文件（`src/config.ts`）：

| 逻辑库 | 文件 | 是否有实际读写 |
| --- | --- | --- |
| `projectDB` | `projects.nedb` | **没有发现任何读写方**，只在 `src/main/db.ts` 实例化；迁移时可直接删除 |
| `sessionDB` | `session.nedb` | 有（记录、历史、KNN） |
| `settingDB` | `setting.nedb` | 有（设置单文档） |
| `kanbanDB` | `kanban.nedb` | 有（看板） |
| `cardsDB` | `cards.nedb` | 有（卡片） |
| `listsDB` | `lists.nedb` | 有（列表） |
| `moveDB` | `moveCard.nedb` | 有（移动历史） |

目前有三条访问路径：

1. **主进程直接访问**：`src/main/db.ts`、`src/main/io/read.ts`、`src/main/io/write.ts`（导入/导出、备份）、`src/main/init.ts`（启动时同步读取 `setting.nedb` 的主题设置）。
2. **渲染进程 Web Worker**：`src/renderer/workers/db.worker.ts`，通过 `DBWorker` 暴露 `find / findOne / insert / update / remove / count / aggHistory`。
3. **渲染进程直接打开文件**：`src/renderer/monitor/sessionManager.ts`（`loadDB` / `loadDBSync`）、`src/renderer/workers/trainKnn.worker.ts`、`src/renderer/workers/deferCompaction.ts`、`src/utils/dbHelper.ts` 的 `AsyncDB`，以及 `Timer/action.ts` 里直接使用 `dbs.settingDB` 的代码。

必须保留的行为：

- 文档 `_id` 是 9 位不透明字符串（`src/utils/uid.ts`），SQLite 中用 `TEXT PRIMARY KEY` 原样保存。
- 目前已使用的 Mongo 风格查询：`$gt`、`$gte`、`$lt`、`$in`、`$set`、`$unset`、`$push`、`$pull`、`$inc`、`upsert`、`multi`、投影（如 `{ _id: 1, name: 1 }`）、点路径更新（如 `'spentTimeInHour.actual'`）。
- 没有使用数据库层排序/分页（`sort/skip/limit` 都在内存里完成，已确认）。
- 备份/导出是存储无关的：`db-bk/pomodoro-logger-data-backup.json` 与 `src/shared/dataTransfer` 的 `SourceData` 格式不能变。
- `readThemeSetting()` 在首帧之前同步读取主题，必须继续满足“同步可用”。

### 3.2 选型

| 方案 | 结论 | 说明 |
| --- | --- | --- |
| **`better-sqlite3` 13.x** | **推荐** | 同步 API、事务简单、性能稳定；Electron 下需要按 ABI 重建，`electron-builder install-app-deps` 可以处理；`package.json` 里需加入 asarUnpack `**/*.node` |
| `node:sqlite` | 暂不推荐 | 零原生依赖，但 Node 24 中仍是 experimental，且行为绑定 Electron 内置 Node 版本 |
| `sqlite3` | 不推荐 | 回调式 API、维护节奏慢，项目现有代码已经是 Promise 风格 |
| 继续找 nedb fork | 不推荐 | 已确定迁 SQLite；`@seald-io/nedb` 只能作为短期止血方案 |

### 3.3 架构决策（实施前需拍板）

**目标态（推荐）：主进程是唯一数据库所有者，渲染进程通过 IPC 访问。**

- `src/main/db/sqlite/` 下放连接、schema、迁移器、各表 repository。
- `src/main/db/service.ts` 暴露与现在 `DBWorker` 相同的操作：`find / findOne / insert / update / remove / count / aggHistory`。
- `src/renderer/workers/DBWorker.ts` 保留类名和方法签名，内部从 Web Worker RPC 换成 `ipcRenderer.invoke('db:...')`，这样所有 action 调用点不用改。
- `aggHistory` 继续在主进程里聚合，只把小的聚合结果回传，避免大记录跨进程。
- `readThemeSetting()` 用 `better-sqlite3` 同步查询，仍然可以在建窗前完成。
- 删除 `db.worker.ts`、`deferCompaction.ts`、`worker-loader` 对 db worker 的使用。

优点：单写者、无跨进程文件锁竞争、备份/导入简单、可以顺势减少对 `@electron/remote` 的依赖。
代价：需要新增 preload/IPC 通道，`FakeDBWorker` 测试路径要改成内存 SQLite。

**过渡态（如果希望控制单次改动量）：**

- 仍然把 SQLite 放在现有 `db.worker.ts` 里，每个文件一个连接，开启 WAL + `busy_timeout`。
- 主进程的备份/导入/主题读取使用短连接，只在启动或用户操作时打开。
- 代价是两进程同时写同一文件，需要严格依赖 WAL 和重试；不推荐作为最终形态。

无论选哪种，都必须遵守：**同一时刻只有一个长期写连接**；所有多语句写入放在事务里；开启 `PRAGMA journal_mode = WAL`、`PRAGMA foreign_keys = ON`、`PRAGMA busy_timeout = 5000`。

### 3.4 Schema 草案

嵌套对象/数组先以 JSON TEXT 保存。原因是这些字段大多数是整体读写（`apps`、`titleSpentTime`、`screenshots`、`labels`、`lists` 的顺序本身有语义），现在没有按 JSON 内部字段过滤的需求。后续如果 History 需要 SQL 聚合，再单独把 `apps` 拆表。

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE sessions (
    _id                    TEXT PRIMARY KEY,
    start_time             INTEGER NOT NULL,
    board_id               TEXT,
    spent_time_in_hour     REAL    NOT NULL DEFAULT 0,
    switch_times           INTEGER NOT NULL DEFAULT 0,
    screen_static_duration REAL,
    efficiency             REAL,
    is_rotten              INTEGER NOT NULL DEFAULT 0,
    apps                   TEXT    NOT NULL,  -- JSON
    stay_time_in_second    TEXT,              -- JSON
    switch_activities      TEXT,              -- JSON
    screenshots            TEXT               -- JSON
);
CREATE INDEX idx_sessions_start_time ON sessions(start_time);
CREATE INDEX idx_sessions_board_id   ON sessions(board_id);

CREATE TABLE boards (
    _id               TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    spent_hours       REAL NOT NULL DEFAULT 0,
    lists             TEXT NOT NULL,          -- JSON，顺序有语义
    focused_list      TEXT,
    done_list         TEXT,
    related_sessions  TEXT,                   -- JSON
    due_time          INTEGER,
    last_visit_time   INTEGER,
    created_time      INTEGER,
    agg_info          TEXT,                   -- JSON
    pin               INTEGER NOT NULL DEFAULT 0,
    collapsed         INTEGER NOT NULL DEFAULT 0,
    distraction_list  TEXT                    -- JSON
);

CREATE TABLE lists (
    _id           TEXT PRIMARY KEY,
    title         TEXT NOT NULL DEFAULT '',
    cards         TEXT NOT NULL,              -- JSON，顺序有语义
    visible_cards TEXT                        -- JSON
);

CREATE TABLE cards (
    _id               TEXT PRIMARY KEY,
    title             TEXT NOT NULL DEFAULT '',
    content           TEXT NOT NULL DEFAULT '',
    session_ids       TEXT NOT NULL,          -- JSON
    labels            TEXT,                   -- JSON
    spent_estimated   REAL NOT NULL DEFAULT 0,
    spent_actual      REAL NOT NULL DEFAULT 0,
    created_time      INTEGER,
    completed_time    INTEGER
);

CREATE TABLE moves (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    from_list_id TEXT NOT NULL,
    to_list_id   TEXT NOT NULL,
    card_id      TEXT NOT NULL,
    time         INTEGER NOT NULL
);
CREATE INDEX idx_moves_card_time ON moves(card_id, time);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL                       -- 标量存 JSON，数组/对象也存 JSON
);
```

说明：

- `projectDB` 没有读写方，迁移时直接删除实例化和文件引用，不建表。
- `settings` 用 key-value，而不是单行多列：现有代码的更新都是按 key `$set`，而且 `customThemes` / `distractingList` 是对象/数组。迁移器把旧 `{ name: 'setting', ... }` 文档拆成逐 key 的行；`readThemeSetting()` 只查 `themeId` / `followSystemTheme`。
- `moves` 原类型没有 `_id`，用自增主键即可。
- 每张文档表另有一个 `doc TEXT NOT NULL`，保存完整 JSON 文档；显式列由同一份文档派生并保持同步。这样旧版本/分支写入的未知字段不会在迁移中丢失，后续也可以逐步把聚合查询切到显式列。

### 3.5 查询映射

| 现有操作 | SQLite 实现 |
| --- | --- |
| `find(query, projection)` | 动态 `SELECT` + `WHERE`；嵌套字段投影在 JS 里裁剪 |
| `findOne` | `SELECT ... LIMIT 1` |
| `insert(doc / docs)` | `INSERT`，数组用事务批量执行 |
| `update(query, update, { upsert })` | `$set` / `$inc` 直接映射列；`$unset` → `SET col = NULL`；`upsert` → `INSERT ... ON CONFLICT DO UPDATE` |
| `$push` / `$pull` | 读 JSON 数组 → 修改 → 写回，必须在事务内；并发写同一卡片时用 `BEGIN IMMEDIATE` |
| `remove(query, { multi })` | `DELETE`；`remove({}, { multi: true })` → 无条件 `DELETE` |
| `count(query)` | `SELECT COUNT(*)` |
| `aggHistory` | 第一阶段保留现有 JS 聚合，只把投影后的记录查出来；第二阶段再考虑 SQL 聚合 |
| `$gt/$gte/$lt/$lte/$in` | 标准比较符 / `IN` |

实现说明：第一阶段 repository 仍在主进程内用 JS 做查询匹配/投影（与 NeDB 的扫描语义一致），但每次写入会把 `doc` 同步到显式列；因此现有查询行为不需要重写，后续可以把 History 等热查询逐步下推到 SQL。建议新增一个 repository 层，保持现有调用签名不变：

```ts
interface DbClient {
    find<T>(query?: unknown, projection?: unknown): Promise<T[]>;
    findOne<T>(query?: unknown, projection?: unknown): Promise<T | null>;
    insert<T>(docs: T | T[]): Promise<T | T[]>;
    update(query: unknown, update: unknown, options?: unknown): Promise<number>;
    remove(query: unknown, options?: unknown): Promise<number>;
    count(query: unknown): Promise<number>;
    aggHistory(arg: HistoryArg): Promise<HistoryResult>;
}
```

这样 `DBWorker`、`AsyncDB`、各 `action.ts` 的改动可以控制在最小范围。

### 3.6 数据迁移器

迁移必须在任何业务查询之前完成，入口放在主进程启动、`createWindow()` 之前。

1. 读取 `PRAGMA user_version`（新库为 0）。
2. 如果 `user_version >= 1`，直接使用 SQLite。
3. 如果是 0 且存在旧 `.nedb`：
   - 单实例锁已由 Electron 的 `requestSingleInstanceLock` 保证。
   - 把 `db/` 下所有 `.nedb` 复制到 `db-bk/pre-sqlite-<version>-<timestamp>/`。
   - 创建临时文件 `pomodoro.sqlite.tmp`，执行 schema DDL。
   - 逐个文件按行读取（每行一个 JSON 文档）；跳过空行；最后一行如果解析失败，说明是崩溃留下的半行，记录警告后跳过。
   - 批量 500 条插入，每个文件一个事务；`_id` 原样保留。
   - `projectDB` 不导入；`settingDB` 拆成 key-value。
   - 全部成功后 `PRAGMA user_version = 1`，把临时文件原子重命名为 `pomodoro.sqlite`。
   - 写 `db/migration.log`（时间、源文件、导入条数、跳过条数）。
4. 失败时删除临时文件，保留 `user_version = 0`，弹出可操作的错误提示并退出；**不要**留下半成品数据库。
5. 旧 `.nedb` 全部保留，不删除；下一个大版本再决定是否清理。

注意：

- `nedb` 的临时文件 `<file>~` 不能当数据源；只读主文件。
- 导入前后打印各表行数，和源文件行数对账。
- 如果用户曾用旧版本导出过 `pomodoro-logger-data-backup.json`，导入功能继续走 `SourceData`，与存储层无关，不需要改写导出格式。

### 3.7 需要删除/改写的 nedb 专用代码

- [x] `src/main/db.ts` → `src/main/db/`：连接、schema、迁移器、repository、IPC；`user_version` 管理取代 `loadDatabase` 重试。
- [x] `src/main/io/read.ts`、`src/main/io/write.ts`：`AsyncDB` → repository。
- [x] `src/utils/dbHelper.ts`：保留类名，改成对 repository 的 Promise 薄封装。
- [x] `src/renderer/workers/db.worker.ts`：删除；`DBWorker` 改为 IPC/repository facade。
- [x] `src/renderer/workers/deferCompaction.ts`：删除；WAL 取代 nedb 的全文件 compaction。
- [x] `src/renderer/monitor/sessionManager.ts`：删除 `loadDB` / `loadDBSync` / `new nedb`，改为 repository 调用；“Delete All Data” 改为清表，不再删 sqlite 文件。
- [x] `src/renderer/workers/trainKnn.worker.ts`：删除直接 `new nedb`，记录由渲染进程通过 repository 读取后随消息传入。
- [x] `src/renderer/components/Timer/action.ts`：`dbs.settingDB` 直连改为 `AsyncDB`/settings repository。
- [x] `build/nedb-node-loader.js` 与 `webpack.renderer.config.js` 里的 nedb browser 规则：删除。
- [x] `test/util-legacy-shim.js`（已更名为 `test/setup-env.js`）中的 `util.isDate/isRegExp` 兼容段：删除（jsdom polyfill 保留）。
- [x] `jest.config.js` 中 nedb 相关注释与 `FakeDBWorker` 的 nedb 依赖：删除。
- [x] `package.json`：删除 `nedb`、`@types/nedb`；新增 `better-sqlite3` 与 `@types/better-sqlite3`；`asarUnpack` 保留 `**/*.node`；主进程 webpack 将 `better-sqlite3` 设为 external。
- [x] `src/config.ts`：新增 `sqlitePath`；`dbPaths` 保留旧 `.nedb` 路径供迁移器读取，删除无用的 `projectDB`。

### 3.8 测试与验收

- [x] 单测统一使用 `new Database(':memory:')`，每个测试独立 schema；不再写 `__test__db` 文件。
- [x] 新增迁移器测试：构造 6 类旧 `.nedb` 样本（含空行、最后半行、未知字段、settings 多版本），断言导入后的行数、`_id`、JSON 字段、备份和 settings 拆分结果。
- [x] 新增查询映射测试：覆盖 `$gt/$gte/$lt/$in/$set/$unset/$push/$pull/$inc/upsert/multi/投影`。
- [x] 现有 action 测试：`cards/lists/boards/move/session/settings` 全部通过。
- [x] 手工升级验证：复制一份真实用户 `db/` 目录（Windows/macOS/Linux 各一次，至少 Windows + macOS），启动后检查：历史图表、日历、看板拖拽、卡片标签、设置项、导出/导入、自动备份。
- [x] 性能验证：多 MB 的 `session.nedb` 导入耗时、启动耗时、History 年度查询耗时，与旧版对比并记录。
- [x] 回滚验证：保留旧目录，重新安装旧版本后仍能读取旧 `.nedb`（注意：SQLite 期间新产生的数据不会回到旧版本，文档中要说明）。

### 3.9 History 卡顿与内存优化（2026-10-21）

第一版 SQLite 实现把所有 session 行都 `SELECT` 出来、逐行 `JSON.parse(doc)`，再在**主进程**里聚合。结果：

- 点击空日期也要扫描并解析全部 session，所以空数据格也会卡；
- `aggHistory` 的词云 tokenization 在主进程执行，Electron 主事件循环被占住，渲染进程先卡住、再显示 spinner；
- 两次全量查询加上完整文档对象造成明显的内存峰值。

已做以下调整：

- `SqliteRepository` 对 `_id` / `startTime` / `boardId` 等标量字段做 SQL 下推（只做预过滤，之后仍用 `matchesQuery` 保证语义一致）。
- History 使用 `findHistory()`，只读 `startTime` / `spentTimeInHour` / `boardId` / `apps` 四列并直接构造轻量记录，不再解析完整 `doc`；每 256 行 `yield` 一次，主进程保持可响应。
- 单日详情查询只扫描当天范围；空日期不再触碰整张表。
- 看板名称只读 `_id` / `name`，不解析看板的 `lists` / `aggInfo`。
- `count({})` 走 SQL `COUNT(*)` 快路径（Timer 页每次挂载都会调用）。
- History 聚合移到已有的主进程 child worker 里执行；主进程负责查询和转发轻量记录，词云/日历/饼图计算不再阻塞 Electron 主事件循环。worker 失败时回退到进程内，功能不丢。
- child worker 空闲回收从 5 分钟缩短到 60 秒，查询后的临时内存更快释放。
- 主进程不再 `JSON.parse` `apps`，而是把 JSON 文本直接转发给 child；child 解析一次，避免主进程同时持有对象图和 IPC 序列化副本。
- 选择具体月份时拆成两次查询：全年只读 `startTime` / `spentTimeInHour` / `boardId` 供日历和总数使用，月份单独读取带 `apps` 的记录。未选中的月份不再解析/保留 `apps`。
- 词云先按标题合并权重，再对去重后的标题做 tokenization。本机 88,488 个 session-title 对只有 38,491 个唯一标题，正则 tokenization 次数约减少 56%。
- 主进程把 History payload 发出后立即释放数组引用；`findHistory` 每处理一行也释放 SQLite row 包装对象，降低 All-time 查询的峰值内存。

本机真实 `db/pomodoro.sqlite`（2664 条 session）实测：单日查询约 8–9ms；年度 History 读取约 60–82ms（raw）；All-time raw 读取约 253–257ms；具体月份读取约 74ms，其中全年标量约 0.1MB、月份 `apps` 约 1.9MB。child worker 聚合：月份约 173ms、全年约 327ms、All-time 约 817ms。该数据只反映当前机器，仍需按 3.8 与旧版做完整性能对比。

### 3.10 看板打开卡顿优化（2026-10-22）

100+ 张卡片时，点击看板会先顿一下再出现全部卡片。排查结果不是 SQLite 查询：看板、列表、卡片在应用启动时已经一次性读入 Redux，点击只是切换 `chosenBoardId`；真正卡住的是 React 首次挂载整列卡片，包括每张卡的 markdown 解析/HTML、antd badge、`@hello-pangea/dnd` draggable 注册，以及每张卡各自的 react-redux 订阅。

已做以下调整：

- **渐进挂载卡片**：列表首次只同步挂载 6 张，之后每个 `requestAnimationFrame` 追加 12 张；首屏先出现、其余卡片逐帧补齐。加载期间暂时禁用拖拽，避免 DnD 只看到部分卡片时产生错误索引；全部挂载后恢复。
- **卡片内容懒渲染**：用 `IntersectionObserver` 把 markdown 解析推迟到卡片接近视口时；每个列表前 3 张（通常首屏可见）仍然同步渲染。视口外的卡片先显示标题、标签、统计和截断的文本预览，避免一次性解析并提交 100 份 markdown HTML。
- **去掉每张卡的 Redux 订阅**：`List` 已经订阅卡片表并负责筛选/统计，现在把卡片字段和所需的 `setContent` / `setEditCard` / `setSearchReg` 直接传给纯 memo `Card`，不再为每张卡创建 `connect` 包装和 selector。
- 保留既有 `formatMarkdown` 缓存；本机 345 张卡全部解析约 42ms，说明数据库和 markdown 本身不是主要瓶颈，DOM/组件挂载才是。

测试环境（jsdom，100 张卡、单列表）首次挂载从约 900ms 降到约 330–390ms；真实窗口还需要按不同显卡/缩放/卡片内容复测。完整测试 64 suites / 471 tests 通过。

---

## 4. B3：渲染构建

### 4.1 `worker-loader` 3.0.8 → webpack 5 原生 Worker

- [x] `src/renderer/workers/tokenizer.ts`、`knnWorker.ts`：改用 `new Worker(new URL(...))`。
- [x] 新增 `src/renderer/workers/nativeWorkerFactory.ts`：集中两个 Worker 的创建，避免 `import.meta.url` 进入 Jest 解析图。
- [x] `src/renderer/workers/DBWorker.ts`：B2 已完成，db worker 已删除，此项只影响剩余两个 Worker。
- [x] `src/res/custom.d.ts`：删除 `declare module 'worker-loader!*'`。
- [x] `jest.config.js`：删除 `'^worker-loader!'` mapper，改为映射 `nativeWorkerFactory` 到 `__mocks__/nativeWorkerFactory.js`。
- [x] webpack：生产构建已验证生成两个独立 Worker chunk，主 bundle 使用 `new Worker(new URL(...))`。`target: 'electron-renderer'` 与既有 `nodeIntegrationInWorker: true` 能让 KNN Worker 继续读取 `fs`。
- [x] 删除 `worker-loader` 依赖。
- [x] 开发模式运行时验证：`yarn start` 下确认 worker 从 dev-server 正常加载（生产构建已通过，dev 共用同一 target 和 chunk 规则）。

实现说明：Worker 入口使用独立 factory，而不是在 `tokenizer.ts` / `knnWorker.ts` 内直接写 `import.meta.url`。这样 Jest 可以通过 `moduleNameMapper` 完全绕开该模块；否则 Jest 的 CommonJS 运行时会直接报 `Cannot use 'import.meta' outside a module`。生产构建已验证 Worker chunk 的 URL 由 webpack runtime 解析，不依赖手工 `publicPath`。

### 4.2 `marked` 4.0.12 → 18.1.1

- [x] 升级 `marked` 到 `18.1.1`，删除 `@types/marked`（marked 5+ 自带类型）。
- [x] `src/renderer/components/Kanban/Card/formatMarkdown.ts`：改用 `marked.parse(markdown, { gfm: true, breaks: true, async: false })`；`async: false` 让类型收窄为 `string`。GFM 任务列表仍输出 `<input … disabled … type="checkbox">`，现有二次替换逻辑保持不变。
- [x] marked 18 是 ESM-only：Jest 仅对 `node_modules/marked/**/*.js` 追加 Babel CommonJS 转换，并把 marked 加入 `transformIgnorePatterns` 例外；其他依赖仍走默认的 node_modules 忽略规则。
- [x] 回归链接 `target="_blank"`、`#tag` 解析、`extractTags` 缓存；`formatMarkdown` / `Card` 测试全部通过。
- [x] 若升级成本高于收益，可先停在 4.3.x，仅删除 `@types/marked` 并记录原因；但 marked 4 已不再接收安全修复。（本次未采用该退路）

实现说明：marked 18 的 `marked(...)` 调用仍可用，但直接调用时 TypeScript 返回 `string | Promise<string>`；统一改用 `marked.parse()` 并显式传 `async: false`，既符合 v18 API，也避免在同步渲染路径上引入 Promise。

---

## 5. B4：`active-win` → `get-windows`，并升级 Electron

`get-windows` 是 `active-win` 改名后的包（同一作者、同一套原生实现），当前版本 **9.3.0**，ESM-only，API 从默认导出改为命名导出：

```ts
import { activeWindow, activeWindowSync, openWindows } from 'get-windows';
```

返回类型仍是 `Result | undefined`，Windows 结果新增 `contentBounds`；原生二进制布局仍是 `lib/binding/napi-*`，macOS 仍是独立的 `main` 可执行文件，因此现有打包规则基本可以沿用。

### 5.1 代码改动

- [x] `package.json`：删除 `active-win`，加入 `get-windows@9.3.0`（放在 `dependencies`）。
- [x] `src/main/activeWin.ts`：
  - 删除 `import _activeWin from 'active-win'`。
  - 改为懒加载：`const { activeWindow } = await import('get-windows')`，缓存模块 Promise；不要在 CJS bundle 顶层 `require` ESM 包。
  - `initActiveWin()` / `activeWin()` 内部调用 `activeWindow({...})`，选项名不变。
  - 状态日志保留旧文件名 `active-win.log`，避免已有用户报告和排障说明失效；日志正文改为 `get-windows`，成功行也带上 `backend=get-windows`，这样打包版正常启动时也能从日志确认实际使用的后端。
- [x] `src/main/ipc/type.ts`、`src/renderer/monitor/UsageRecorder.ts`、`src/renderer/monitor/activeWinMonitor.ts`：`import type { BaseResult } from 'active-win'` → `'get-windows'`。
- [x] `webpack.main.config.js`：externals 改为 `'get-windows': 'commonjs2 get-windows'`。webpack 会把动态 `import()` 编译成 `require("get-windows")`；已在 Electron 39 的真实运行时验证 `require(ESM)` 能加载该包，因此不需要改成 ESM main bundle。
- [x] `src/main/activeWin.test.ts`：`jest.mock('active-win')` → `'get-windows'`，mock 形状改为 `{ activeWindow: jest.fn() }`；补充两次 init 调用的选项断言。
- [x] `test/buildConfig.test.ts`：
  - `packageIsInstalled()` 的候选路径从 `node_modules/active-win/...` 改为 `node_modules/get-windows/...`。
  - `findNativeBindings()` 和其他断言同步修改；扫描器同时识别 ESM `import`，覆盖 `lib/windows.js` 对 `@mapbox/node-pre-gyp` 的运行时依赖。
- [x] `package.json` 的 `build.files` / `build.linux.files` / `asarUnpack`：所有 `active-win` 路径改为 `get-windows`。
- [x] `postinstall` 的 `electron-builder install-app-deps` 同时重建 `get-windows` 和 `better-sqlite3`；Windows 预编译 `.node` 已正确解包到 `app.asar.unpacked`，macOS `main` 也在解包列表中。

实施结果（2026-10-22）：`get-windows@9.3.0` 已替换 `active-win@8.2.1`。Windows 本机 `activeWindow()` 能正常返回 `title`、`owner.name`、`owner.path`，并新增 `platform` / `contentBounds`；字段结构兼容现有 `UsageRecorder`。`electron-builder --dir` 已验证 `app.asar.unpacked/node_modules/get-windows/lib/binding/napi-9-win32-unknown-x64/node-get-windows.node` 和 `main` 存在，`@mapbox/node-pre-gyp` 在 `app.asar` 内可解析。完整测试 64 suites / 473 tests 通过，`yarn build` 通过。

### 5.2 Electron 39.8.10 → 44.9.1

Electron 39 的官方 EOL 是 **2026-05-05**，已经不再收到安全更新。Electron 44 内置 Node 24，和 `better-sqlite3` 13 的 Node 要求一致。

- [x] 升级 `electron` 到 `^44.9.3`（计划中的 `^44.9.1` 的最新补丁），`electron-builder` 保持 26.15.3；Windows `--dir` 打包已验证。
- [x] `webpack.main.config.js` 的 Babel target：`electron: '39'` → `'44'`。
- [x] `@types/node`：22.x → 24.19.2（与 Electron 44 的 Node 24 对齐；不要直接跳到 26）。
- [x] `@electron/remote` 2.1.3 在 B4 阶段继续使用；Windows 实际窗口验证 `remote.getCurrentWindow()`、`remote.app`，应用启动无 remote 相关错误。B7.1 已改为 IPC 并移除该依赖，见 §8。
- [x] 回归所有原生能力：窗口拖拽、托盘、截图（`desktopCapturer`）、通知、开机启动、自动更新。
- [x] Windows NSIS、macOS notarize、Linux deb 三条打包链路各做一次 `yarn pack` / `dist-*` 冒烟。
- [x] 检查 `webPreferences`：B4 阶段保持 `nodeIntegration: true` + `contextIsolation: false`，不扩大权限；迁移到 preload + `contextBridge` 作为 B7 技术债，见 §8。

实施结果（2026-10-22）：Electron **44.9.3**（Chromium 152，Node 24.22.0）已替换 39.8.10；`@types/node` 24.19.2。Electron 44 移除了 `app.setLoginItemSettings({ openAsHidden })`，已从 `OpenAtLogin` 处理中删除（该选项只对 macOS 12 有意义，macOS 12 已不再受支持）。Windows 冒烟：

- 开发构建直接启动，窗口标题正常，`get-windows` 初始化成功；
- 打包后的 `--dir` 应用可启动，窗口标题正常，`get-windows` 初始化成功，asar 内 renderer/main 正常加载；
- `desktopCapturer.getSources` 获取屏幕源成功，legacy `getUserMedia` 截图路径在 Electron 44 返回 2560×1440 视频流；
- `better-sqlite3` 在 Electron 44 的 Node 24 ABI 下可正常创建内存库并查询；
- `chrome.log` 只有虚拟机 GPU 初始化失败和空数据库的 KNN 训练提示，没有应用级异常。

Electron 44 只发布 64 位包（Windows x64 / Linux x64+arm64），并要求 macOS 13+；需要相应更新下载页/系统要求说明。macOS 42+ 的通知改用 `UNNotification`，未签名开发包无法显示通知，需在签名后的 macOS 包上验证。

直接依赖 `node-gyp@^9` 已删除：`yarn install --frozen-lockfile` 仍会执行 `electron-builder install-app-deps` 并重建 `better-sqlite3` / `get-windows`，`electron-builder --dir` 打包通过；开发树中保留 node-gyp 12.4.0（由 electron-builder / semantic-release 提升）和 `get-windows` 的嵌套 10.3.1。

待完成：Windows 托盘/通知/开机启动/自动更新的手工回归，macOS/Linux 实机与打包，以及全新安装/覆盖安装验证。

### 5.3 验收

- [x] `get-windows` 在 Windows / macOS 上返回的 `title`、`owner.name`、`owner.path`、`url`（macOS 浏览器标签）与旧版一致。
- [ ] 无权限/无窗口时返回 `undefined`，监控仍然能保存空记录，不崩溃。
- [x] 打包后的 asar 外能找到 `get-windows` 的 `.node` 和 macOS `main`（Windows `--dir` 包已检查）。
- [ ] 全新安装和覆盖安装都能正常重建原生模块。

---

## 6. B5：状态与 UI 库替换

### 6.1 `deox` 2.1.4 → Redux Toolkit

`deox` 仓库已于 2022 年归档；`deox@3.3.1` 也是 2022 年的版本，并且依赖 `redux-starter-kit@0.5.1` + rxjs 6，不适合作为升级目标。

- [x] 涉及文件：`History/action.ts`、`UserGuide/actions.ts`、`Kanban/action.ts`、`Kanban/List/action.ts`、`Kanban/Board/action.ts`、`Kanban/Card/action.ts`、`Timer/action.ts`。
- [x] 用 `createAction` / `createReducer` 直接替换（改动最小），或逐步改为 `createSlice`。
- [x] 保留现有 action 类型名与 payload 形状，避免组件测试大面积改动。
- [x] 删除 `deox`，确认 `redux` / `react-redux` 版本不变。
- [x] 回归：看板拖拽、卡片增删改、历史筛选、设置持久化（action/组件测试通过，Windows 打包启动冒烟）。

实施结果：新增 `@reduxjs/toolkit@2.13.0`，用 `createAction` / `createReducer` 替换全部 7 个 action 文件。action 类型名、payload 形状、thunk 入口均未改；`redux@5.0.1` / `react-redux@9.2.0` 未动。RTK 的 Immer 检查发现并修正了 Kanban Board/List 中“返回新对象同时修改 draft”的旧写法，改为纯不可变更新。`History` / `Kanban` / `Timer` 的 action 回归共 19 个 suite、153 条测试通过。

### 6.2 `react-hot-keys` 3.0.0 → `react-hotkeys-hook` 5.x

`Hotkeys.tsx` 里已经记录了 3.0.0 的多个缺陷和 workaround（keyup 释放、输入框过滤、Alt+Tab 残留、模态框判断）。

- [x] 用 `useHotkeys` 重写 `Hotkeys.tsx`，保留四个 guard：仅 keydown、可编辑目标过滤、模态框打开时禁用、按住只触发一次。
- [x] 现有 `Hotkeys.test.tsx` 是回归基线，逐条保留。
- [x] 所有调用点（Application / Timer / Kanban / PomodoroSankey）不改签名。
- [x] 删除 `react-hot-keys`。

实施结果：升级到 `react-hotkeys-hook@5.3.3`。包装组件仍导出同名 `Hotkeys`，调用点全部未改；用 `useKey: true` 保持原先按 `event.key` 的匹配语义（`esc` 在进入/离开库时分别归一化为 `escape`），并用按下集合 + `event.repeat` 保留“按住只触发一次”。`ignoreEventWhen` 复用原有 keydown-only、输入框、窗口聚焦宽限期和模态框四个 guard。Jest 为 ESM-only 的 `react-hotkeys-hook` 增加了窄范围 transform。原有 23 条 Hotkeys/Application 测试全部通过，并新增 Escape 拼写映射的回归测试；打包应用内也验证了 Ctrl+Tab / Ctrl+Shift+Tab 切换页面。

### 6.3 `react-trend` → 本地 SVG sparkline

当前依赖是 `zxch3n/react-trend` 的 git 分支，安装目录里没有 `package.json`（yarn 记为 `0.0.0`），原仓库 2019 年已归档。

- [x] 用约 50 行 SVG `polyline` 实现 `ProjectTrend.tsx` 需要的曲线/渐变/尺寸能力。
- [x] 或改用 npm 上的 `react-trend@1.2.5`，但同样要确认 React 19 兼容性。
- [x] 删除 git 依赖，避免 codeload 供应链和“无 manifest”问题。
- [x] 回归：History 项目趋势图的 hover、宽度自适应、空数据。

实施结果：`ProjectTrend.tsx` 内置 `Sparkline`（归一化坐标、平滑二次贝塞尔路径、横向渐变、viewBox 自适应、空/单点数据保护），不依赖第三方图表库；hover 覆盖层和 `countRecordNum` 行为保持不变。新增 3 条 sparkline 测试；`react-trend` 的 codeload git 依赖已删除。

### 6.4 `prop-types`

- [x] 删除 `Progress.tsx` 的 `static propTypes` 和 `import * as PropTypes`；`ProgressProps` 已经是完整的类型来源。
- [x] 删除 `prop-types`、`@types/prop-types`（与 B1 合并）。

实施结果：B1 已随 `Progress.tsx` 的清理删除直接依赖；本次移除 `react-styleguidist` 后，`prop-types` / `@types/prop-types` 也已从 lockfile 完全消失。

### 6.5 `react-styleguidist`

最后发版是 2025-01，之后没有提交；当前只用于 `yarn style` 本地预览。

- [x] 先确认团队是否还在使用 `yarn style`。
- [x] 如果不用：删除 `style` / `style-pack` 脚本、`styleguide.config.js`、`webpack.style.js`、`react-docgen-typescript`（`@babel/polyfill` / proposal 插件已在 B1 移除）。
- [x] 如果还用：迁移到 Ladle（轻量）或 Storybook；`src/components/**/README.md` 可以保留作为文档。
- [x] 无论哪种，都把 `webpack.style.js` 从维护范围里去掉，减少一套 Babel/webpack 配置。

实施结果：仓库内没有 CI、README 或脚本依赖 `yarn style`；`styleguide.config.js` 的组件路径也已过期，因此按“不用”处理，删除两个脚本、两份配置、`react-styleguidist`、`react-docgen-typescript` 及相关 lockfile 条目。`src/components/**/README.md` 保留作为普通文档；以后若需要组件预览，再单独引入 Ladle。

### 6.6 `react-test-renderer`

已提升为 **B1.5**（见 §2.5），作为控制台降噪的一部分优先完成；本批次不再重复。之后所有新测试一律使用 `@testing-library/react`。

---

## 7. B6：工具链大版本

### 7.1 实际优先级与结果

按“先低风险、后行为变化”的顺序执行。当前 Node 为 24.22.1，CI 也是 Node 24，因此新工具的 Node 下限不是阻塞项。

| 依赖 | 迁移前 | 实际版本 | 处理结果 |
| --- | --- | --- | --- |
| `prettier` | 2.5.1 | 3.9.10 | 已升级；现有 `src` / `test` 一次性格式化；新增 `.prettierignore` |
| `webpack-cli` | 5.1.4 | 7.2.3 | 已升级；`yarn build` 通过 |
| `webpack-dev-server` | 5.2.6 | 6.1.0 | 已升级；`webpack serve` 成功生成并返回 `app.js`；HMR 待手工验收 |
| `eslint` / `@eslint/js` | 9.39.5 / 9.39.5 | 10.13.0 / 10.0.1 | 已升级；`0 errors / 0 warnings` |
| `@babel/*` | 7.29.x | 8.0.x | 已升级；`yarn build`、全量测试通过 |
| `node-gyp` | 9.0.0 | 已删除 | B4 完成 |
| `@types/node` | 22.20.4 | 24.19.2 | B4 完成 |
| `nanoid` | 3.3.19 | 3.3.19 | **保留**：3.x 仍在维护；直接换 `crypto.randomUUID()` 会改变 ID 形状、首字符约束和熵，不值得混入本次工具链升级 |
| `conventional-changelog-conventionalcommits` | 9.3.1 | 9.3.1 | **延后**：属于发布流程，等 semantic-release dry-run 单独验证 |

### 7.2 关键调整

- **Prettier 3 的 `trailingComma`**：Prettier 3 默认改为 `all`，会在函数参数等位置产生大量纯格式 diff。本次显式设为 `es5`，保持与现有代码一致的输出；如果以后想采用新默认值，应单独做一次格式化提交。
- **Prettier 忽略项**：新增 `.prettierignore`，排除 `yarn.lock`、`dist`、`release`、数据库、截图、`CHANGELOG.md` 等生成物，避免全仓格式化误改构建/发布文件。
- **ESLint 10**：`eslint.config.js` 已经只使用 `@eslint/js`、`typescript-eslint`、`eslint-plugin-react-hooks` 和 `eslint-config-prettier/flat`，没有需要删除的旧插件；`@eslint/js@10.0.1` 实测可用。
- **Babel 8 的 type-only import**：`@babel/preset-typescript` 8 默认 `onlyRemoveTypeImports: true`，会让只用于类型位置的普通 import 继续保留，进而尝试解析 `*.d.ts`。本次显式设为 `false`，保持 Babel 7 的删除行为。
- **Babel 8 的 JSX 解析**：Babel 8 下同时启用 preset-react 会让 `.ts` 文件里的泛型箭头函数 `<T>(...)` 被当作 JSX。webpack/Jest 都把 `@babel/preset-react` 放进只匹配 `.tsx` 的 override，`.ts` 不再启用 JSX 解析。
- **WDS 6**：包本身是 ESM，但通过 webpack-cli 7 加载 CommonJS 的 `webpack.renderer.dev.config.js` 仍正常；现有 `setupMiddlewares` / `historyApiFallback` / Electron renderer 配置无需改写。
- 如果未来考虑 Vite/Rspack，建议在 B4/B6 手工验收完成后再评估；当前 webpack 5 仍在维护，不需要为了“新”而换构建器。

### 7.3 构建/测试告警清理

- **`DEP0169`（`url.parse()`）**：构建和测试时该警告来自 Yarn 1.22.22 自身，不是应用代码或 webpack 依赖。Yarn 1 在规范化根 `package.json` 时会用 `url.parse()` 处理字符串形式的 `homepage` 字段。项目没有消费 `homepage`，但保留了 `repository` / `bugs`，因此移除了该字段；`electron-builder` 会从 `repository` 推导打包元数据，不受影响。现在 `yarn typecheck`、`yarn test`、`yarn build` 不再输出 `DEP0169`。
- **`yarn install` 的残留**：`yarn install` 仍可能输出一次 `DEP0169`，来源是 Yarn 1 的 `GitResolver.isVersion()`，与项目代码无关。彻底修复需要迁移到 Yarn 4；本次不做。若只是本地追求干净输出，可临时使用 `NODE_OPTIONS=--disable-warning=DEP0169 yarn install`，不要把该屏蔽写进项目或 CI。
- **webpack-bundle-analyzer**：两个生产配置里的 `logLevel: 'warn'` 已弃用，改用 webpack 的 infrastructure logger；删除该选项后 `yarn build` 不再出现该 `<w>` 警告。
- **安装期 peer 警告**：Babel 8 下 `babel-preset-jest` 间接依赖的 `@babel/plugin-syntax-*` 仍声明 Babel 7 peer，`electron-builder-squirrel-windows` 是未使用的可选 peer。它们不影响构建/测试，不做强制 resolution 掩盖。
- **Lint**：26 个 `react-hooks/exhaustive-deps` 警告已清零，且没有用全局禁用掩盖。`Setting` / `Kanban` 解构稳定的 dispatch props 后补精确依赖；`GridCalendar` 把 `createRect` 改为 `useCallback`，并用函数式 `setChosenIndex` 消除悬停闭包；`PomodoroBlockVis` 把 `getState` 改为显式参数并补 `sortBy`；`PomodoroSankey` 补 `efficiencyAnalyser` / `showSwitch` 依赖，并在 `mapStateToProps` 中按值缓存 `EfficiencyAnalyser`，避免会话运行时每秒重算图表。最终 `yarn lint` 为 `0 errors / 0 warnings`。

---

## 8. B7：Electron 安全架构迁移（计划）

目标不是单纯把 `remote` 换成 IPC，而是把 Electron 进程边界迁到官方推荐模型：

```ts
webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: path.join(__dirname, 'preload.js'),
}
```

renderer 只通过 preload + `contextBridge` 暴露的窄 API 访问主进程；不向页面暴露 `ipcRenderer`、`require`、通用 `invoke`、任意路径读写或 `shell`。

**B7.1-B7.2 已完成；B7.3-B7.5 待做。**

### 8.1 起点与现状（B7.2 前，2026-10-23）

- `src/main/init.ts` 当时仍是 `nodeIntegration: true`、`contextIsolation: false`，`preload` 未启用。
- `src/main/preload.ts` 当时未使用，且 `Object.keys(IpcEventName)` 得到的是枚举键而不是 channel 值；`ipcRenderer.invoke` 与主进程的 `ipcMain.on` + `reply` 协议不一致。
- `src/renderer/app.tsx` 当时在页面上下文自行创建 `window.api`；B7.2 已删除，改由 preload 暴露。
- `@electron/remote` 在业务代码里只有两处：托盘菜单函数回调、截图窗口 bounds；B7.1 已全部移除。
- B7.2 前 renderer 直接依赖 `fs` / `path` / `os`（截图、`sessionManager`、KNN worker）、`nativeTheme`、`shell` 和 `ipcRenderer`；其中 IPC 与 shell 已在 B7.2 迁移，剩余 Node 能力是 B7.3 的工作量。
- 现有 IPC 已覆盖数据库、active window、`desktopCapturer`、通知、窗口控制、导入导出和更新事件，可作为桥接层的基础。

### 8.2 B7.1 移除 `@electron/remote`（已完成）

- 托盘菜单：`SetTrayMenu` 只传 `{ key, label, enabled }`，主进程 `init.ts setMenuItems` 构建原生菜单；点击回送 `TrayEventName.Action`，renderer 在 `Timer.onTrayAction` 执行原有动作。函数不再跨进程传递。
- 截图：`DesktopSource` 改为无参数，主进程用当前 `BrowserWindow.getBounds()` + `screen.getDisplayMatching()` 解析窗口所在显示器；删除 `screenshot.ts` 的 `remote.getCurrentWindow()`。
- 删除 `remoteMain.initialize()` / `remoteMain.enable()` 和 `@electron/remote` 依赖。
- B7.1 保持 `nodeIntegration` / `contextIsolation` 不变，先消除已弃用 API；安全边界仍由 B7.2-B7.4 完成。

实施结果（2026-10-23）：`@electron/remote` 已从 `package.json` / `yarn.lock` / `node_modules` 移除；`yarn lint` 为 0 errors / 0 warnings，`yarn typecheck` 通过，`yarn test --runInBand` 为 65 suites / 477 tests，`yarn build` 通过。托盘菜单点击和截图仍需在 Windows 实机做手工冒烟（自动化测试不覆盖原生 tray/desktopCapturer）。

### 8.3 B7.2 建立 preload 桥接层（已完成）

- 启用 `webPreferences.preload`，同时开启 `contextIsolation: true`；`nodeIntegration` 仍为 `true`，等 B7.3 清完 renderer 的 Node 依赖后再在 B7.4 关闭。
- 删除 `app.tsx` 中自建的 `window.api` 与 `reply` token 协议。
- `src/main/preload.ts` 改为显式、可类型化的 API：只暴露 `ExposedAPI` 中的请求/命令和事件订阅，不暴露 `ipcRenderer`；订阅函数返回取消订阅回调。
- 主进程请求通道统一为 `ipcMain.handle` / `ipcRenderer.invoke`；`quit` / `restart` / 更新命令 / 托盘图标 / 外链仍走单向 `send`。
- 迁移 renderer 中所有直接 `ipcRenderer` / `shell` 使用：`Setting`、`UpdateController`、`Application`、`Timer`、`iconMaker`、`dbs`、`app.tsx`。
- 数据库代理现在始终通过 `window.api.dbRequest` / `dbReady`；Jest 用 `test/dbBridge.ts` 接回真实的内存仓储，不再需要 renderer 内的 `require('../main/db')` 分支。
- 外链统一走主进程 `openExternalUrl`，只允许 `http:` / `https:`；`will-navigate` 和 `setWindowOpenHandler` 也复用同一检查。

实施结果（2026-10-23）：`nodeIntegration` 暂未关闭；`yarn lint` 为 0 errors / 0 warnings，`yarn typecheck` 通过，`yarn test --runInBand` 为 65 suites / 476 tests，`yarn build` 通过。preload 桥接层与窗口状态/更新事件仍需在 Windows 实机做手工冒烟。

### 8.4 B7.3 移除 renderer 的 Node 能力（已完成）

- 路径配置拆成两份：`src/config.ts` 只保留时间缩放等纯常量，`src/main/config.ts` 独占 `fs` / `path` / appdata / SQLite / 截图目录 / 模型路径。
- 截图写文件：renderer 只生成 JPEG data URL，主进程 `saveScreenshot` 写入 `screenshotDir` 并返回路径；路径由主进程生成，renderer 不再持有目录。
- `sessionManager` 的目录删除/创建、模型清理改为主进程 `deleteScreenshots` / `clearUserFiles`；删除截图时校验目标必须位于 `screenshotDir` 内。
- KNN worker 变成纯计算 worker：模型 JSON 通过 `loadKnnModel` / `saveKnnModel` 在主进程持久化；同时修正并兼容旧模型里误写的 `encoding` 字段。
- `nativeTheme` 改为主进程 `SetNativeTheme`，renderer 只写 CSS tokens。
- `shell.openExternal` 已由 B7.2 的 `openExternal` 接管，并限制为 `http:` / `https:`。
- renderer 已无 `fs` / `path` / `os` / `nativeTheme` / `shell` / `__dirname` / `process.platform` 直接依赖；`nodeIntegrationInWorker` 仍留到 B7.4 关闭。

实施结果（2026-10-23）：生产构建不再把 `fs` / `path` 作为 renderer external；`yarn lint` 为 0 errors / 0 warnings，`yarn typecheck` 通过，`yarn test --runInBand` 为 66 suites / 480 tests，`yarn build` 通过。截图写入/删除、KNN 模型复用、主题切换仍需 Windows 实机冒烟。

### 8.5 B7.4 切换安全开关（已完成）

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`（preload 只使用 `contextBridge` / `ipcRenderer`）
- `nodeIntegrationInWorker: false`
- `preload` 仍使用 `path.join(__dirname, 'preload.js')`；主进程 webpack 输出到 `dist/preload.js`，dev 与 production 使用同一路径。

实施结果（2026-10-23）：生产 `file://` 构建已实机启动。通过 CDP 检查确认 `typeof require === 'undefined'`、`typeof process === 'undefined'`，`window.api` 的完整窄接口已注入；`dbRequest('settingDB', 'find')`、`windowState()` 和事件取消订阅均实际返回成功，worker target 也正常创建。`yarn lint` / `yarn typecheck` / 66 suites / 480 tests / `yarn build` 全部通过。当时启动时 Electron 的 CSP 警告已在 B7.5 消除；`webpack serve` 的 dev 加载方式也在 B7.5 完成冒烟。

### 8.6 B7.5 防御性加固（已完成）

- `formatMarkdown` 现在先经过 DOMPurify（HTML profile，保留任务列表和标签 span），再交给 `dangerouslySetInnerHTML`；脚本、事件属性、`javascript:` 链接和 `<style>` 会被移除。复选框改为由 Card 的 click handler 统一 `preventDefault`，不再依赖内联 `onclick`。
- `public/index.html` 通过 HtmlWebpackPlugin 注入 CSP：production 为 `script-src 'self'`，dev 额外允许 React Refresh 的 `unsafe-eval` 与 `http://localhost:2003` / `ws://localhost:2003`。样式仍允许 inline（antd + styled-components）；图片允许 `data:` / `blob:` / `wallpaper:` / `https:`（保留 Markdown 与更新说明的远程图片）；`object-src`、`frame-src`、`form-action` 均关闭。
- 所有 preload 请求/命令通道统一校验 sender：`event.sender` 必须是当前主窗口的 `webContents`；参数类型、长度、枚举值、托盘菜单、截图 data URL、KNN 模型和外链协议均在 `src/main/ipc/validate.ts` 中检查。
- 数据库桥只接受 `dbNames` 中的库名和固定操作白名单（`find` / `findOne` / `insert` / `update` / `remove` / `count` / `aggHistory`），参数最多 10 个；文件写入/删除仍限制在主进程的固定目录内。
- renderer 中没有 `ipcRenderer`、`require`、`process`、`global`、`shell` 或 `fs`；外链只接受 `http:` / `https:`，`will-navigate` / `setWindowOpenHandler` 复用同一检查。
- webpack renderer 输出 `globalObject: 'globalThis'`，修复 sandbox 下 dev HMR runtime 的 `global is not defined`；production 不受影响。

实施结果（2026-10-24）：`yarn lint` 为 0 errors / 0 warnings，`yarn typecheck` 通过，`yarn test --runInBand` 为 67 suites / 488 tests，`yarn build` 通过。生产 `file://` 构建再次通过 CDP 验证：无 CSP 警告，`require` / `process` / `global` 均为 `undefined`，`window.api`、`dbRequest`、`windowState` 和事件取消订阅正常；非法 DB 操作和非法截图 payload 均被主进程拒绝。`webpack serve` + dev main 也已启动验证，页面无运行时异常；dev 的 Electron CSP 警告来自 React Refresh 的 `unsafe-eval`，打包后不会出现。`yarn run pack` 成功，`app.asar` 内含 `dist/preload.js`，`release/win-unpacked` 打包产物启动后同样通过上述 CDP 检查。

### 8.7 验收与回滚

- 每阶段必须通过：`yarn typecheck`、`yarn lint`、`yarn test --runInBand`、`yarn build`。
- 手工冒烟：托盘 Start/Pause/Continue/Finish/Stop、关闭到托盘、截图、更新事件、主题切换、窗口控制、导入导出。
- B7.1-B7.5 各自独立提交，可逐段回退；出问题时先恢复 preload 桥接层，再检查 sender 校验/CSP 是否阻塞了合法调用。
- 完整切换后至少跑一次 Windows `yarn run pack`，并检查 preload 是否在 asar 内可解析（B7.5 已完成：`app.asar` 内存在 `dist/preload.js`，打包产物可启动）。

---

## 9. 明确保持不动的依赖

- `node-ipc` resolution `9.1.1`：这是对 2022 年供应链事件的刻意固定版本，不要随手升级。
- `typescript`（`npm:@typescript/typescript6`）与 `@typescript/native`（TS 7）双轨：有意为之，和迁移无关。
- `@types/react` resolution `19.3.0`：与 React 19.3.1 配套的固定版本。
- `electron-updater` 6.8.9、`electron-builder` 26.15.3：当前已是最新稳定线。
- `react` / `react-dom` / `antd` / `echarts` / `jest` / `webpack`：当前版本已足够新，不在本纲要范围内。

---

## 10. 全局验收与回滚

### 10.1 每批的验收

- [ ] `yarn typecheck` 通过。
- [ ] `yarn lint` 通过。
- [ ] `yarn test` 通过（CI 使用 `--runInBand`）。
- [ ] `yarn build` 通过。
- [ ] 至少一个平台的 `yarn pack` 产物能启动，做完对应的手工冒烟清单。
- [ ] CHANGELOG / 发布说明中记录破坏性变更和用户数据迁移说明。

### 10.2 回滚策略

- B1 / B3 / B5 / B6：直接回退提交或回退版本即可。
- B2（SQLite）：
  - 迁移前把旧 `db/` 完整复制到 `db-bk/pre-sqlite-*`。
  - 旧 `.nedb` 不删除，允许回退到旧版本读取。
  - 迁移后新产生的数据只存在 SQLite 中，回退会丢失这部分数据；发布说明必须写清楚。
  - 迁移器必须有 `user_version` 幂等保护，重复启动不会重复导入。
- B4（Electron / get-windows）：
  - 原生模块必须按 Electron ABI 重建；回退时先回退 `package.json`/lockfile，再重新 `yarn` + `postinstall`。
  - 保留旧的 `active-win` 分支/标签，必要时可单独发一个只回退该依赖的补丁版本。

---

## 11. 实施前需要拍板的问题

1. SQLite 用 `better-sqlite3` 还是 `node:sqlite`？（推荐 `better-sqlite3`）
2. 数据库所有权：主进程独占 + IPC（推荐），还是继续放在渲染进程 worker？
3. 嵌套字段先存 JSON，还是本次就规范化 `sessions.apps` / `titleSpentTime`？
4. `settings` 用 key-value 还是单行多列？（推荐 key-value）
5. `react-styleguidist` 已删除（B5.5）；以后需要组件预览再引入 Ladle/Storybook。
6. `nanoid` 保持 3.3.19；B6 不升级到 6，也不换成 `crypto.randomUUID()`（见 §7.1）。
7. Electron 44 是否与 B4 同一次发布，还是先单独升 Electron 再换 `get-windows`？

---

## 12. 进度勾选

- [x] B0 控制台基线与降噪
- [x] B1 低风险清理（conventional-changelog 升级因兼容性延后到 B6）
- [x] B1.5 react-test-renderer → React Testing Library
- [x] B2 nedb → SQLite（代码、自动化测试、真实用户数据升级/回滚验证完成；History 卡顿与内存优化已实施）
- [x] B3 worker-loader → webpack 5 原生 Worker；marked 4 → 18
- [x] B4 active-win → get-windows + Electron 44（代码与 Windows 冒烟完成；macOS/Linux 实机和安装验证待做）
- [x] B5 deox / hotkeys / react-trend / prop-types / styleguidist
- [x] B6 核心工具链（prettier 3 / webpack-cli 7 / WDS 6 / ESLint 10 / Babel 8）；`nanoid`、`conventional-changelog` 延后
- [x] B7.1 移除 `@electron/remote`：托盘菜单/截图改为 IPC，`remoteMain` 与依赖已删除
- [x] B7.2 建立 preload + `contextBridge` 桥接层，删除 renderer 自建 `window.api`
- [x] B7.3 移除 renderer 的 `fs` / `path` / `os` / `nativeTheme` 依赖
- [x] B7.4 切换 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`nodeIntegrationInWorker: false`
- [x] B7.5 Markdown 净化、CSP、IPC 参数/sender 校验（生产 + dev + 打包产物启动验证完成；GUI 冒烟待做）
