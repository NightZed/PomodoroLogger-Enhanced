# History 的最近记录与 ProjectTrend 的查询仍无上界

Status: needs-triage

## 现象

两处「某时刻之后」的查询没有上界，系统时钟回拨或时区西移后，
已写入的 `startTime` 会晚于「现在」，被当成正常记录参与聚合：

- `src/renderer/components/History/History.tsx:258`：`recentArg = { startTime: { $gte: recentStart } }`，
  结果就是 `aggHistory` 的 `recentRecords`。**历史页顶部的「今日 / 本周 / 本月」三个数字
  因此也会把未来记录算进去**：它们由 `getPomodoroAgg(0 / getDay() / getDate()-1, recentRecords)`
  算出，而这个函数自己也只判断 `startTime >= 起点`（`src/utils/aggPomodoro.ts:71`）。
  与 `0ac9fa8` 修的今日列表同源，只是显示在另一页。
- `src/renderer/components/Visualization/ProjectTrend.tsx:283`：`{ startTime: { $gte: since } }`，
  趋势曲线同理。

历史页的日视图不受影响（`History.tsx:329` 用 `$lt nextDay`）。

## 修法

给 `recentArg` 补 `$lt: tomorrowStart()` 就能一并修掉那三个数字，不需要改
`getPomodoroAgg`；`ProjectTrend` 同样补上界。也可以明确接受，但要注意「今日」
在界面上是字面意思，接受意味着时钟回拨时它会显示未来的番茄。

## Comments

- 2026-11-24：记录于 `0ac9fa8` 修复今日列表上界之后，属于同一类缺陷的其他出现点。
- 2026-11-24：补充「今日 / 本周 / 本月」三个数字也受影响；修 `recentArg` 即可覆盖，
  不必在 `getPomodoroAgg` 里再判断一次。
