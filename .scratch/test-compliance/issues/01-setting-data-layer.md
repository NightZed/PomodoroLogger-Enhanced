# 01: Setting 数据层接真实内存库

**What to build:** 设置页「导出 / 导入」前的刷新与「删除全部数据」都跑真实实现：导入后缓存真的重新加载，删除后五张表真的空了，而不是替身替它们答应。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 设置页测试不再替换 `dbs` 与 `sessionManager`，改由测试的内存库桥接提供数据
- [x] 删除用例先插入一条会话与一张卡，删除后直接查库确认两表为空，而不是断言替身被调用
- [x] 数据检查失败的用例仍断言弹窗标题与失败原因：重复弹窗或弹错文案都要落在失败信息里
- [x] `pnpm test src/renderer/components/Setting` 全绿（54 条）

## Outcome

`beforeEach` 不再整体替换 `window.api`，改为在 `test/dbBridge.ts` 装好的对象上覆盖。整体替换会丢掉 `dbRequest`，那正是数据层原先必须整块打桩的原因。

删除失败的路径改由 `clearUserFiles` 拒绝触发：真实实现先删五张表再清主进程文件，所以文件失败时数据已经没了。断言因此改成「不 reload、不报成功」，不再声称数据还在——那会是一条描述产品没有的保证。

顺带修掉 5 条存量红灯：`f6e8696` 把声音行文案改成「Focus Completion Alert」等，断言停在旧名。与本次改动无关，改前跑基线确认同样红。
