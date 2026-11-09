# 日志与崩溃页

Pomodoro Logger Enhanced 把诊断信息写到 `<dataDir>/logs`：

| 构建 | 文件夹 |
| --- | --- |
| 安装版 | `%APPDATA%\PomodoroLogger\logs` |
| 开发（`pnpm start`） | `<repo>/.local/dev/logs` |
| 测试 | `<repo>/.local/test/logs`（`posttest` 时删除） |

`<dataDir>` 就是设置页里 **Open Data Folder** 打开的那个目录；日志与 `db/`、`db-bk/`、`screenshots/` 平级，绝不放进 `db/` 里面。

## 文件

| 文件 | 内容 |
| --- | --- |
| `app.log` | 启动横幅（版本、Electron、平台、日志级别）、更新流程、IPC 失败、worker 回退、迁移摘要 |
| `active-win.log` | 活动窗口后端的初始化与失败（这个名字是故意保留的历史命名） |
| `crash.log` | 渲染层崩溃报告、`uncaughtException`、`unhandledRejection`、`render-process-gone`、`child-process-gone`、`did-fail-load`、preload 错误 |
| `data.log` | 导入结果和全部导入问题（最多 500 条），包括对话框没能展示的那些；删除全部数据的完成记录 |
| `migration.log` | 一次性的 NeDB → SQLite 报告，每次迁移时覆盖 |

每行以本地时间戳开头——带 UTC 偏移——后面是六位进程 id。
本地时间对应用户当时看到的东西；偏移量保证这个瞬间在与另一台机器上的文件比对时没有歧义：

```
2026-11-05T19:12:33.451+08:00 [k3f9qa] ERROR crash: renderer react: Cannot read properties of undefined
    Error: Cannot read properties of undefined
        at Timer.render (dist/app.js:1:12345)
```

同一个会话 id 也显示在错误页上，所以凭一张截图就能对上日志行，不用再向用户索要文件。

## 级别

`debug < info < warn < error`。
生产默认 `info`，开发和测试默认 `debug`。
设置页（**System → Logging**）可改，改完立即生效；该值存在 settings 表里，启动时读取。
命令行参数或环境变量优先于这项设置：

```powershell
pnpm start:prod -- --log-level=debug
$env:POMODORO_LOG_LEVEL = 'debug'; pnpm start:prod
```

`crash` 和 `data` 记录完全忽略级别：能被设置静音的崩溃日志就失去了意义，而导入对话框向用户承诺了「完整的问题列表在日志文件夹里」。
每个文件在 1 MiB 处轮转，保留三个归档（`.1`、`.2`、`.3`）；相同消息在 5 秒内合并；单个 scope 每秒最多写 20 行。

## 导入问题

导入对话框最多显示 20 条；校验器会为 `data.log` 记录最多 500 条（超出部分仍然计数，所以总数不会丢）。
条目按 8 KiB 以下分块，避免 logger 的「每条详情上限」把列表截断。
只记录文件名，从不记录完整路径：

```
2026-11-07T10:12:33.451+08:00 [k3f9qa] WARN  data: import refused (validation) file="backup.json" bytes=48213 issues=137
    records[3].startTime: is missing; a finite number is required
    records[4]._id: must be a string
    ...
```

导入成功时写一行结果计数（`records=`、`cards=`、`lists=`、`boards=`、`move=`、`warnings=`），后面跟着合并警告（如果有）。

## 向用户索要日志

1. 设置 → System → Logging → **Debug**，复现问题，再改回去。
2. **Open Log Folder**，把 `app.log` 和 `crash.log` 附到报告里。
   如果是导入失败或导入时调整过条目，再附上 `data.log`——这类问题的对话框上都带 **Open Log Folder** 按钮。

日志绝不包含窗口标题或应用名：`active-win.log` 只记录活动窗口后端有没有初始化成功。

## 崩溃页

React 渲染失败由 `AppErrorBoundary`（`src/renderer/app.tsx`）捕获并替换成 `ErrorScreen`；应用不会自己重启。
页面上有 **Restart**、**Quit**、**Copy Details** 和 **Open Log Folder**，并显示日志文件夹和会话 id。
非 React 的错误（`window 'error'`、`unhandledrejection`）只上报到 `crash.log`，界面保持原样，因为那种情况下 React 本身还是健康的。
