# 看板总览卡片：预估准确度的呈现

Status: implemented（分子分母口径待定，见「待定」）

## 背景

看板总览（`Board/Overview.tsx` 的卡片视图）每张卡片底部有一行徽章：番茄点数、耗时/剩余、预估准确度。

准确度原来是一个 Shields 风格的双段徽章（`Badge` 组件）：左段灰底印英文 `accuracy`，右段是等级色块印「完美 / 良好 / 一般 / 较差 / 很差」，顶部叠 10% 白色高光。两个问题：

1. **宽度放不下**：卡片内容区 248px，番茄点 20 + TimeBadge 174 之后只剩 54px，而徽章要 93px。`BadgeHolder` 是普通块级容器、子元素走 inline 流，于是徽章被挤到第二行，左边空一大块。
2. **风格不搭**：灰底英文标签 + 高饱和色块 + 斜高光属于「外链/构建状态」的 web 纹章语言，而卡片里其它元素是单色圆（`#b3775b`）和低对比直角块；`#ffe313` 这类写死的十六进制与 `--pl-bg-elevated` 无关，浅色主题下它是整张卡片最亮的东西。

## 决策

| 项         | 结论                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| 位置       | 与番茄点数、耗时同一行的最右端（`BadgeHolder` 改 flex，读出 `margin-left: auto`） |
| 内容       | 等级字母：`A-` / `A` / `A+` / `S` / `SSS`（不显示百分比）                 |
| 等级       | 五档，误差越小等级越高；阈值沿用卡片原来的 5 / 10 / 20 / 30              |
| 样式       | 单色斜体，颜色字号字重与左边 TimeBadge 里的小时数一致（`var(--pl-text)` / 12px / 600 / `italic`）；文字颜色不随等级变化 |
| 外圈       | 2px `#e53935` 规则椭圆，所有等级都画；灵感是试卷上用红笔圈出等级               |
| 水平位置   | 吃掉番茄点与 TimeBadge 之后的剩余宽度（54px）并在其中居中，不再贴右边缘 |
| tooltip    | 只有「预估准确度」/「Estimate accuracy」                                 |
| 无数据     | 不渲染、不占位（右端允许参差）                                           |
| 数值口径   | 与表格「平均误差」列同源：同一个误差公式、同一个均值                     |

| 平均误差 | 等级  |
| -------- | ----- |
| < 5%     | `SSS` |
| < 10%    | `S`   |
| < 20%    | `A+`  |
| < 30%    | `A`   |
| 其余     | `A-`  |

等级字母是评分刻度，不是文案，所以不进 i18n catalog（`zh.ts` / `en.ts` 里只留 `kanban.brief.accuracy` 作为 tooltip）。原来五档「完美 / 良好 / 一般 / 较差 / 很差」的文案 key 已在改造过程中删除。

## 数值一致性

表格列（`Overview.tsx` 的 `meanPercentageError`）原来是 `${text.toFixed(2)}%`，卡片这边一度写成 `±${Math.round(avgErr)}%`（四舍五入 + 正负号），两边会给出不同的数。现在：

- `Board/accuracy.ts` 提供 `cardPercentageError(card, isDone)`、`formatPercentageError(value)`、`accuracyGrade(value)`；
- `tableAggregation.ts`（表格的行数据）与 `BoardBrief.tsx`（卡片）共用同一个误差公式和同一个均值；
- 表格用 `formatPercentageError` 打百分比，卡片用 `accuracyGrade` 把同一均值换成等级字母。

`cardPercentageError` 在「不在 done 列表」或「预估/实际任一为 0」时返回 `undefined`——这类卡不能评级，但仍计入分母 `n`（见「待定」）。

## 红圈

圈是绝对定位的伪元素（`AccuracyGrade::after`，`inset: -3px -5px`、`border: 2px solid #e53935`、`border-radius: 50%`），不参与布局：

- 徽章行仍是 20px 高，卡片高度不变；椭圆上下各溢出 3px，落在 Divider 与卡片内边距里，不会压到别的元素；
- 圈的最大情形是 `SSS`：文字约 25px + 左右内边距 12px + 伪元素外扩 10px ≈ 47px，仍在 54px 预算内，不会碰到 TimeBadge；
- 结构上分成 `AccuracySlot`（`flex: 1 1 auto` + 居中）和 `AccuracyGrade`（文字 + 圈）两层，圈跟文字宽度走，`A-` 的圈自然比 `SSS` 窄。

## 实现

- `src/components/Visualization/Badge/Badge.tsx`：删掉双段 `Badge`（全仓库只有看板总览用），新增 `AccuracyReadout`（纯文字、`margin-left: auto`、无主题依赖）。
- `src/renderer/components/Kanban/style/Badge.ts`：`BadgeHolder` 改 `display: flex` + `nowrap`，子项 `flex: none`，并清零 SVG 的 2px 底边距（flex 居中后会整体上移 1px）。`collapsed` 变体不变；该样式被 `Card.tsx` 的标题卡共用，改动已在那条路径复核。
- `src/renderer/components/Kanban/Board/accuracy.ts`：共享的误差公式与格式化。
- `src/renderer/components/Kanban/Board/BoardBrief.tsx`：聚合里用 `cardPercentageError`，`showErr` 仍表示「至少一张可评级的已完成卡」。
- i18n：`kanban.brief.accuracy` 保留，`perfect/good/fair/poor/bad` / `accuracyDetail` 删除。

## 待定

**分子与分母不一致。** 分子只累加「预估和实际都填了」的已完成卡，分母 `n` 是 Done 列表的全部卡片数。没填预估的已完成卡按 0 误差摊进平均，所以百分比偏乐观：一张 3h/2h 的卡（误差 50%）旁边若有一张没填预估的已完成卡，显示的是 25%。

这是表格一直以来的口径，卡片现在跟着它。改口径要两处一起改（共享函数本身），单独动一处会让卡片和表格再次分叉。

## 测试

- `BoardBrief.test.tsx`：等级 `SSS / S / A+ / A / A-`（对应误差 0% / 6.67% / 14.29% / 25% / 400%）；无时间的已完成卡不显示读出；卡片给出的等级等于 `accuracyGrade(aggregateBoardRows 的均值)`（两张已完成卡、其中一张没填时间，正好是口径最容易分叉的用例）。
- `Overview.table.test.ts`：聚合出的 `meanPercentageError`（已完成卡 2h/1h → `100`，没有可评级的卡 → `undefined`）。
