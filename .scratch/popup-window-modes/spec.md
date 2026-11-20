# 弹窗与窗口模式

## 背景

迷你（200×90）和托盘（窗口最小化）下，应用内的弹窗无法被看见：

- 迷你时 `Application` 把 `.ant-modal-root` 整个 `display: none`，confirm / alert 完全不可见，`alert` 的遮罩又不可点，用户只能退出迷你；
- 右侧 notice 的 `min-width` 是 260px，比迷你窗口还宽，图标和按钮被 `overflow: hidden` 裁掉；
- 窗口在托盘时只写 DOM，不会让窗口出现。

典型的坏路径：托盘菜单「开始专注」→ 没选项目 → `feedback.confirm` 弹出「是否继续」→ 窗口不出现、会话不开始，用户看到的是「点了没反应」。

错误路径上有一条补救：`reportRendererError` 会让主进程 `restoreWindowForError()` 把窗口撑到 900×640。它只覆盖错误，且没有复位渲染层的档位和 `inTray`。

## 目标

按「不看到会出事」的程度分级，统一规则：

| 档位 | toast | 普通 notice | 错误 notice | confirm / alert | 全屏报错 | 页面内错误兜底 | 会话结束 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| normal | 不动 | 不动 | 不动 | 不动 | 只聚焦 | 不动 | 现状 |
| compact | 不动 | 不动 | 不动 | 不动 | 恢复 1440×960 | 不动 | 现状 |
| mini | 不动 | 不动 | 恢复 | 恢复 | 恢复 | 恢复 | 现状 |
| tray | 不动 | 不动 | 恢复 | 恢复 | 恢复 | 恢复 | 不 show、不 focus、不弹遮罩 |

- 不做 notice / modal 的迷你尺寸自适应。
- 恢复后留在普通窗口，不回迷你 / 托盘。
- 恢复时抢焦点。

## 恢复的精确含义

1. 窗口：restore（若最小化）→ 取消 always-on-top → 取消 skipTaskbar → 尺寸 1440×960 → `keepWindowOnScreen` → show + focus。
2. 渲染层：`setMinimize(false)`，让 store、`MinimizeWindow` IPC 和窗口布局一致。
3. `applyTrayState(false)`，复位 `inTray`，否则页面卸载宽限和今日统计收起仍按托盘走。
4. 从紧凑档位收进托盘再恢复，保持 370×490（能放得下），不撑到 1440×960。
5. 普通窗口关闭到托盘再恢复，保持用户原来的尺寸。

## 判定

判定是一个纯函数，输入 store 的三个标志和弹窗类型，输出三种动作：

```ts
type AttentionAction = 'normal' | 'focus' | 'none';

planWindowAttention({ inTray, minimize, compact }, kind)
```

- `kind`：`confirm`（含 alert）、`error`（错误 notice）、`fullscreen`（`ErrorScreen`）。
- `base`：`minimize ? 'mini' : compact ? 'compact' : 'normal'`（托盘时仍要知道底下是哪一档）。
- `fullscreen`：`base === 'normal' ? 'focus' : 'normal'`。
- 其他：`base === 'mini'` → `normal`；否则 `inTray` → `focus`；否则 `none`。

`normal` 表示窗口要变成 1440×960 普通窗口，`focus` 表示只把窗口带到前台、尺寸不动。

## 会话结束

- 托盘：`onDone` 跳过 `focusOnCurrentWindow()`。窗口不出现，遮罩不出现；托盘图标变水果（已有）、系统通知（受 `desktopNotification` 控制，已有）。
- 迷你 / 紧凑 / 普通：保持现状（迷你走 `MiniLogger` 的确认态，其余走 `TimerMask`）。
- 托盘里仍可确认：`sessionEnding` 时 Start 项保持可用，点它先确认再开始。

## 退出阻止

- 判据：有已结束但未确认的番茄钟（`sessionEnding` 且 `stagedSession` 未落库）。
- 渲染层把这个布尔同步给主进程；Timer 卸载时置回 false（崩溃页的「退出」不能被拦）。
- `before-quit` 拦截：`preventDefault()` → 窗口恢复为普通 + 聚焦 → 遮罩可见。
- 处理完不自动退出，用户再点一次。
- 所有 `app.exit()` 改 `app.quit()`：`IpcEventName.Quit`（Ctrl+Q / 崩溃页）、托盘退出。
- 更新安装同样受拦截，确认后才装。

## 托盘菜单「结束」

- 不标灰。点太早仍是 toast（已知并接受：托盘下看不到，与「开始专注」不同，这条没有弹窗）。
- label：`min(minFinishDuration, focusDuration)` 换算成分钟；`0` 时只写「结束」，否则「结束(10min)」。
- 只在 `minFinishDuration` / `focusDuration` 变化时重建菜单。

## 更新通知

- `UpdateController` 从 `{!minimize && ...}` 里挪出，常驻；它 `render()` 返回 `null`。
- 迷你下「更新可用」的 confirm 按规则恢复普通窗口（会打断专注，已知代价）。
- 迷你下「下载完成」的 success notice 不恢复、可能被裁；`duration: 0`，恢复窗口后仍在。
- 重启不重放、关闭后不可恢复：维持现状。

## 明确不做

- 不在托盘菜单加「选择项目」入口。
- 不把 `finishTooEarly` 从 toast 升级。
- 不标灰、不做打开菜单时的实时判定（要放弃 `setContextMenu` 改 `popUpContextMenu`，主进程拿不到实时已用时长）。
- 不记住迷你前的尺寸。
- 不重放更新事件，不加「已就绪」入口。

## 测试

- `planWindowAttention` 的四档 × 三类判定表，纯函数。
- 托盘菜单 label 的门槛计算。
- 退出阻止的判据（有未确认会话才拦）。
- 迷你下 `UpdateController` 仍挂载。
