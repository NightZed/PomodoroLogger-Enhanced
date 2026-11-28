# 01: Setting 数据层接真实内存库

**What to build:** 打开设置页时，主题、提示音、滑块等偏好的读写与「数据检查」「恢复默认」都落在真实的内存库上——页面显示的是自己刚写进去的值，而不是替身返回的固定值。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 设置页测试不再替换应用内部的存储模块与今日会话查询，改由测试的内存库桥接提供数据
- [ ] 写偏好后重新读页面能看到同一个值，而不是替身预设的返回值
- [ ] 数据检查失败的用例仍断言弹窗标题与失败原因：重复弹窗或弹错文案都要落在失败信息里
- [ ] `pnpm test src/renderer/components/Setting` 全绿
