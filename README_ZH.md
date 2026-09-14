<p align="center">
  <img src="./screenshots/icon.png" width="180"/>
</p>

<p align="center">
    <a href="README.md">
      <img src="https://flagcdn.com/w40/us.png" width="22" alt="United States flag">
      English
    </a>
</p>

<p align="center">
  <a href="https://github.com/NightZed/PomodoroLogger-Enhanced/actions/workflows/build.yml">
    <img src="https://github.com/NightZed/PomodoroLogger-Enhanced/actions/workflows/build.yml/badge.svg"/>
  </a>
  <a href="https://github.com/NightZed/PomodoroLogger-Enhanced/releases/latest">
    <img src="https://img.shields.io/github/downloads/NightZed/PomodoroLogger-Enhanced/total"/>
  </a>
  <a href="https://github.com/NightZed/PomodoroLogger-Enhanced/releases">
    <img src="https://img.shields.io/github/v/release/NightZed/PomodoroLogger-Enhanced"/>
  </a>
  <a href="https://deepwiki.com/NightZed/PomodoroLogger-Enhanced">
    <img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki">
  </a>
</p>

# 番茄日志 Pomodoro Logger Enhanced :clock930:

> **轻松投资你的时间**

一个基于[番茄工作法](https://zh.wikipedia.org/wiki/番茄工作法)的桌面时间追踪器，用五步工作流轻松掌握工作学习时间：
**规划**任务 → **跟踪**专注 → **记录**桌面活动 → 本地**处理** → **可视化**回看。

本仓库是[原版 Pomodoro Logger](https://github.com/zxch3n/PomodoroLogger) 的增强版，在其基础上对卡片编辑、历史视图回顾、内存使用、CPU占用等进行了优化。

## ✨ 五步工作流

<img align="right" src="./screenshots/history-main-view.png" height="300"/>

1. 🗺️ **规划 Plan** —— 用看板组织和预估任务
   - 看板列表（`Backlog` / `Todo` / `In Progress` / `Done`）
   - 卡片拖拽、预估耗时 vs 实际耗时
2. ⏱️ **跟踪 Track** —— 番茄工作法专注计时
   - 跟踪任务耗时、番茄钟数
   - 专注 / 休息提醒
3. 📝 **记录 Record** —— 自动记录桌面活动
   - 自动记录正在使用的应用名称与标题
4. 🔧 **处理 Process** —— 本地处理与效率计算
   - 关联任务与专注时段
   - 分心应用检测、效率启发式算法
   - 数据导入 / 导出 / 删除，全程**本地**
5. 📊 **可视化 Visualize** —— 回看每一天的时间去向
   - 效率圆点
   - 日历热力图、饼图、词云

## ① 🗺️ 规划：看板管理任务

内置[看板](https://en.wikipedia.org/wiki/Kanban_board)并与番茄钟联动：在某个看板专注时，番茄时段会自动关联到该看板 `In Progress` 列表中的卡片，并记录每张卡片的**预估耗时 vs 实际耗时**。

列表分为 `Backlog`（待办）、`Todo`（今日待办）、`In Progress`（进行中）、`Done`（已完成）。你可以自定义列表，但请保留 `In Progress` 与 `Done` 两个列表，以便跟踪、估算和分析时间花费。

> 💡 提示：`In Progress` 中的卡片越少，统计越准确。

| **看板**                                                 | **拖拽卡片**                                              |
| :------------------------------------------------------- | :-------------------------------------------------------- |
| <img src="./screenshots/Kanban-Board.png" height="256"/> | <img src="./screenshots/moving-Around.gif" height="256"/> |
| **估算时间花费**                                         | **搜索卡片**                                              |
| <img src="./screenshots/todo.png" height="256"/>         | <img src="./screenshots/search-Card.gif" height="256"/>   |

<details>
<summary><b>🗂️ 看板增强</b> —— 富文本卡片 · 彩色标签 · 显示创建时间</summary>

<br>

- **卡片编辑器**：支持任务框（`[ ]`）、**加粗**、*斜体*、~~删除线~~、链接等快捷操作。
- **彩色标签**：支持颜色标签，支持标签建议与搜索，支持**点击标签过滤**。
- **任务创建时间**：每张卡片显示创建时间。

![看板 - 卡片编辑与标签](./screenshots/kanban-card-editor.png)
</details>

## ② ⏱️ 跟踪：番茄工作法

一个工作循环 = **25 分钟专注 + 5 分钟休息**。应用会跟踪任务耗时，自动累计番茄钟数。在每个阶段结束时自动提醒。

| **选择专注对象**                                             | **托盘显示倒计时**                                      |
| :----------------------------------------------------------- | :------------------------------------------------------ |
| <img src="./screenshots/choose-Focus.gif" width="256"/>      | <img src="./screenshots/tray.png" width="256"/>         |
| **时段结束**                                                 | **切换模式**                                            |
| <img src="./screenshots/session-Finished.gif" height="256"/> | <img src="./screenshots/switch-Mode.gif" height="256"/> |

## ③ 📝 记录：桌面活动追踪

在专注时段内，应用会自动记录你正在使用的应用**名称**与**标题**。标题富含语义信息：浏览器标题对应当前网页，IDE 标题则包含项目名。

- `Pomodoro Technique - Wikipedia - Google Chrome`
- `DeepMind (@DeepMindAI) | Twitter - Google Chrome`
- `pomodoro-logger [C:\code\pomodoro-logger] .\src\renderer\components\src\Application.tsx - WebStorm`

通过这些记录来回顾时间去向——在"可视化"阶段，你可以看到**饼图**（各项目/应用时间占比）与**词云**（主题关键词）。

<p align="center">
  <img width="512" src="./screenshots/time-proportion-pie-chart.png" alt="时间占比饼图"/>
  <img width="512" src="./screenshots/word-cloud.png" alt="词云"/>
</p>

## ④ 🔧 处理：本地数据与效率

- 所有记录**仅保存在本地**，绝不上传；可在设置中一键**导入 / 导出 / 删除**。
- 在设置中维护一份"分心应用"列表，一旦检测到正在使用其中的应用，该时段的效率即通过[一种启发式方法](./src/shared/efficiency/efficiency.png)计算而降低。
- 将任务与专注时段关联后，你可以分析"被邮件 / 社交软件打断的频率"，以及"完成某个任务用到了哪些应用"，更全面地了解自己的时间流向。

<p align="center">
  <img width="600" src="./screenshots/sankey-diagram.png" alt="分心桑基图"/>
</p>

## ⑤ 📊 可视化：历史视图与效率回看

**历史视图**把所有记录汇总到一张日历热力图上，并对每一天做深度剖析；**效率**则以圆点呈现：**圆点中的空洞越大，效率越低**，点击圆点即可查看该时段的详细记录。

<p align="center">
  <img width="150" src="./screenshots/da.gif" alt="效率圆点演示"/>
</p>

<p align="center">
  <img width="640" src="./screenshots/heatmap.png" alt="日历热力图"/>
</p>

<details>
<summary><b>📌 历史视图增强</b> —— 年份切换 · 项目消耗时间 · 自定义基色</summary>

<br>

- **年份选择器**：支持切换年份（也可查看全部时间）。
- **项目消耗时间**：支持按项目 + 年份统计总耗时与番茄钟数量。
- **历史记录回顾**：点击热力图中任意一天，即可查看当天的**饼图**与**词云**；切换项目和年份也会显示对应的**饼图**与**词云**。
- **自定义基色**：可在设置中自定义热力图基色。

</details>

## 🚀 快速开始

支持 **Windows 10 / macOS / Linux**，可从[发布页面](https://github.com/NightZed/PomodoroLogger-Enhanced/releases)下载对应平台的安装包。

## 🤝 参与贡献

欢迎你的参与！详情请阅读[贡献指南](./.github/CONTRIBUTION.md)。

- 路线图见 [issue 页面](https://github.com/NightZed/PomodoroLogger-Enhanced/issues)
- 发现 bug 或想提新功能，请[创建 issue](https://github.com/NightZed/PomodoroLogger-Enhanced/issues)
- 想动手处理某个 issue，阅读[贡献指南](./.github/CONTRIBUTION.md)并在 issue 下留言即可

## 📄 许可证

[GPL-3.0 License](./LICENSE)

Copyright © 2019 Zixuan Chen —— 原版作者。
