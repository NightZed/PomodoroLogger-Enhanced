# History 的最近记录与 ProjectTrend 的查询仍无上界

Status: needs-triage

## 现象

两处「某时刻之后」的查询没有上界，系统时钟回拨或时区西移后，
已写入的 `startTime` 会晚于「现在」，被当成正常记录参与聚合：

- `src/renderer/components/History/History.tsx:258`：`recentArg = { startTime: { $gte: recentStart } }`，
  传给 `aggHistory` 的 `recentQuery`。
- `src/renderer/components/Visualization/ProjectTrend.tsx:283`：`{ startTime: { $gte: since } }`。

历史页的日视图不受影响（`History.tsx:329` 用 `$lt nextDay`）；受影响的只有
「最近」聚合与趋势曲线。需要先确认这两处在界面上是否真的会显示出未来记录，
再决定修不修。

## 修法

按 `tomorrowStart()`（`src/renderer/monitor/day.ts`）补上界，与今日列表保持同一口径；
或者明确接受，因为它们表达的是「起点之后」，不是「今天」。

## Comments

- 2026-11-24：记录于 `0ac9fa8` 修复今日列表上界之后，属于同一类缺陷的其他出现点。
