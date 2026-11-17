# 看板长列表窗口化（虚拟化）

状态：已实现，可日常使用；余下几项见「未完成」。

## 背景

真实数据下，一列 500 张卡时，拖拽开始（lift）约 1 秒，落位结束还会再卡 0.8–1.2 秒。

原因不在卡片样式或 Redux：

- `@hello-pangea/dnd` 在 `onBeforeDragStart → onDragStart` 之间，对**每个已注册的 `Draggable`** 调 `getBoundingClientRect` + `getComputedStyle`，500 个同步跑完；
- 落位动画结束时，`transitionend` 里的 `flushSync(dropAnimationFinishedAction)` 让这 500 个 `Draggable` 一起同步重渲染。

实测（同一台机器、同一看板）：

| 配置                       | 挂载 DOM | 注册的 Draggable | lift   |
| -------------------------- | -------- | ---------------- | ------ |
| 原始                       | 500      | 500              | 1020ms |
| 只裁剪注册（保留全部 DOM） | 500      | ~30              | 300ms  |
| 窗口化（40 张）            | 40       | 40               | ~50ms  |

关键结论：**lift 跟随 DOM 数量**。只减少注册数量不够，因为测量一个元素会强制整个滚动容器重新布局，500 张卡的布局成本躲不掉。所以必须减少同时挂载的 DOM。

## 目标

1. 列内只挂载视口附近的卡片，其余用 spacer 撑滚动高度。
2. 拖拽 lift 与列长度无关，稳定在几十毫秒。
3. 窗口内卡片的 markdown、拖拽、落点与之前完全一致。
4. 打开看板不因为"一次解析 40 份 markdown"而顿一下。

不做：

- 不引入 `react-window` / `react-virtualized`。
- 不使用 `Droppable mode="virtual"`。它要求 `renderClone` 且不能有 placeholder，对本项目的收益不足以抵消状态机风险；窗口冻结 + 标准模式已经稳定。
- 不改变数据层、`moveCard` / `moveList` 的索引语义。

## 实现

### 窗口

`components/Kanban/List/List.tsx`：

```ts
WINDOW_SIZE = 40; // 一次至少挂 40 张
WINDOW_OVERSCAN = 800; // 视口上下各 800px
ESTIMATED_CARD_HEIGHT = 140; // 未测量卡片的兜底高度
```

- `offsets[i]` 是第 i 张卡的顶部像素位置，由高度累加得到。
- 起点 / 终点在 `offsets` 上二分查找 `scrollTop ± 800px`；
- `start` 至少保证 `start + 40 <= total` 的窗口长度；
- 顶部 spacer 高 `offsets[start]`，底部 spacer 高 `totalHeight - offsets[end]`。

`Cards` 的 `onScroll` 更新 `scrollTop` / `viewportHeight`，只在窗口移动时重新渲染。滚动容器仍然是 `Cards`（`overflow-y: overlay`），不是外部容器。

### 高度测量与估算

每张卡在 `CardContainer` 上带 `data-card-id`。窗口渲染后：

```ts
height = element.getBoundingClientRect().height + 8; // 8px 是 CardContainer 的 margin-top
```

- 实测值存进 `heightsRef: Map<cardId, height>`；
- 阈值 0.5px，子像素差异不触发更新；
- 只有窗口或数据变化时测量（依赖 `[start, end, filteredCards]`），滚动不每帧测量；
- 从未渲染过的卡片用 `ESTIMATED_CARD_HEIGHT` 兜底。

因此 `offsets` 是「实测 + 估算」混算。**没滚动过的区域是估算的**：滚进去时实测值替换估算，`offsets` 会修正一次，可能看到轻微跳动。这不是渲染错误，是可变高度虚拟化的固有代价。

### 估算与三态卡片视图

看板右上角的 `CardView` 有三态（`Kanban.tsx` 的 `CARD_VIEW_OPTIONS`）：

| 视图      | 卡片高度       | 说明                                    |
| --------- | -------------- | --------------------------------------- |
| `title`   | 最矮、最稳定   | 只显示标题、时间、标签和 badges         |
| `preview` | 中等、有上限   | markdown 容器 `maxHeight: 250px`        |
| `full`    | 最高、差异最大 | markdown 不限高，长内容会把卡片拉得很长 |

长列表滚动时通常切到 `title` 或 `preview`，估算更准。调整 `ESTIMATED_CARD_HEIGHT` 要按实际常用的视图来，**不要拿 `full` 视图的平均高度当基准**，否则切到 `title` 后窗口会持续偏大、spacer 偏高。

### dnd 集成

- 窗口内每张卡都注册（`Card` 的 `inWindow`），因为窗口已经是"用户正在看的一段"。
- `alwaysDraggable` 给首尾卡片当哨兵：dnd 用「它认识的最后一张 draggable」推导"插到末尾"的 index。窗口包含首/尾时，index 是真实的 0 或 `length - 1`。
- **限制**：窗口停在列表中间时，首尾两张没有 DOM，哨兵不存在。此时 dnd 认为列表只有窗口这一段。要拖到远端，先把目标区域滚进窗口。

### 拖拽期间冻结窗口

`components/Kanban/dragActivity.ts`：

```ts
export const dragActivity = { dragging: false };
```

- `Board.tsx` 的 `onDragStart` / `onDragEnd` 设置它；
- `List.tsx` 的 `onWindowScroll` 在 `dragging` 时直接 return，窗口不移动。

窗口化之后不再按视口给卡片禁用位移过渡。窗口只有 40 张，混用两种过渡长度会让同一批被挤开的卡片速度不一致：视口内的走 200ms，视口外的瞬移，跨边界时还会中途切换，表现成相邻两张卡一前一后、互相覆盖。

原因：窗口移动会卸载窗口外的卡片；如果卸载的是正在拖的源卡片，dnd 会抛 `Cannot find draggable entry`（这个错误在窗口化之前已经出现过两次，见 `.scratch` 之外的提交历史）。

用模块级可变对象而不是 React state/context，是因为 `setDragging(true)` 会让 500 个 `Card` 重渲染一次，本身就是几百毫秒的卡顿。

### 顶部 / 底部淡出

列表顶部和底部各有一条 `0.6rem` 的渐变遮罩，颜色是列表体背景 `--pl-bg-sunken`。

- **不能用 `mask-image`**：它会在滚动容器上创建包含块，dnd 的 `position: fixed` 拖拽层改为相对 `Cards` 定位并被裁剪，表现是拖拽中的卡片掉到列表和看板面板下面。
- **遮罩不能放在 `Cards` 里**：滚动容器的绝对定位子元素会随内容滚走，滚动后遮罩不在顶部。
- 顶部遮罩放在不滚动的 `ListBody`（`position: relative`）里，`position: absolute; top: 0`，`z-index: 1`。它不占 `Cards` 的内容盒，dnd 的测量不受影响。
- 不能用 `sticky` 做顶部：`Cards` 的 `padding-top`（为空列表落位保留的 19.6px）会把 sticky 的 content box 起点推下，遮罩最上只能到 17.6px，在卡片上留下一条背景色带。
- 底部 `AfterPlaceHolder` 仍在 `Cards` 内：底部没有 padding 干扰，`position: sticky; bottom: -2px` 可以正确贴底。

### 内容分批

`inWindow` 只决定「是否注册给 dnd」，markdown 解析另走 `contentLimit`：

```ts
CONTENT_INITIAL = 8; // 首帧完整解析的卡片数
CONTENT_BATCH = 8; // 之后每帧追加
```

- 打开看板时首帧只解析 8 份 markdown，其余显示 `CardPreview`；
- 每帧 +8，40 张在 5 帧内补齐（约 80ms）；
- 列表或搜索切换时重置；
- 窗口滚动到新区域时不重置——那时 `contentLimit` 已经是 40，新卡片直接完整渲染。

两者不能合并成一个开关：合并后打开看板会一次解析 40 份 markdown，用户看到的就是一次明显顿挫。

## 实测与验收

拖拽启动的耗时（`onBeforeDragStart → onDragStart`，dnd 测量每个已注册的 draggable 并首次 publish）用 DevTools Performance 录制一次拖拽查看：拖拽最初的那一段主线程占用应在几十毫秒内，而不是随列长度增长。

代码里不保留计时探针，避免常态控制台输出。

## 实际操作建议

卡片很多时，直接拖到目标列表的远端位置是不可行的（窗口外的卡片没有 DOM）。实际用法：

1. 先把卡片拖到另一个短列表；
2. 滚动原列表找到插入点；
3. 把卡片从短列表拖回去。

不要为了省这一步把 `WINDOW_SIZE` 调大——那只是把 50ms 换回 1s。

## 未完成

| 项                         | 影响                           | 方向                                                                        |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| 未渲染区域高度是估算的     | 滚进新区域时可能跳动           | 用 `ResizeObserver` 持续更新高度；offsets 修正时做滚动锚点补偿              |
| 内容编辑后高度变化         | 只在下一次窗口变化时重测       | 同上                                                                        |
| 拖拽中自动滚动到未渲染区域 | 窗口冻结，落点钳制到已注册卡片 | 拖拽期间允许窗口"只增不减"地扩展                                            |
| 跨长距离拖拽               | 需要先滚过去                   | 与上一条同源                                                                |
| 滚动/测量的自动化测试      | jsdom 没有布局，只能手动验证   | 在 jsdom 里 mock `getBoundingClientRect` 覆盖窗口算术；真实滚动用端到端测试 |

## 涉及文件

- `src/renderer/components/Kanban/List/List.tsx`：窗口、offsets、测量、spacer、contentLimit
- `src/renderer/components/Kanban/Card/Card.tsx`：`inWindow` / `renderContent` / `data-card-id`
- `src/renderer/components/Kanban/dragActivity.ts`：拖拽冻结标志
- `src/renderer/components/Kanban/Board/Board.tsx`：设置拖拽标志
- `src/renderer/components/Kanban/List/List.test.tsx`：窗口算术测试（含 `getBoundingClientRect` mock）
