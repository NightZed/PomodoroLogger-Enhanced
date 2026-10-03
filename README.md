<p align="center">
  <img src="./screenshots/promo-head-mini.png" width="200" alt="Mini Mode promo head image"/>
</p>

<p align="center">
  <img src="./screenshots/promo-head-compact.png" height="400" alt="Small Screen promo head image"/>
</p>

<p align="center">
    <a href="README_ZH.md">
      <img src="https://flagcdn.com/w40/cn.png" width="22" alt="China flag">
      中文
    </a>
</p>

<p align="center">
  <a href="https://github.com/NightZed/PomodoroLogger-Enhanced/actions/workflows/test.yml">
    <img src="https://github.com/NightZed/PomodoroLogger-Enhanced/actions/workflows/test.yml/badge.svg" alt="Test status"/>
  </a>
  <a href="https://github.com/semantic-release/semantic-release">
    <img src="https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release" alt="semantic-release"/>
  </a>
  <a href="https://github.com/NightZed/PomodoroLogger-Enhanced/releases/latest">
    <img src="https://img.shields.io/github/downloads/NightZed/PomodoroLogger-Enhanced/total" alt="Downloads"/>
  </a>
  <a href="https://github.com/NightZed/PomodoroLogger-Enhanced/releases">
    <img src="https://img.shields.io/github/v/release/NightZed/PomodoroLogger-Enhanced" alt="Latest release"/>
  </a>
  <a href="https://deepwiki.com/NightZed/PomodoroLogger-Enhanced">
    <img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"/>
  </a>
</p>

# Pomodoro Logger Enhanced 🕢

> **Invest your time easily**

Pomodoro Logger 🕢 [^1] —— [Pomodoro Technique](https://en.wikipedia.org/wiki/Pomodoro_Technique) [^2] + [Kanban task management](https://en.wikipedia.org/wiki/Kanban_board) [^3] + desktop activity tracking + data visualization.

[^1]: This repository is an enhanced edition of the [original Pomodoro Logger](https://github.com/zxch3n/PomodoroLogger), with a focus on **theme**, **card editing** and **history view review**, plus optimizations to **memory usage and CPU usage**.

[^2]: The Pomodoro Technique is a time management method developed by Francesco Cirillo in the late 1980s.It uses a kitchen timer to break work into intervals, typically 25 minutes in length, separated by short breaks. Each interval is known as a pomodoro, from the Italian word for tomato.

[^3]: Kanban (Japanese: 看板, meaning signboard or billboard), origin in Toyota automotive company in the 1940s, is a lean method to manage and improve work across human systems. This approach aims to manage work by balancing demands with available capacity, and by improving the handling of system-level bottlenecks.

> 🧭 Contents: [Overview](#overview) · [Pomodoro](#pomodoro) · [Kanban](#kanban-board) · [Statistics](#statistics) · [Features](#features) · [Quick Start](#quick-start)

<a id="overview"></a>

## 📖 Overview

> Below: the Kanban (p1) and the History view (p2) — from planning tasks to reviewing your time.

<p align="center">
  <img width="800" src="./screenshots/kanban.png" alt="Kanban"/>
  <img width="800" src="./screenshots/history-main-view.png" alt="History view"/>
</p>

<a id="pomodoro"></a>

## ⏱️ Pomodoro

A work cycle = **focus + rest**: 25 minutes of focus and a 5-minute short break by default, plus a longer long break. All three durations can be adjusted in the settings.

After creating a task on the Kanban board, select it on the timer page to track the task.

<p align="center">
  <img width="800" src="./screenshots/normal-timer-shadow.png" alt="Normal Mode"/>
</p>

### Tray / Mini / Small / Night Mode / Transparency / Wallpaper

-   **Tray**: closing the main window minimizes the app to the system tray.

<p align="center">
  <img width="100" src="./screenshots/tray.png" alt="Countdown in the system tray"/>
</p>

-   **Mini mode**: use `F12` to switch between the full interface and mini mode.

<p align="center">
  <img width="200" src="./screenshots/mini-day-shadow.png" alt="Day Mini Mode"/>
  <img width="200" src="./screenshots/mini-night-shadow.png" alt="Night Mini Mode"/>
</p>

-   **Small Mode**：use `F11` to switch between the full interface and small mode.

<p align="center">
  <img height="300" src="./screenshots/compact-wallpaper-day-shadow.png" alt="Day Small Mode"/>
  <img height="300" src="./screenshots/compact-wallpaper-night-shadow.png" alt="Night Small Mode"/>
</p>

-   **Night Mode / Transparency / Wallpaper**：switch between day and night mode. Support free setting of application transparency and wallpaper.

<p align="center">
  <img width="400" src="./screenshots/normal-day-night-shadow.png" alt="Night Mode"/>
  <img width="400" src="./screenshots/setting-shadow.png" alt="Setting View"/>
</p>

<a id="kanban-board"></a>

## 🗃️ Kanban

### Boards & Lists

The built-in [Kanban board](https://en.wikipedia.org/wiki/Kanban_board) works together with the Pomodoro timer.

-   **Lists**: `Backlog`, `Todo`, `In Progress`, and `Done`. The names match the interface; you can customize the lists, but please keep `In Progress` and `Done`, otherwise time cannot be tracked, estimated, or analyzed.
-   **Linked to the timer**: while you focus on a board, your focus sessions are automatically linked to the cards in that board's `In Progress` list.
-   **Actions**: drag cards between lists; press `Ctrl+F` to search cards.

> 💡 Tip: the fewer cards in `In Progress`, the more accurate your statistics.

<p align="center">
  <img width="800" src="./screenshots/kanban-board-shadow.png" alt="Kanban board"/>
  <img width="800" src="./screenshots/kanban-shadow.png" alt="Kanban"/>
</p>

### 🃏 Cards

-   **Markdown editing**: card content supports Markdown, and the editor offers quick actions for task boxes (`[ ]`), **bold**, _italic_, ~~strikethrough~~, and links.
-   **Colored labels**: colored labels with suggestions and search, plus **click-to-filter**.
-   **Creation / completion time**: boards and cards both show their creation time, and a card shows its completion time once it is dragged into `Done`.
-   **Estimated time**: set an estimate on a card, and the Pomodoro timer accumulates the actual time spent.

<p align="center">
  <img width="800" src="./screenshots/kanban-card-editor-shadow.png" alt="kanban Card Editor"/>
</p>

<a id="statistics"></a>

## 📊 Statistics

### 📈 Time Spent per Project

Total time and pomodoro count, broken down by **project + year**.

<p align="center">
  <img width="480" src="./screenshots/project-cost-time.png" alt="Time spent per project"/>
</p>

### 🗓️ Calendar Heat Map

The **History view** aggregates all records into a calendar heat map: the denser the color, the more time you put in that day. You can switch between years or view all time, and click any day to expand its details. The base color of the heat map can be customized in the settings.

<p align="center">
  <img width="720" src="./screenshots/heatmap.png" alt="Calendar heat map"/>
</p>

### ⚡ Efficiency Analysis

**Efficiency** is shown as dots: **the larger the hole in a dot, the lower your efficiency**. Click a dot to open the distraction Sankey diagram of that session. How efficiency is computed: see [Efficiency & Distractions](#efficiency-distraction).

<p align="center">
  <img width="160" src="./screenshots/da.gif" alt="Efficiency dots demo"/>
</p>

The **Sankey diagram** connects distracting apps with where your time went.

<p align="center">
  <img width="520" src="./screenshots/sankey-diagram.png" alt="Distraction Sankey diagram"/>
</p>

### 🥧 Time Proportion Pie Chart · Word Cloud

The **pie chart** shows the share of time per project / app, and the **word cloud** shows the keywords that appear most often in window titles. Click a day on the heat map, or switch the project and year, and the charts update accordingly.

<p align="center">
  <img height="270" src="./screenshots/time-proportion-pie-chart.png" alt="Time proportion pie chart"/>
  <img height="270" src="./screenshots/word-cloud.png" alt="Word cloud"/>
</p>

<a id="features"></a>

## ✨ Features

### 🖥️ Desktop Activity Tracking

-   **Apps & titles**: during focus sessions the app records the names and window titles of what you are using. A browser title reveals the page you are reading, while an IDE title contains the project name or file path.
-   **Scheduled screenshots** (optional): turn on `Screenshot` in the settings, and the app also keeps periodic screen captures during focus sessions for later review.

```text
Pomodoro Technique - Wikipedia - Google Chrome
DeepMind (@DeepMindAI) | Twitter - Google Chrome
pomodoro-logger [C:\code\pomodoro-logger] .\src\renderer\components\src\Application.tsx - WebStorm
```

These raw records are aggregated into the time proportion pie chart and word cloud in [Statistics](#statistics).

<a id="data-privacy"></a>

### 🔒 Data & Privacy

-   **Local storage**: all data is saved on your own machine.
-   **Export / import / delete**: back up, migrate, or clear everything with one click in the settings.
-   **Data directory**: `db/` holds the databases, `screenshots/` holds the periodic screenshots.

| Platform | Data directory                          |
| :------- | :-------------------------------------- |
| Windows  | `%APPDATA%\PomodoroLogger\`             |
| macOS    | `~/Library/Preferences/PomodoroLogger/` |
| Linux    | `~/.local/share/PomodoroLogger/`        |

<a id="efficiency-distraction"></a>

### 🎯 Efficiency & Distractions

-   **Distracting apps**: keep a list of "distracting apps" in the settings; whenever the app detects you using one of them, the efficiency of that session drops.
-   **Efficiency score**: computed by [a heuristic method](./src/shared/efficiency/efficiency.png) and shown as dots, see [Statistics](#statistics).
-   **Insights after linking**: once tasks are linked to their focus sessions, you can analyze how often you are interrupted by email / social apps, and which apps you actually used to get a task done.

### 🧩 System & Settings

-   **Durations**: focus / short break / long break durations are all adjustable in the settings.
-   **System tray**: the remaining time stays visible in the tray after minimizing, see [Pomodoro](#pomodoro).
-   **Start on boot · Auto update · Hardware acceleration**: toggle them in the settings; hardware acceleration changes need a restart to apply.
-   **Built-in guide**: the app walks you through the basics with step-by-step hints.

### ⌨️ Shortcuts

-   **Switch pages**: `Ctrl+Tab` / `Ctrl+Shift+Tab`.
-   **Search cards**: `Ctrl+F` (Kanban page).
-   **Quick Save**：`Ctrl+Enter`(Card edit).
-   **Quit**: `Ctrl+Q`.
-   **Mini mode**: `F12`.
-   **Small mode**：`F11`.

<a id="quick-start"></a>

## 🚀 Quick Start

Platforms: **Windows 10 / macOS 12+ / Linux**.
Download: [release page](https://github.com/NightZed/PomodoroLogger-Enhanced/releases).

## 🤝 CONTRIBUTING

Welcome! The development setup, coding conventions, and release process are all documented in [the CONTRIBUTING Guide](./.github/CONTRIBUTING.md).

-   The roadmap is shown on the [issue page](https://github.com/NightZed/PomodoroLogger-Enhanced/issues)
-   If you find a bug or want a new feature, [create an issue](https://github.com/NightZed/PomodoroLogger-Enhanced/issues)
-   If you want to start working on an issue, read [the CONTRIBUTING Guide](./.github/CONTRIBUTING.md) and comment on the issue to let me know

## 📄 License

[GPL-3.0 License](./LICENSE)

Copyright © 2019 Zixuan Chen —— the original author.

This repository is a GPL-3.0 modified version of Pomodoro Logger, released under GPL-3.0 as well.
