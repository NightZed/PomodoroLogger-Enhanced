# 导入报告与数据重载

## 背景

导入完成后的窗口只列出几条「警告」，但那些警告描述的动作并没有发生：

- `cardRemoved`（「卡片 X 将被移除」）：`resetDanglingCard` 只调用 `warn`，没有从 `ans.cards` 删除，卡片会原样入库。
- `moveDropped`（「该移动记录将被丢弃」）：validate 只 warning，`mergeMove` 仍把这行加进结果。
- `sessionNotCounted`（「其时长不会被统计」）：没有解绑，卡片仍引用该 id；本地已有该会话时统计正常。

列表里的 path 是 `merge` / `move` / `cards["x"].sessionIds`，用户看不出对象和后果；顺序是校验器在前、合并器在后，最严重的 `cardRemoved` 反而排最后。`unknown` 只写进 `data.log`，是纯英文技术格式，没有和上面三类统一。导入和删除完成后还要重启应用才能看到新数据。

## 目标

- 明确导入与「检查并修复数据」的边界：**导入只搬运，不打扫**。
- 导入报告按严重度分组、只给数量，详情写进 `data.log`，每组用 4 空格缩进。
- 导入与删除数据都不再重启应用，改为重载 store 与相关页面状态。
- 清理所有导入/删除路径上的「重启」文案。

## 非目标

- 不改导入文件的硬校验（损坏、结构错误仍然拒绝并逐条显示前 20 条）。
- 不在导入时清理任何数据（`move`、卡片、会话引用原样保留）。
- 不把日志改成每行独立时间戳；明细行走 `log()` 的 detail，靠 4 空格缩进。
- 不动更新安装后的「重启并安装」。

## 边界：导入只搬运，不打扫

| 数据 | 导入做什么 | 谁清理 |
| --- | --- | --- |
| 不在任何列表的卡片 | 保留（能按 move 推断归属的放回列表） | 检查修复：恢复或删除 |
| 端点不存在的 move | 原样保留 | 检查修复：删除 |
| 卡片引用不存在的会话 | 原样保留 | 检查修复：移除引用 |
| 项目不存在的会话 | 原样保留 | 历史页按天管理：重新分配项目 |
| 从未关联项目的会话 | 正常状态 | 不需要处理 |

理由：导入不能静默删除用户内容（卡片有标题和正文）；删除必须由用户在检查面板里明确勾选。导入与检查修复因此没有交集：导入负责「把文件里的东西搬进来」，检查修复负责「清理搬进来的无效引用」。

`resetDanglingCard` 把「按 move 记录能推断出列表」的卡片放回列表，这是归属推断，不是清理，保留，并在报告里计数。

**计数口径**：只有 `cardLastMove[card]` 存在——即这张卡片的位置确实由一条 move 记录决定——并且最终被放回候选列表时才计入 `rehomed`。没有 move 的卡片也走同一条放回路径，但那只是保持原列表，把它算进来会把一次普通合并描述成修复。

## 数据流

1. `DataMerger.merge()` 保持返回 `SourceData`，同时通过 `getStats()` 给出 `rehomed: { cardId, listId }[]`。
2. `handleMergeData`（worker）把 `merged` 与 `stats.rehomed` 一起返回；不再拼接 `warning` 字符串。
3. 主进程 `ImportData` 在 `merged` 上调用 `analyzeImport(merged, rehomed)`，得到汇总与日志分组，写 `data.log`，返回 `ImportResult.summary`。
4. 渲染层重载 store，按有没有需要处理的项弹出报告或 toast。

## 汇总结构

```ts
export interface ImportSummaryCounts {
    /** 不在任何列表里的卡片，含被孤儿列表引用的。 */
    cardsOutsideLists: number;
    /** 端点不存在的移动记录。 */
    deadMoves: number;
    /** 卡片引用了不存在的会话。 */
    danglingSessions: number;
    /** 会话的 boardId 指向已不存在的看板。 */
    unknownBoard: number;
    /** 从未关联项目的会话。 */
    noBoard: number;
    /** 按 move 记录推断后放回列表的卡片。 */
    rehomed: number;
}

export interface ImportSummary {
    counts: ImportSummaryCounts;
}
```

弹窗只读 `counts`；日志明细由 `buildImportLogGroups()` 生成。计数口径与「检查并修复数据」一致，避免两个界面给出不同答案。

## 日志格式

- 每行前缀由 logger 自动生成：`2026-11-13T14:05:22.031+08:00 [k3J9x] INFO  data: ...`。
- 分组标题一次 `log()` 调用；明细作为 detail 传入，自动得到 4 空格缩进。
- 时间字段统一用 `formatTimestamp`（`src/main/log.ts`）：本地墙钟 + 明确 UTC 偏移。
- 每类最多 500 条（与导入校验的 `MAX_RECORDED_ISSUES` 一致），超出写 `N more not shown`。
- 每组按 8 KiB 切块，避免 logger 的 8 KiB detail 截断；也避免每条一行触发每秒 20 行的限速。

```
2026-11-13T14:05:22.031+08:00 [k3J9x] INFO  data: import completed file="pomodoro-export-2026-11-12.json" bytes=1843200 records=5213 cards=86 lists=24 boards=7 move=412
2026-11-13T14:05:22.034+08:00 [k3J9x] INFO  data: import issues orphanCards=37 deadMoves=19 danglingSessions=64 unknownBoard=41 noBoard=312 rehomed=12
2026-11-13T14:05:22.034+08:00 [k3J9x] INFO  data: cards not in any list (37, showing 20)
    card=a1B2c3D4e title="调研竞品" spent=2.75h sessions=5 state=orphan
    card=k1L2m3N4o title="周报" spent=0.25h sessions=1 state=detached list="待办"
    ...
    17 more not shown
2026-11-13T14:05:22.041+08:00 [k3J9x] INFO  data: dead move records (19)
    card=a1B2c3D4e title="调研竞品" from=g5H6i7J8k to=z9Y8x7W6v time=2026-10-31T09:12:00.000+08:00
    ...
2026-11-13T14:05:22.048+08:00 [k3J9x] INFO  data: dangling session references (64, showing 20)
    card=a1B2c3D4e title="调研竞品" session=s9T8u7V6w
    ...
    44 more not shown
2026-11-13T14:05:22.050+08:00 [k3J9x] INFO  data: unknown projects - deleted board (41, showing 20)
    session=s9T8u7V6w board=goneProject start=2026-10-28T08:15:00.000+08:00 spent=0.25h apps=3
    ...
    21 more not shown
2026-11-13T14:05:22.052+08:00 [k3J9x] INFO  data: unknown projects - no project (312, showing 20)
    session=b1N2m3O4p start=2026-10-20T13:40:00.000+08:00 spent=0.75h apps=5
    ...
    292 more not shown
2026-11-13T14:05:22.053+08:00 [k3J9x] INFO  data: cards rehomed by move records (12)
    card=c1D2e3F4g title="需求整理" list=h7I8j9K0l by=move
    ...
```

字段：

- 卡片：`card`、`title`、`spent`、`sessions`、`state=orphan|detached`（detached 追加 `list`）。
- move：`card`、`title`（卡片还在时）、`from`、`to`、`time`。
- 悬空会话：`card`、`title`、`session`。会话行已经不存在，所以没有开始时间、时长或应用数可写。
- 未知项目：`session`、`board`（deleted board 组才有）、`start`、`spent`、`apps`。
- 自动放回：`card`、`title`、`list`、`by=move`。

不写 `apps` 的标题明细，避免一条会话写几 KB。

## 弹窗

`ImportReportDialog`（`AppModal`），只在有需要处理的项时打开：

```
导入完成

需要处理
  37 张卡片不在任何列表里
  19 条移动记录指向不存在的卡片
  64 张卡片引用了不存在的番茄
  41 条番茄的项目已删除

提示
  312 条番茄没有关联项目

已自动放回
  12 张卡片按移动记录推断，放回了列表

详细的 id、标题、时间见 data.log

[ 打开日志文件夹 ]   [ 检查并修复数据 ]   [ 完成 ]
```

- 「检查并修复数据」关闭弹窗后调用设置页已有的 `onCheckData()`。
- 没有任何需要处理的项时，只 toast「导入完成」，不打开弹窗。
- 提示组与已自动放回组只显示数量，不单独给出操作按钮。

## 不再重启：导入 / 删除数据

### reloadDataStore

新增 `src/renderer/dataReload.ts` 的 thunk：

1. `readKanbanSnapshot()` 一次读回 boards / lists / cards（`components/Kanban/Board/action.ts`，与 `fetchBoards` 共用），再用 `applyKanbanSnapshot` 一条 action 替换三份状态。
2. `chosenBoardId` 指向不存在的看板时清空。
3. dispatch `bumpSessionReloadToken()`：Timer 在 `componentDidUpdate` 里检测 token 变化，重新 `getTodaySessions()` 并重设 `pomodorosToday` / `pomodoroNum`。
4. dispatch `historyActions.setExpiringKey(new Date().toString())`，让已挂载的历史页重新聚合。

**必须是原子替换**：三份数据互相用 id 引用，分三次 dispatch 会留下「新 lists + 旧 boards」的中间态。删除全部数据时 lists 先清空、boards 后清空，任何沿 `board.lists → lists[id].cards` 取值的组件都会在那一帧读到 `undefined`（`ListsCountBar` 因此把整个窗口换成崩溃页）。`applyKanbanSnapshot` 让三个 reducer 响应同一个 action，订阅者只被通知一次。

`timer.boardId` 不再单独处理：Timer 现有的 `componentDidUpdate` 会在 boards 刷新后自动清掉指向已删/隐藏看板的选中项。

### 重载后的图表与错误页

导入后不重启，暴露了两处只在「重新挂载」时才会出现的问题：

- `ListsCountBar` 只统计 store 里仍存在的 list。原子替换后不再有中间态，但 store 也可能被别的路径短暂置为不一致，`mapStateToProps` 里的异常会直接走到整窗崩溃页。
- `Bar` 的层数由自身高度决定，必须用 `ResizeObserver` 测量，并且**忽略 0 高度**。页签隐藏或布局未完成时挂载会读到 0，`maxItemInCol` 变成 1，每个列表只剩一块 60% 高的红色矩形；`<svg>` 没有原生 `resize` 事件，旧实现无法自愈，只能重启应用。
- 错误页的 `Time:` 改用 `formatTimestamp`（本地墙钟 + 显式 UTC 偏移），与日志行一致；`toISOString()` 的 `Z` 需要读者自己换算时区。

### 导入

- 成功后 `await reloadDataStore()`，再根据 `summary` 打开报告或 toast。
- 删除 `restartApp()` 调用与 `onOk: restartApp`。

### 删除所有数据

- `deleteAllUserData()` 成功后 `await reloadDataStore()`：boards/lists/cards 为空，Timer 的今日番茄重查为空，历史页刷新。
- 删除 `window.api.restart()` 调用。

### 文案清理

- `deleteAllRestartNote` → 「设置会被保留。此操作不可撤销。」
- `importConfirm` → 去掉「will restart after importing」。
- `importDone` → 去掉「Restarting…」。
- 删除 `importRestartNote`、`importWarningTitle`、`importWarningIntro`、`importIssuesLogged` 中与重启有关的措辞。
- `deleteFailedDetail` 去掉「应用未重启」。
- 保留 `crash.restart`、`restartToApply`、`restartAndInstall`（错误页与更新安装仍在用）。

## 类型与接口

- `ImportResult` 的 `imported` 分支：`{ status: 'imported'; summary: ImportSummary; meta: ExportMeta }`。
- 删除 `ValidationWarning` 与 `ValidationResult.ok.warnings`。
- `WorkerResponsePayload[MergeData]` 增加 `rehomed`。
- 新增 `src/shared/dataTransfer/importSummary.ts`：
  - `analyzeImport(merged, rehomed): ImportSummary`
  - `buildImportLogGroups(merged, rehomed, formatTime): ImportLogGroup[]`
  - `ImportLogGroup = { title: string; lines: string[]; more: number }`

## 实施顺序

1. **文档**：本文件。
2. **合并器与校验层**：`dataMerger` 记录 rehomed；`validate` 删除两条 warning 与 `ValidationWarning`；worker 转发 stats；更新测试。
3. **importSummary**：计数、明细行、500 上限、时间注入；单测。
4. **主进程日志与契约**：`ImportData` 写分组日志；`ImportResult.summary`；preload/type；测试。
5. **数据重载**：`reloadDataStore`、Timer token、导入/删除去重启、文案清理；测试。
6. **导入报告弹窗**：`ImportReportDialog`、设置页接入、i18n；测试。
7. **文档与验证**：AGENTS.md、spec 更新、typecheck/lint/全量测试。

## 测试

- `dataMerger`：rehomed 统计；无法归属的卡片保留，不产生 warning。
- `validate`：文件内部引用不完整不再产生 warning；硬错误不变。
- `importSummary`：四类计数、orphan/detached 区分、500 截断、时间格式（正则匹配 `±HH:MM`，不锁死时区）。
- `ImportData` 日志：分组标题、4 空格明细、`N more not shown`、8 KiB 分块。
- `reloadDataStore`：三个 fetch 被调用；失效的 `chosenBoardId` 被清空；token 与 expiringKey 被 dispatch。
- Timer：token 变化时重新拉取今日会话。
- `Setting`：导入成功重载、报告打开/不打开、检查按钮触发扫描；删除数据后不调用 restart。
- `ImportReportDialog`：分组数量、三个按钮回调。

## 风险

- 日志量大时依赖 8 KiB 分块与 500 上限；分块会让同一组出现多次标题（带 `(1/2)` 这样的序号），这是可接受的。
- 导入报告只给数量，用户需要打开日志或检查面板才能看到具体条目；这是「弹窗做汇总」的代价。
- 重载 store 不会重载 `settings`（导入不包含设置），所以设置页无需刷新。
- 删除所有数据后，正在进行的番茄不会被中断；它的记录在结束后会写入空库，属于预期。
