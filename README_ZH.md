<p align="center">
  <img src="https://i.postimg.cc/hvjXfB94/icon.png" width="360"/>
</p>

<p align="center">
    <a href="README.md">
      <img src="https://flagcdn.com/w40/us.png" width="22" alt="United States flag">
      English
    </a>
</p>

# 番茄日志 Pomodoro Logger Enhanced :clock930:

> **轻松投资你的时间**

原版仓库：[Pomodoro Logger](https://github.com/zxch3n/PomodoroLogger)

<img align="right" src="https://i.postimg.cc/0j8FJ70x/image.png" height="280"/>

- 使用[番茄工作法](https://zh.wikipedia.org/wiki/番茄工作法)管理你的时间
- 在**本地**收集并可视化你的桌面工作活动，例如正在使用的应用名称和标题
- 使用内置的看板（Kanban Board），更精准控制项目进度
- 分析你的工作效率

## 增强功能

- 历史视图（History View）
  * 新增年份选择器。
  * 点击热力图格子时，可切换显示当天的饼图状态和词云。
  * 支持自定义日历热力图基色。
- 看板（Kanban）
  * 显示任务创建时间。
  * 卡片编辑器支持任务框、加粗、斜体、删除线、链接等快捷操作。
  * 支持为卡片添加标签并自定义标签颜色。
  * 支持更好的标签搜索、标签建议、点击标签进行过滤。

## 番茄工作法 :tomato:

番茄工作法将工作循环拆分为 25 分钟的专注时段和 5 分钟的休息时段。在工作时段内，用户应专注于一个待办事项，不做任何无关的事情。番茄工作法可以极大提高工作与学习效率，并缓解工作疲劳。

在 Pomodoro Logger 中，应用会在工作时段内记录你在电脑上使用的应用名称和标题。应用标题包含丰富的语义信息。例如，浏览器标题包含你正在浏览的网页标题，IDE 通常会提供项目路径或项目名称。

- `Pomodoro Technique - Wikipedia - Google Chrome`
- `DeepMind (@DeepMindAI) | Twitter - Google Chrome`
- `pomodoro-logger [C:\code\pomodoro-logger] .\src\renderer\components\src\Application.tsx - WebStorm`

通过将你的待办事项与相应的番茄时段记录关联起来，你可以分析自己被邮件和社交软件打断的频率，以及完成任务时所用应用和应用标题的时间分布。这将帮助你更全面地了解自己在电脑上的工作时间。

## 效率分析

Pomodoro Logger 维护一个"分心应用"列表（你可以在设置中配置）。当检测到你正在使用分心应用时，你的效率就会降低。

它通过[一种启发式方法](./src/shared/efficiency/efficiency.png)计算用户效率。

效率以圆点的方式展示：圆点中的空洞越大，说明效率越低。

<img width="150px" src="https://i.postimg.cc/Kzth8088/da.gif"/>

点击圆圈可以查看详细记录。

<p align="center">
    <img width="600px" src="https://i.postimg.cc/SKWhN9Vb/image.png"/>
</p>

# 数据 :chart_with_upwards_trend:

Pomodoro Logger 只在你处于番茄工作时段时记录你的桌面活动。

它只记录你的应用活动，包括当前聚焦应用的名称和标题。

你可以在设置中导入 / 导出 / 删除所有数据。

所有数据都在**本地**保存和处理。

# 看板

Pomodoro Logger 内置了[看板](https://en.wikipedia.org/wiki/Kanban_board)，帮助你轻松组织和估算待办事项所花费的时间。

看板中的列表分为 `Todo`（待办）、`In Progress`（进行中）和 `Done`（已完成）。虽然列表可以自定义，但你需要保留 `In Progress` 和 `Done` 列表，以便跟踪、估算和分析项目的时间花费。你可以为每张待办卡片设置预估时间，Pomodoro Logger 会为你记录相应的实际耗时。例如，当你专注于某个看板时，它会自动将你的番茄时段与该看板 `In Progress` 列表中的待办卡片关联起来，从而使进一步的分析成为可能。

为了让统计更加准确，建议尽量保持 `In Progress` 列表中的卡片数量最少，以精确反映你正在专注的任务。

# 下载

支持 Windows 10 / macOS / Linux。

请前往[发布页面](https://github.com/NightZed/PomodoroLogger-Enhanced/releases)下载。

# 参与贡献

欢迎你的参与！详情请阅读[贡献指南](./.github/CONTRIBUTION.md)。

- 路线图见 [issue 页面](https://github.com/NightZed/PomodoroLogger-Enhanced/issues)
- 如果发现 bug 或想要新功能，请[创建 issue](https://github.com/NightZed/PomodoroLogger-Enhanced/issues)
- 如果你想着手处理某个 issue，请阅读[贡献指南](./.github/CONTRIBUTION.md)并在该 issue 下留言告知

# 截图


| **番茄钟**                                                                   | **在托盘显示倒计时**                                                    |
| :--------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| <img src="https://i.postimg.cc/Fs87Gx0w/choose-Focuse.gif" width="256"/>     | <img src="https://i.postimg.cc/LsMhF6CT/tray.png" width="256"/>         |
| **时段结束**                                                                 | **切换模式**                                                            |
| <img src="https://i.postimg.cc/fT9wWQ0g/session-Finished.gif" height="256"/> | <img src="https://i.postimg.cc/DZp202gR/switch-Mode.gif" height="256"/> |

| **看板**                                                                 | **可拖拽卡片**                                                            |
| :----------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| <img src="https://i.postimg.cc/rs136CfV/Kanban-Board.png" height="256"/> | <img src="https://i.postimg.cc/7Zrqft3P/moving-Around.gif" height="256"/> |
| **估算你的时间花费**                                                     | **搜索你的卡片**                                                          |
| <img src="https://i.postimg.cc/HxRzScHp/todo.png" height="256"/>         | <img src="https://i.postimg.cc/CLBKZf97/search-Card.gif" height="256"/>   |

| **可视化**                                                      |
| :-------------------------------------------------------------- |
| <img src="https://i.postimg.cc/CKH5hT9V/vis.png" width="512"/>  |
| <img src="https://i.postimg.cc/d150CRqH/vis1.png" width="512"/> |



# 许可证


[GPL-3.0 License](./LICENSE)

Copyright © 2019 Zixuan Chen.
