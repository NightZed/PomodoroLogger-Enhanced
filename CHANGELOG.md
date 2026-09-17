## [0.14.1](https://github.com/NightZed/PomodoroLogger-Enhanced/compare/v0.14.0...v0.14.1) (2026-09-17)


### Bug Fixes

* **update:** 修复明明已经是最新版但仍触发自动更新下载报错的问题 ([5820cda](https://github.com/NightZed/PomodoroLogger-Enhanced/commit/5820cda4892241dffb23f9585c3c6f3e18c7e1c4))


### Performance Improvements

* **history:** 优化加载历史数据时的表现效果 ([c77a74b](https://github.com/NightZed/PomodoroLogger-Enhanced/commit/c77a74b3462746a01f62493a491d2707267a52b4))
* **history:** 聚合计算下沉db worker并缓存结果，避免大数据量下切换卡顿 ([03fc0e2](https://github.com/NightZed/PomodoroLogger-Enhanced/commit/03fc0e2bfce609e925aeace7ebf9603aa1ab4e10))
* **kanban:** 优化大窗口下打开卡片时的卡顿效果 ([4df7f74](https://github.com/NightZed/PomodoroLogger-Enhanced/commit/4df7f74bf3d2e1aaaad612b563a1c063a25ce0b8))

# [0.14.0](https://github.com/NightZed/PomodoroLogger-Enhanced/compare/v0.13.0...v0.14.0) (2026-09-16)


### Bug Fixes

* create appdata base dir recursively so CI runners don't ENOENT ([aa8b01c](https://github.com/NightZed/PomodoroLogger-Enhanced/commit/aa8b01cea580ad5fd6ec4982f8710c551d5793f1))
* **lint:** 消除 prettier/tslint 格式冲突 ([f768575](https://github.com/NightZed/PomodoroLogger-Enhanced/commit/f7685752b174f1757e541e4c48bdfaf9ab9f8789))


### Features

* **board:** 无 createdTime 的旧 board 根据已有 board 中卡片来回填 createdTime ([bb82381](https://github.com/NightZed/PomodoroLogger-Enhanced/commit/bb82381c27f923dd0e0eaef160b427e2353e9d24))
* **kanban:** 当卡片拖入过Done列时显示完成时间 ([4f599d1](https://github.com/NightZed/PomodoroLogger-Enhanced/commit/4f599d1061a2b77c05fa1e7ffc7e1e250d9f7304))
