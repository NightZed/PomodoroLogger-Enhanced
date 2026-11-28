# 02: Setting 三个对话框真实化

**What to build:** 干扰清单、数据修复、导入报告三个对话框在设置页里真实渲染——用户看到真实的条目、被禁用的应用和导入结果，替身不再挡在中间。页面测试只需断言打开了哪个对话框、对话框里读到了什么。

**Blocked by:** 01

**Status:** resolved

- [x] 三个对话框不再被替身替换
- [x] 定位改用对话框角色与其可见文本，不再依赖替身暴露的测试属性
- [x] 打开与关闭、以及每个对话框的关键结果文案都被断言
- [x] 对话框自身的行为仍由各自的测试覆盖，页面测试不重复断言其内部细节
- [x] `pnpm test src/renderer/components/Setting` 全绿（93 条）

## Outcome

`feedback` 的 mock 也不再手抄 `FEEDBACK_MESSAGES`，改用 `jest.requireActual`：手抄的那份已经和 `en.ts` 分叉（`deleteAllConfirm` 少了后半句「Your settings are kept.」），而文案本来就该由 `test/i18n.ts` 钉住的英文目录提供。

导入报告按 `dialog` 角色与真实文案断言（`12 cards not in any list`）。「Check & Repair Data」在页面上和报告页脚各有一个，因此报告内一律 `within(report)` 查询，避免两个同名按钮。

数据检查的观察点从替身的 `orphans=N` 换成真实的 `Not in any list (N)`，「对话框没打开」从文本查询换成没有 `dialog` 角色。

修复结果那条用例改成走真实对话框：勾选全部 → 点应用 → 应答确认框，断言 `applyRepair` 收到窗口返回的结果、随后重扫一次。它验证的是页面把结果往外送的接线；对话框自己的选择与 payload 仍由 `DataRepairDialog.test.tsx` 覆盖。

`RestoreCardsDialog` 仍然打桩：它连 store，恢复流程由自己的测试覆盖，这里只看页面编排。这与 `DataRepairDialog.test.tsx` 的处理一致。
