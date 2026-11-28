# 会话记录降为应用级（轻量记录）

Status: draft（方案已实测评估，未排期）

## 背景

每场会话的 `apps` 里，每个应用都带一份 `titleSpentTime`（该应用的每个窗口标题 + `index` / `normalizedWeight` / `occurrence`）。按 2026-11 的真实数据，一场番茄平均 8.8 个应用、42.1 个窗口标题；`titleSpentTime` 占 `doc` 内容约 73%。

库增长几乎全部来自这里：

| 口径               | 现有 3680 场（VACUUM 后） | 每月新增 | 5 年后 |
| ------------------ | ------------------------- | -------- | ------ |
| 现状（记标题）     | 52.4 MB                   | 11.5 MB  | ~749 MB |
| 只记应用名         | 15.2 MB                   | 3.9 MB   | ~253 MB |

测量方法：复制真实库 → 删除全部 `titleSpentTime`、把 `switchActivities` 的编号重映射为应用编号、其余字段不动 → VACUUM → 按最近一个月（689 场 / 128 卡 / 610 次移动）逐月复制 60 次。每月增量稳定，无非线性。

## 候选方案

**A. 只记录应用名（推荐）**

- `apps` 只留 `{ appName, spentTimeInHour }`，删除 `titleSpentTime`。
- `switchActivities` 保留逐步采样，值改为应用序号；`stayTimeInSecond` 长度不变。
- 实测：现有 15.2 MB、月增 3.9 MB。
- 代价：桑基图的标题层消失；分心规则里的 `title` 正则失效，只能按应用判定。

**B. 保留标题，删掉两个统计字段**

- 只删 `titleSpentTime[*].normalizedWeight` 与 `.occurrence`，保留标题与 `index`。
- 这两个字段目前只有 `UsageRecorder` 写入，仓库里没有读取方（测试除外）。
- 粗估（按 11 月 42 标题/场）：现有约省 9 MB，月增约省 1.7 MB。未实测，收益远小于 A。
- 适合作为独立的小改动先落地，不改变任何展示。

**C. 迁移策略**

- 只改未来：历史 54 MB 原样保留，之后每月 +3.9 MB；5 年约 293 MB。
- 历史也清：一次性删旧记录的标题并 VACUUM，5 年约 253 MB。

**D. 不改格式，只做归档**

- 定期把 N 年前的会话导出并从库里删除，再 VACUUM（`auto_vacuum` 关闭，删除本身不缩文件）。
- 不解决单行体积，只是把问题推后；与 A/B 不冲突。

## 影响面（已核对）

- 记录端 `src/renderer/monitor/UsageRecorder.ts:235-250`：按标题建 `titleSpentTime`，`switchActivities` 写标题 `index`。
- 合并/重命名 `src/renderer/monitor/sessionManager.ts:9-13,142-143`：按标题合并，并维护 `index → [title, app]` 映射。
- 桑基图 `src/renderer/components/Visualization/PomodoroSankey.tsx:158-180,237-238`：遍历 `titleSpentTime` 建节点，`switchActivities[i]` 当标题索引查停留时长。
- 效率判定 `src/shared/efficiency/efficiency.ts`：`EfficiencyAnalyser.getIsDistracting(app, title)` 会对标题跑正则；`DistractingRow` 支持 `{ app, title }` 组合规则。
- 时长缩放 `src/renderer/components/Timer/Timer.tsx:1230-1232`：按 `switchActivities` 下标缩放 `stayTimeInSecond`。
- 类型 `src/renderer/monitor/type.d.ts:8-16`、schema `src/main/db/schema.ts:45-48`。

**实现约束**

- `stayTimeInSecond` 的长度等于 `switchActivities` 的长度（实测 206.7 vs 207），**不是**标题数；不要按应用数截断。
- 删标题后必须重映射编号，否则旧逻辑会把 `switchActivities` 当成标题索引，桑基图与时间线错位。
- 旧记录（有标题）与新记录（无标题）会共存，渲染层与效率判定都要能读两种形态。

## 待决策

1. 采用 A 还是先做 B。
2. 历史数据是否迁移（C 的两种口径）。
3. 桑基图降级后是否保留「应用 → 专注/分心」两层，标题层直接去掉。
4. 标题级分心规则如何降级：忽略 title 条件、还是迁移成应用规则并提示用户。
5. 是否需要迁移版本号（`SCHEMA_VERSION` 目前为 1，`doc` 是权威副本，改 `doc` 会丢原字段）。

## 待办

- [ ] 01 记录端改为应用级，`switchActivities` 用应用编号；补旧记录的兼容读取。
- [ ] 02 桑基图与效率判定适配无标题记录（含标题正则的降级策略）。
- [ ] 03 全量迁移脚本：删 `titleSpentTime`、重映射编号、VACUUM，并保留可回滚备份。
- [ ] 04（可选，独立）删掉 `normalizedWeight` / `occurrence`，不改变展示。
- [ ] 05 更新 `docs/architecture/session.md` 与 `data.md` 里的记录结构说明。

## 非目标

- 不改采样频率、不改 `Σapps == spentTimeInHour` 的约束。
- 不动 `cards` / `moves` / `boards` 的结构。
- 不引入压缩或外部存储格式。
