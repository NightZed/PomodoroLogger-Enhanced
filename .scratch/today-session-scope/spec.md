# 今日会话的查询范围与缓存失效

Status: open（边界已记录，剩余两项未排期）

## 背景

2026-11-24 的 `0ac9fa8` 修掉一个 2019 年就存在的查询缺陷：`getTodaySessions` 只有下界
（`startTime > 今天 0 点`），系统时钟被拨到未来期间写入的会话会一直算进「今日」，
重启也不消失。现在区间是 `[今天 0 点, 明天 0 点)`，两端从同一时刻推导。

「今日」按 `startTime` 归属（`src/renderer/monitor/day.ts`）。`History` 的日视图本来就是
两端过滤（`$gte dateStart, $lt nextDay`），所以同一个场景在历史页看不到问题。

## 当前口径

- **缓存**：`Timer.pomodorosToday` 只在挂载、数据重载（导入 / 全删，`sessionReloadToken`）
  和跨天后的第一次开始会话时刷新；确认番茄后直接 `concat`，不再查询。
- **失效判断**：`onStart` 比较 `todayStart()` 与 `lastReloadDay`，不等才重查；
  日期在查询发出前取，成功后才回填。
- **消费点**：圆点、模式行计数、结束遮罩标题、迷你条 tooltip、今日统计面板、
  通知里的 `pomodoroNum` 全部读这份缓存，所以口径一致。

## 已知边界（接受，不修）

1. **0 点后到首次开始会话之前**，页面仍显示前一天的列表；开始任何会话都会刷新。
2. **跨午夜的会话**按 `startTime` 归前一天；0 点后确认它时，它会 `concat` 进当时那份列表，
   直到下次开始会话刷新。
3. **系统时间回拨**到缓存所属日期时不会重查（`todayStart() === lastReloadDay`），
   列表保持原样。只要缓存没被污染，这就是正确行为——`concat` 进来的记录属于
   `lastReloadDay` 那天，因为新会话只能从 `onStart` 开始。

## 待办

- `issues/01-reload-failure-lock.md`：查询失败 + 时间回拨会把旧列表永久当成今天。
- `issues/02-unbounded-recent-queries.md`：`History` 的 `recentArg` 与 `ProjectTrend` 的
  `since` 仍无上界。
