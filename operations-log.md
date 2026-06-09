# Operations Log

## 2026-06-05

- 分析了 `purchase-flow-implementation.md`、采购流程 Hook、接单 Endpoint、集合初始化脚本、关系脚本和权限脚本。
- 确认当前后端主要复用 Directus `/items/*`
  接口，缺少 Project 聚合接口、沟通并切换状态的原子接口、结构化最新步骤字段和收窄权限。
- 创建计划目录 `docs/plans/`。
- 新增前端业务页面实现计划：`docs/plans/2026-06-05-purchase-flow-frontend.md`。
- 根据用户澄清重写计划：Project 直接使用 `inquiry_items`，前端改为独立 `purchase-web` 应用，不做 Directus 内置 Module。
- 根据用户澄清移除计划中的 Project 业务概念，统一改为“询价项 / `inquiry_items`”。
- 根据用户要求把独立前端目录调整为 `business-apps/purchase-flow/web`，并在计划中约定后续业务项目统一放入
  `business-apps/<business-name>/`。

## 2026-06-08

- 修改 `business-apps/purchase-flow/web/src/views/inquiry-item-detail-view.vue`：将“供应商报价全部内容”改为“询价内容”，将“客户报价全部内容”改为“最终报价内容”。
- 在询价项详情页新增“添加询价”入口，跳转 Directus `supplier_quotes` 新增页面并携带当前 `inquiry_item_id`。
- 支持选择一个或多个询价，点击“最终报价”后汇总显示为最终报价内容，并保留客户报价历史展示。
- 新增询价推荐区，基于当前品牌、型号和规格参数在询价备注中查找类似报价。
- 补充 `inquiry-item-detail-view.test.ts` 覆盖询价选择、最终报价、推荐和添加询价入口。
- 执行 `pnpm test -- inquiry-item-detail-view.test.ts`，结果 9 个测试文件、31 个用例通过。
- 执行 `pnpm typecheck`，结果通过且无错误输出。
- 根据反馈将“添加询价”从 Directus 后台跳转改为询价项详情页内的供应商报价表单流程。
- 新增 `createSupplierQuote`，提交到 `/items/supplier_quotes`，表单支持供应商、报价、币种、MOQ、交期、报价时间和备注。
- 修复供应商报价创建 400：按 `supplier_quotes` collection 必填字段补充 `inquiry_price` 和 `quoted_by`。
- 执行 `pnpm test -- inquiry-item-detail-view.test.ts purchase-flow.test.ts`，结果 9 个测试文件、33 个用例通过。
- 执行 `pnpm typecheck`，结果通过且无错误输出。
- 修复“保存询价”点击后反馈不明显：新增表单内必填校验、错误提示和保存成功提示，并将供应商、报价、币种、交期、报价时间标记为必填。
- 执行 `pnpm test -- inquiry-item-detail-view.test.ts purchase-flow.test.ts`，结果 9 个测试文件、34 个用例通过。
- 执行 `pnpm typecheck`，结果通过且无错误输出。
- 为询价内容新增本人编辑/删除能力：仅 `supplier_quotes.quoted_by` 等于当前登录用户时显示操作，编辑复用添加询价表单，删除后刷新详情。
- 新增 `updateSupplierQuote` 和 `deleteSupplierQuote` API 封装，并补充页面与 API 测试。
- 执行 `pnpm test -- inquiry-item-detail-view.test.ts purchase-flow.test.ts`，结果 9 个测试文件、37 个用例通过。
- 执行 `pnpm typecheck`，结果通过且无错误输出。
