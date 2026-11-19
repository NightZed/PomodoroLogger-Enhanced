# 数据层（单写入者）

> `AGENTS.md` 的「数据层」区域详情。改动 SQLite 访问、repository 或迁移前先读这里；改完回 `AGENTS.md` 核对硬约束。

## 唯一连接

主进程独占唯一的 SQLite 连接（`src/main/db/index.ts`、`connection.ts`、`schema.ts`、`repository.ts`）。

repository 沿用旧的 NeDB API（`find` / `findOne` / `insert` / `update` / `remove` / `count`），这样 action 代码不用重写。

## 只读扫描：禁用 `findSync`

`findSync` 会把每行的 `doc` 列整段 `JSON.parse`，而 sessions 的 `doc` 含每个应用/标题的明细。

- 只要 id：用 `idsSync()`
- 只要部分字段：用 `findFieldsSync(query, fields)`

两者都只 `SELECT` 需要的列，不碰 `doc`。

为什么这条是硬约束：2 万条会话上全量读一次约 1 秒。主进程单线程被占满，窗口停止重绘——表现是点击按钮后先卡住、转圈和弹窗一起迟到，而不是一个可读的报错。

## 渲染层如何访问数据库

渲染层从不直接碰 SQLite。

`src/renderer/dbs.ts` 构造名为 `sessionDB`、`settingDB`、`kanbanDB`、`cardsDB`、`listsDB`、`moveDB` 的 IPC 代理；`src/main/db/ipc.ts` 白名单化数据库名和七个允许的操作。

测试则通过 `test/dbBridge.ts` 安装一个真实的内存桥接。

## 迁移

旧 NeDB → SQLite 迁移在 `initializeDatabaseFile()`（`migrate.ts`）里跑，旧的 `.nedb` 文件保持不动，并备份到 `db-bk/pre-sqlite-<ts>`。

## 数据目录

| 环境                    | 位置                                   |
| ----------------------- | -------------------------------------- |
| 测试（`NODE_ENV=test`） | `:memory:`，数据目录钉在 `.local/test` |
| 开发                    | `.local/dev`                           |
| 生产                    | `%APPDATA%\PomodoroLogger`             |

由 `src/main/config.ts` 决定。
