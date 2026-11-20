# 进程模型、IPC 与反馈层

> `AGENTS.md` 的「进程 / IPC / 弹窗提示」区域详情。新增 IPC 能力、加对话框或提示前先读这里；改完回 `AGENTS.md` 核对硬约束。

## 启动链路

`src/main/main.ts` 同步读取硬件加速设置（在 `app.ready` 之前），然后动态 import `src/main/init.ts`，由它创建无边框/透明 `BrowserWindow`（`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`）、托盘、关闭到托盘行为、窗口模式处理和自动更新。

硬件加速默认关闭（`disableHardwareAcceleration`）。这一条同时决定了大量渲染性能取舍，见 `renderer.md` 与 `kanban.md`。

## 渲染层如何触达主进程

渲染层只能通过 `src/main/preload.ts` 触达主进程，它暴露一个很窄的 `window.api`（`ExposedAPI`，定义在 `src/main/ipc/type.ts`）。

每个通道名、payload 结构和发送方都在主进程侧校验（`src/main/ipc/ipc.ts` 的 `handleCommand` + `src/main/ipc/validate.ts`）。

新增能力时，**类型联合、preload 方法和主进程 handler 要一起改**。少改一处不会报错，只会在运行时被校验层拒绝。

## 反馈层

应用内所有提示都走 `src/renderer/components/feedback`：`feedback.toast` / `notice` / `confirm` / `alert`。

直接 import antd 的 `message` / `notification` 会被 `no-restricted-imports` 拦下。

### 三种载体怎么选

**`kind: 'error'` 只能出现在 `alert` 或 `notice`，不再用 `toast`**：

| 载体     | 用途                             | 特征                                 |
| -------- | -------------------------------- | ------------------------------------ |
| `toast`  | 操作回执（成功、被拒绝、无变化） | 2 秒消失                             |
| `notice` | 数据丢失或需要事后排查的错误     | 持久、无遮罩、可带「打开日志文件夹」 |
| `alert`  | 需要用户当场确认                 | 有遮罩、阻塞                         |

走 notice 的错误必须先用 `reportDataFailure` / `logError` 落盘，否则按钮指向一个空文件。通知按指纹去重，不堆叠。

**弹窗与窗口档位**：迷你会隐藏整个 `.ant-modal-root`，notice 的 260px 最小宽度也放不进 200px 窗口。所以 `confirm` / `alert` / 错误 notice 在迷你与托盘下会先把窗口恢复成能显示它的形状；`toast` 和普通 notice 一律不动。判定表在 `feedback/attention.ts`，窗口动作走 `ShowWindowForAttention`，档位语义见 `window-modes.md`。不要在调用点另行判断。

### 对话框

内容型对话框必须用 `AppModal`（`src/renderer/components/AppModal.tsx`），它套了统一的「立即弹出」动效；直接 import antd 的 `Modal` 同样被拦。

**同帧关闭 + 打开要给 `instant`**：一个对话框在同一个 commit 里关闭、另一个打开时（例如「检查并修复数据」跳转到「校准应用时长」），必须给关闭的那个传 `instant`。antd 每个 Modal 自带一层 `rgba(0,0,0,0.45)` 的 mask，两层重叠一帧会把画面压到约 0.70 再回弹，看起来就是闪一下。

`instant` 用空 `transitionName` 让 rc-motion 跳过状态机、同帧卸载 mask；普通关闭仍要走那 1ms 淡出，否则面板会在 `display: none` 之前露一帧。

**两态必须同高**：任何先 loading 再出内容的对话框都要给两态同一个固定高度，否则打开后会被内容撑大。

**点击波纹全局关闭**：antd 的点击波纹在 `Application` 里被关掉，因为软件渲染（默认）会把那个 2 秒动画变成整窗 60fps 重绘。
