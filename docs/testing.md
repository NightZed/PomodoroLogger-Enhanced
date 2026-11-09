# 测试编写规范

红绿循环、seam、垂直切片属于通用方法论，本文不复述，装了 `/tdd` skill 可以直接对照。
本文是仓库内的规范，不依赖任何 skill 才能读，只写本仓库的判据和事实——哪些结构可以测、mock 停在哪、时钟怎么处理、覆盖率怎么用。

## 判据

保持外部可观察行为不变、把实现重写一遍，测试应当仍然通过。
它挂了，就说明它钉在了实现上。

`/tdd` 的 *What a good test is* 是同类判据的完整版本，装了可对照。
这里只补本仓库的三类产物算不算行为：

| 算行为——要测 | 不算 |
| --- | --- |
| 落进 SQLite 的那一行、IPC payload、dispatch 出去的 action | 私有字段、内部调用顺序 |
| 用户看得见的东西：role、可见文本、启用/禁用、焦点 | `className`、`data-testid` |
| 调用方会遍历的集合顺序 | 具体容器类型 |

`src/renderer/components/AppTitleBar/tokens.test.ts:21` 是应该照着写的形态：断言 `COMPACT_TITLE_BAR_HEIGHT < TITLE_BAR_HEIGHT`，而不是 `=== 40`。
调整尺寸能过，把两个常量合成一个才会挂——那才是真正的缺陷。

## 可测的契约

有些结构**就是**行为，因为模块外面有人按名字依赖它。
判断只有一个问题：**这个模块之外，有人在消费这个名称吗？**

| 可以测的契约 | 代理断言 |
| --- | --- |
| 序列化格式、备份/最近记录 JSON、SQLite 表结构 | 源码里出现某个字符串 |
| IPC 通道名与 payload 结构（`src/main/ipc/validate.ts`） | 某个私有方法名存在 |
| i18n key（`src/shared/i18n/en.ts` 就是 key 树） | antd 恰好输出的某个 CSS 类 |
| `package.json` 的 `build.*`，被 electron-builder 消费 | 结构体内部的字段顺序 |

`test/buildConfig.test.ts` 是契约测试，不能当成「结构检查」删掉。
它的注释（第 21–27 行）记了原因：v0.17.0 精简 `build.files` 时排除了 `@mapbox/node-pre-gyp`，安装版调用 `initActiveWin()` 报 MODULE_NOT_FOUND，`activeWin()` 每个 tick 都返回 `undefined`，于是每个会话都带着空的 `apps` / `stayTimeInSecond` 落库——History 里的桑基图一片空白，而任何日志里都没有记录。
这个文件同样避免「能跑就不读源码」：第 156 行直接 `require` 了 `better-sqlite3` 并执行一次查询，而不是去断言 prebuild 的路径。

`src/shared/i18n/catalog.test.ts` 是另一类合理的结构测试：它比对两份词条表的 key 集合和叶子类型，因为 `zh` 里缺一个 key，用户看到的就是 key 本身。

要防的反模式是**代理断言**（proxy assertion）：它检查代码是**怎么写**的，而不是**做了什么**，所以等价重写会挂、真缺陷照样发布。
`src/components/common/Mini/MiniLogger.smoke.test.tsx:131` 断言了 `querySelector('.anticon-close')`——那测的是 antd 的内部类名，而不是「关闭按钮存在，并且能关掉窗口」。

## mock 停在哪

| 边界——可以 mock | 原因 |
| --- | --- |
| `fs`、`electron`、`get-windows`、`electron-updater` | 原生 / 进程级 |
| 时钟（`jest.useFakeTimers`）、`Math.random`、网络 | 不确定 |
| worker（`__mocks__/nativeWorkerFactory.js`） | 独立进程 |

应用内部的一切都跑真实现。
`test/dbBridge.ts` 用主进程真实的内存 repository 实现 `window.api.dbRequest`，所以 `src/renderer/components/Kanban/Board/action.test.ts:53` 断言的是落库的那一行，而不是 repository mock 的调用次数。
行是行为，次数是实现。

`/tdd` 的 `tests.md` 会把「查数据库验证」列为反模式；若装了它，注意下面的区别：它说的是**接口有返回值**时还绕开接口（那个例子里 `createUser` 返回了 `user.id`）。
本仓库的 `actions.moveList(id, 0, 2)(dispatch)` 是 thunk，不返回任何东西，落库的行就是它的产出；测试同时比对 `newDoc` 与 reducer 的 `state[_id]`，两个可观察点互相印证，不是侧信道。

## 时钟与环境

- `src/config.ts:42` 只要 `NODE_ENV !== 'production'` 就返回 `DEBUG_TIME_SCALE`（120），而 `NODE_ENV=test` 正属于这一类。
  断言「25 分钟的会话」的测试必须走 `scaleMs`（一次除法），否则差 120 倍。
- 在模块求值时就固定住环境的模块，要在环境设好**之后**重新加载：`src/config.ts:13` 在 import 时算出 `__DEV__`，`src/renderer/dbs.ts` 在那一刻建好 repository 闭包。
  `jest.isolateModules` 提供的正是这次重新求值，见 `src/renderer/dbs.test.ts:16`。
- 覆盖过的要还原。
  `src/renderer/dbs.test.ts:13` 替换 `window.api` 之后没有恢复；这个文件别的事都不做，所以可以接受，但同样的动作放进一个随后要读数据库的 suite，结果就会依赖文件执行顺序。
- 任何测试都不能假设别的测试跑过、或者先跑。
  `posttest` 只删 `.local/test`，文件之间没有重置表。

## 失败信息必须指出元凶

把变化的那部分**塞进**断言值里：

```ts
// test/buildConfig.test.ts:121
expect({ dependency, installed: packageIsInstalled(dependency) })
    .toEqual({ dependency, installed: true });
```

失败信息里就会带出是哪个包出了问题；`src/shared/i18n/catalog.test.ts:47` 用同样的写法带出 key。
在循环里写 `expect(true).toBe(true)` 只能告诉你「某处坏了」，下一个人还得手工二分。

## 每个测试都要挣得自己的位置

写之前先回答：**什么改动会让它失败？**
答案是「没什么具体的」或者「这个文件怎么改都挂」，它就是伪装起来的代理断言。

不显而易见的测试要带一条 `// Regression:` 注释，写明它防的是哪次事故（`test/buildConfig.test.ts:21`、`src/renderer/components/AppTitleBar/tokens.test.ts:14`、`src/renderer/components/appTabs.test.ts:29`）。
730 个 `it` 里目前只有 14 个这么做；这条注释才是让测试一年后仍然可评审的东西。
另外，一个测试只留一个失败原因，命名描述行为而不是函数名。

## 覆盖率与快照

`jest.config.js:18` 把 `collectCoverage` 设为 `false`，仓库里也没有任何 `coverageThreshold`。
`pnpm test:coverage` 报的是真实数字（`collectCoverageFrom` 会把没有测试 import 的源文件也算进去），但它不设门槛。
不要加阈值：百分比目标奖励的是「执行到了多少行」，那恰好就是本文档要排除的代理断言。

仓库里 `toMatchSnapshot` 的调用数是 0，保持这样。
大组件快照是浓度最高的实现断言，配上最差的失败信息：每次样式微调都挂，而且什么也说不清。
