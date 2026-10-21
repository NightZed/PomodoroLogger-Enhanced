# 依赖迁移纲要

> 生成日期：2026-10-20
> 状态：B0 / B1 / B1.5 已完成；B2 及后续批次待实施
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

建议顺序：**B0 → B1 → B1.5 → B2 → B3 → B4 → B5 → B6**。

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
- [x] `@babel/polyfill`：从 `webpack.style.js` 的 entry 删除，`style-pack` 改为正确的 `styleguidist build`；Electron / 现代浏览器不需要整包 polyfill。
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
- [ ] `node-gyp` 9 在 B4 里处理（`get-windows` 要求 ^10；也可能不再需要直接依赖）。

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
- [x] 删除 `react-test-renderer`、`@types/react-test-renderer`（`react-styleguidist` 的传递类型仍留在 lockfile，随 B5.5 处理）。
- [x] `jest.config.js` 新增 `test/jsdom-compat.js`（仅处理 jsdom 的 `getComputedStyle` 限制）和 `test/console-gate.js`（未声明 `console.error` / `console.warn` 直接失败），不使用全局静默。
- [x] 为 B5 的 `Hotkeys` 重写保留一份可用的 RTL 测试基线。

---

## 3. B2：`nedb` → SQLite

这是改动面最大、也是唯一涉及用户数据的一批。**核心原则：旧 `.nedb` 文件在迁移后保持原样，不删除，至少保留一个大版本。**

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

建议新增一个 repository 层，保持现有调用签名不变：

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

- [ ] `src/main/db.ts`：`new nedb(...)`、`loadDatabase` 重试、`refreshDbs` 全部改为 SQLite 连接管理。
- [ ] `src/main/io/read.ts`、`src/main/io/write.ts`：`AsyncDB` → repository。
- [ ] `src/utils/dbHelper.ts`：删除或改成对 repository 的薄封装。
- [ ] `src/renderer/workers/db.worker.ts`：删除（改为 IPC 后）或改写成 SQLite 实现。
- [ ] `src/renderer/workers/deferCompaction.ts`：删除；WAL 取代 nedb 的全文件 compaction。
- [ ] `src/renderer/monitor/sessionManager.ts`：删除 `loadDB` / `loadDBSync` / `new nedb`，改为 worker/repository 调用。
- [ ] `src/renderer/workers/trainKnn.worker.ts`：删除直接 `new nedb`，改为只读 repository 或由主进程传数据。
- [ ] `src/renderer/components/Timer/action.ts`：`dbs.settingDB` 直连改为 settings repository（同时减少 `@electron/remote` 使用）。
- [ ] `build/nedb-node-loader.js` 与 `webpack.renderer.config.js` 里的 nedb browser 规则：删除。
- [ ] `test/util-legacy-shim.js` 中的 `util.isDate/isRegExp` 兼容段：删除（其余 polyfill 保留）。
- [ ] `jest.config.js` 中 nedb 相关注释与 `FakeDBWorker` 的 nedb 依赖：删除。
- [ ] `package.json`：删除 `nedb`、`@types/nedb`；新增 `better-sqlite3`；`asarUnpack` 保留 `**/*.node`。
- [ ] `src/config.ts`：`dbPaths` 的 `.nedb` 文件名改为 `sqlitePath`，但保留旧路径供迁移器读取。

### 3.8 测试与验收

- [ ] 单测统一使用 `new Database(':memory:')`，每个测试独立 schema；不再写 `__test__db` 文件。
- [ ] 新增迁移器测试：构造 7 类 `.nedb` 样本（含空行、最后半行、未知字段），断言导入后的行数、`_id`、JSON 字段和 settings 拆分结果。
- [ ] 新增查询映射测试：覆盖 `$gt/$gte/$lt/$in/$set/$unset/$push/$pull/$inc/upsert/multi/投影`。
- [ ] 现有 action 测试：`cards/lists/boards/move/session/settings` 全部通过。
- [ ] 手工升级验证：复制一份真实用户 `db/` 目录（Windows/macOS/Linux 各一次，至少 Windows + macOS），启动后检查：历史图表、日历、看板拖拽、卡片标签、设置项、导出/导入、自动备份。
- [ ] 性能验证：多 MB 的 `session.nedb` 导入耗时、启动耗时、History 年度查询耗时，与旧版对比并记录。
- [ ] 回滚验证：保留旧目录，重新安装旧版本后仍能读取旧 `.nedb`（注意：SQLite 期间新产生的数据不会回到旧版本，文档中要说明）。

---

## 4. B3：渲染构建

### 4.1 `worker-loader` 3.0.8 → webpack 5 原生 Worker

- [ ] `src/renderer/workers/tokenizer.ts`：`import Worker from 'worker-loader!./tokenizer.worker'` → `new Worker(new URL('./tokenizer.worker.ts', import.meta.url))`。
- [ ] `src/renderer/workers/knnWorker.ts`：同上。
- [ ] `src/renderer/workers/DBWorker.ts`：如果 B2 已完成、db worker 已删除，此项只影响剩余两个 worker。
- [ ] `src/res/custom.d.ts`：删除 `declare module 'worker-loader!*'`。
- [ ] `jest.config.js`：删除 `'^worker-loader!'` mapper；必要时为 `new Worker(new URL(...))` 增加测试 mock。
- [ ] webpack 配置：确认 `target: 'electron-renderer'` 下 Worker chunk 的输出路径和 `globalObject`，dev/prod 都要验证。
- [ ] 删除 `worker-loader` 依赖。

### 4.2 `marked` 4.0.12 → 18.1.1

- [ ] 升级 `marked`，删除 `@types/marked`（marked 5+ 自带类型）。
- [ ] `src/renderer/components/Kanban/Card/formatMarkdown.ts`：确认 `marked(markdown, { gfm: true, breaks: true })` 仍可用；重点回归 GFM 任务列表的 `<input type="checkbox" disabled>` 结构（现有代码依赖这个结构做二次替换）。
- [ ] marked 18 是 ESM-only：Jest 需要把 marked 加入 `transformIgnorePatterns` 例外，或用 `moduleNameMapper` 指向 CJS 构建（如果仍提供）。
- [ ] 回归链接 `target="_blank"`、`#tag` 解析、`extractTags` 缓存。
- [ ] 若升级成本高于收益，可先停在 4.3.x，仅删除 `@types/marked` 并记录原因；但 marked 4 已不再接收安全修复。

---

## 5. B4：`active-win` → `get-windows`，并升级 Electron

`get-windows` 是 `active-win` 改名后的包（同一作者、同一套原生实现），当前版本 **9.3.0**，ESM-only，API 从默认导出改为命名导出：

```ts
import { activeWindow, activeWindowSync, openWindows } from 'get-windows';
```

返回类型仍是 `Result | undefined`，Windows 结果新增 `contentBounds`；原生二进制布局仍是 `lib/binding/napi-*`，macOS 仍是独立的 `main` 可执行文件，因此现有打包规则基本可以沿用。

### 5.1 代码改动

- [ ] `package.json`：删除 `active-win`，加入 `get-windows@^9.3.0`（放在 `dependencies`）。
- [ ] `src/main/activeWin.ts`：
  - 删除 `import _activeWin from 'active-win'`。
  - 改为懒加载：`const { activeWindow } = await import('get-windows')`，缓存模块 Promise；不要在 CJS bundle 顶层 `require` ESM 包。
  - `initActiveWin()` / `activeWin()` 内部调用 `activeWindow({...})`，选项名不变。
  - 状态日志可以继续叫 `active-win.log`（用户/文档已有引用），或改名为 `get-windows.log` 并在 README 里说明；二选一，别两处都写。
- [ ] `src/main/ipc/type.ts`、`src/renderer/monitor/UsageRecorder.ts`、`src/renderer/monitor/activeWinMonitor.ts`：`import type { BaseResult } from 'active-win'` → `'get-windows'`。
- [ ] `webpack.main.config.js`：externals 改为 `'get-windows': 'commonjs2 get-windows'`；如果动态 `import()` 被 webpack 改写成 `require` 导致加载失败，改用 `externalsType: 'module'` + 输出 ESM，或保留 `require` 并依赖 Electron 44 的 `require(ESM)` 支持（Node 24 已支持，但要用真实包验证）。
- [ ] `src/main/activeWin.test.ts`：`jest.mock('active-win')` → `'get-windows'`，mock 形状改为 `{ activeWindow: jest.fn() }`。
- [ ] `test/buildConfig.test.ts`：
  - `packageIsInstalled()` 的候选路径从 `node_modules/active-win/...` 改为 `node_modules/get-windows/...`。
  - `findNativeBindings()` 和其他断言同步修改。
- [ ] `package.json` 的 `build.files` / `build.linux.files` / `asarUnpack`：所有 `active-win` 路径改为 `get-windows`。
- [ ] `postinstall` 的 `electron-builder install-app-deps` 需要同时重建 `get-windows` 和 `better-sqlite3`，验证 `.node` 文件被正确解包到 asar 外。

### 5.2 Electron 39.8.10 → 44.9.1

Electron 39 的官方 EOL 是 **2026-05-05**，已经不再收到安全更新。Electron 44 内置 Node 24，和 `better-sqlite3` 13 的 Node 要求一致。

- [ ] 升级 `electron` 到 `^44.9.1`，`electron-builder` 保持 26.x 并验证兼容性。
- [ ] `webpack.main.config.js` 的 Babel target：`electron: '39'` → `'44'`。
- [ ] `@types/node`：22.x → 24.x（与 Electron 44 的 Node 对齐；不要直接跳到 26）。
- [ ] `@electron/remote` 2.1.3 继续使用；升级后验证 `remote.getGlobal('sharedDB')`、`utils.refreshDbs` 等仍可用。
- [ ] 回归所有原生能力：窗口拖拽、托盘、截图（`desktopCapturer`）、通知、开机启动、自动更新。
- [ ] Windows NSIS、macOS notarize、Linux deb 三条打包链路各做一次 `yarn pack` / `dist-*` 冒烟。
- [ ] 检查 `webPreferences`：当前是 `nodeIntegration: true` + `contextIsolation: false`。本次不要扩大权限；把迁移到 preload + `contextBridge` 作为独立的技术债记录（与 `@electron/remote` 一起处理）。

### 5.3 验收

- [ ] `get-windows` 在 Windows / macOS 上返回的 `title`、`owner.name`、`owner.path`、`url`（macOS 浏览器标签）与旧版一致。
- [ ] 无权限/无窗口时返回 `undefined`，监控仍然能保存空记录，不崩溃。
- [ ] 打包后的 asar 外能找到 `get-windows` 的 `.node` 和 macOS `main`。
- [ ] 全新安装和覆盖安装都能正常重建原生模块。

---

## 6. B5：状态与 UI 库替换

### 6.1 `deox` 2.1.4 → Redux Toolkit

`deox` 仓库已于 2022 年归档；`deox@3.3.1` 也是 2022 年的版本，并且依赖 `redux-starter-kit@0.5.1` + rxjs 6，不适合作为升级目标。

- [ ] 涉及文件：`History/action.ts`、`UserGuide/actions.ts`、`Kanban/action.ts`、`Kanban/List/action.ts`、`Kanban/Board/action.ts`、`Kanban/Card/action.ts`、`Timer/action.ts`。
- [ ] 用 `createAction` / `createReducer` 直接替换（改动最小），或逐步改为 `createSlice`。
- [ ] 保留现有 action 类型名与 payload 形状，避免组件测试大面积改动。
- [ ] 删除 `deox`，确认 `redux` / `react-redux` 版本不变。
- [ ] 回归：看板拖拽、卡片增删改、历史筛选、设置持久化。

### 6.2 `react-hot-keys` 3.0.0 → `react-hotkeys-hook` 5.x

`Hotkeys.tsx` 里已经记录了 3.0.0 的多个缺陷和 workaround（keyup 释放、输入框过滤、Alt+Tab 残留、模态框判断）。

- [ ] 用 `useHotkeys` 重写 `Hotkeys.tsx`，保留四个 guard：仅 keydown、可编辑目标过滤、模态框打开时禁用、按住只触发一次。
- [ ] 现有 `Hotkeys.test.tsx` 是回归基线，逐条保留。
- [ ] 所有调用点（Application / Timer / Kanban / PomodoroSankey）不改签名。
- [ ] 删除 `react-hot-keys`。

### 6.3 `react-trend` → 本地 SVG sparkline

当前依赖是 `zxch3n/react-trend` 的 git 分支，安装目录里没有 `package.json`（yarn 记为 `0.0.0`），原仓库 2019 年已归档。

- [ ] 用约 50 行 SVG `polyline` 实现 `ProjectTrend.tsx` 需要的曲线/渐变/尺寸能力。
- [ ] 或改用 npm 上的 `react-trend@1.2.5`，但同样要确认 React 19 兼容性。
- [ ] 删除 git 依赖，避免 codeload 供应链和“无 manifest”问题。
- [ ] 回归：History 项目趋势图的 hover、宽度自适应、空数据。

### 6.4 `prop-types`

- [ ] 删除 `Progress.tsx` 的 `static propTypes` 和 `import * as PropTypes`；`ProgressProps` 已经是完整的类型来源。
- [ ] 删除 `prop-types`、`@types/prop-types`（与 B1 合并）。

### 6.5 `react-styleguidist`

最后发版是 2025-01，之后没有提交；当前只用于 `yarn style` 本地预览。

- [ ] 先确认团队是否还在使用 `yarn style`。
- [ ] 如果不用：删除 `style` / `style-pack` 脚本、`styleguide.config.js`、`webpack.style.js`、`react-docgen-typescript`、`@babel/polyfill`、proposal 插件。
- [ ] 如果还用：迁移到 Ladle（轻量）或 Storybook；`src/components/**/README.md` 可以保留作为文档。
- [ ] 无论哪种，都把 `webpack.style.js` 从维护范围里去掉，减少一套 Babel/webpack 配置。

### 6.6 `react-test-renderer`

已提升为 **B1.5**（见 §2.5），作为控制台降噪的一部分优先完成；本批次不再重复。之后所有新测试一律使用 `@testing-library/react`。

---

## 7. B6：工具链大版本

| 依赖 | 当前 | 目标 | 备注 |
| --- | --- | --- | --- |
| `prettier` | 2.5.1 | 3.9.x | 升级后全仓 `--write` 一次，单独提交，避免和逻辑改动混在一起 |
| `webpack-cli` | 5.1.4 | 7.2.x | 要求 Node ≥20.9；与 webpack 5.111 兼容 |
| `webpack-dev-server` | 5.2.6 | 6.1.x | ESM-only、Node ≥22.15；`devServer` 配置有 breaking change，需要单独验证 `yarn start` |
| `eslint` | 9.39.5 | 10.13.x | 删除 `eslint-plugin-react` / `eslint-plugin-import` 后可行；`typescript-eslint` 8.72、`eslint-plugin-react-hooks` 7.1 已支持 10。注意 `@eslint/js@10.0.x` 目前被 npm 标记为 “should not be used”，建议等下一版再升 |
| `@babel/*` | 7.29.x | 8.0.x | Babel 8 已稳定；`babel-loader` 10 支持。主要变化是 preset 默认 target、Node 版本要求、`loose` 语义；和 B3 的插件清理一起做 |
| `nanoid` | 3.3.19 | 6.0.2（可选） | 4+ 是 ESM-only；3.x 仍在打补丁。更彻底的做法是用 `crypto.randomUUID()` 替换 `src/utils/uid.ts` 并删除依赖 |
| `node-gyp` | 9.0.0 | 13.x 或删除 | `get-windows` 自带 `node-gyp ^10`；确认 `postinstall` 正常后可移除直接依赖 |
| `@types/node` | 22.20.4 | 24.x | 跟 B4 一起 |
| `conventional-changelog-conventionalcommits` | 9.3.1 | 10.4.1 | 与 semantic-release 25 一起验证 |

补充：

- ESLint 10 升级前先确认 `eslint.config.js` 不再引用被删插件；`prettier` 的 flat config 入口保持 `eslint-config-prettier/flat`。
- webpack-dev-server 6 升级后重点验证：HMR、`react-refresh`、跨域代理（如果有）、Electron 渲染进程加载 URL。
- 如果未来考虑 Vite/Rspack，建议在 B3/B6 完成后再评估；当前 webpack 5 仍在维护，不需要为了“新”而换构建器。

---

## 8. 明确保持不动的依赖

- `node-ipc` resolution `9.1.1`：这是对 2022 年供应链事件的刻意固定版本，不要随手升级。
- `typescript`（`npm:@typescript/typescript6`）与 `@typescript/native`（TS 7）双轨：有意为之，和迁移无关。
- `@types/react` resolution `19.3.0`：与 React 19.3.1 配套的固定版本。
- `@electron/remote` 2.1.3：已是最新版本；要处理的是 `nodeIntegration/contextIsolation` 架构，而不是版本。
- `electron-updater` 6.8.9、`electron-builder` 26.15.3：当前已是最新稳定线。
- `react` / `react-dom` / `antd` / `echarts` / `jest` / `webpack`：当前版本已足够新，不在本纲要范围内。

---

## 9. 全局验收与回滚

### 9.1 每批的验收

- [ ] `yarn typecheck` 通过。
- [ ] `yarn lint` 通过。
- [ ] `yarn test` 通过（CI 使用 `--runInBand`）。
- [ ] `yarn build` 通过。
- [ ] 至少一个平台的 `yarn pack` 产物能启动，做完对应的手工冒烟清单。
- [ ] CHANGELOG / 发布说明中记录破坏性变更和用户数据迁移说明。

### 9.2 回滚策略

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

## 10. 实施前需要拍板的问题

1. SQLite 用 `better-sqlite3` 还是 `node:sqlite`？（推荐 `better-sqlite3`）
2. 数据库所有权：主进程独占 + IPC（推荐），还是继续放在渲染进程 worker？
3. 嵌套字段先存 JSON，还是本次就规范化 `sessions.apps` / `titleSpentTime`？
4. `settings` 用 key-value 还是单行多列？（推荐 key-value）
5. `react-styleguidist` 是删除还是迁移到 Ladle/Storybook？
6. `nanoid` 是升级到 6，还是换成 `crypto.randomUUID()`？
7. Electron 44 是否与 B4 同一次发布，还是先单独升 Electron 再换 `get-windows`？

---

## 11. 进度勾选

- [x] B0 控制台基线与降噪
- [x] B1 低风险清理（conventional-changelog 升级因兼容性延后到 B6）
- [x] B1.5 react-test-renderer → React Testing Library
- [ ] B2 nedb → SQLite
- [ ] B3 worker-loader / marked
- [ ] B4 active-win → get-windows + Electron 44
- [ ] B5 deox / hotkeys / react-trend / prop-types / styleguidist
- [ ] B6 prettier / webpack-cli / WDS / ESLint 10 / Babel 8 / nanoid / node-gyp
