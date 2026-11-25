# reload 失败后 lastReloadDay 不推进，时间回拨会锁死旧列表

Status: needs-triage

## 现象

`Timer.reloadTodaySessions`（`src/renderer/components/Timer/Timer.tsx`）的 `catch` 只
`console.error`，失败时 `lastReloadDay` 保持旧值。

如果这次失败发生在跨天刷新，列表仍是旧日期；此后把系统时间回拨到那个旧日期，
`onStart` 里的 `todayStart() !== lastReloadDay` 不再成立，页面永远不会重查，
旧列表被当成「今天」直到应用重启。

## 修法

失败分支把 `lastReloadDay` 置 0（或 `undefined`），让下一次开始必定重试。
一行改动，不影响成功路径。

## Comments

- 2026-11-24：与 `0ac9fa8` 的查询上界修复分开记录。上界修好后，缓存的污染来源只剩
  「查询失败」这一条，所以这条待办的优先级低于它。
