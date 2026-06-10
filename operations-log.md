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

## 2026-06-09

- 优化 `business-apps/purchase-flow/web/src/views/tasks-view.vue`：将任务泳道从按列重复 `filter()` 改为一次分组计算，并新增每列首屏 8 条、逐步“再显示 8 条”的渲染上限，降低大列表首屏开销。
- 优化 `business-apps/purchase-flow/web/src/styles.css`：为 `topbar` 增加 `contain` 保护，并仅在桌面且浏览器支持时启用 sticky blur；为泳道卡片、摘要卡片和移动端报价项增加 `content-visibility` 与 `contain-intrinsic-size`。
- 执行 `pnpm test`，结果 9 个测试文件、38 个用例通过。
- 执行 `pnpm build`，结果通过且无类型错误。

- 分析 `purchase-flow-implementation.md`、采购流程 Hook、接单 Endpoint、业务动作 Endpoint、扫描 Endpoint 和独立前端 API 类型。
- 新增框架无关需求说明：`docs/plans/2026-06-09-purchase-flow-requirements.md`。
- 文档覆盖角色、数据模型、状态机、自动分配、接单 Token、报价、审批、扫描、任务统计、通知
- 强化独立前端“我的任务”工作台：按采购员、外贸员、经理角色分组展示任务，并支持优先级、状态、截止时间、客户、采购员筛选。
- 将 `user_task_summaries.active_task_details` 和 `weekly_completed_task_details` 从 JSON 快照渲染为任务卡片、本周完成列表和快捷详情入口。
- 增强询价项详情页：补充基础信息、供应商报价列表、推荐报价、客户报价区、沟通时间线入口、附件区、状态流转入口和审批状态展示。
- 增强供应商报价表单体验：增加价格、币种、MOQ、货期校验，附件 URL 入口，推荐报价勾选，以及草稿和提交的区分提示。
- 增加客户报价 UI 和经理审批展示入口，前端只做提示和普通记录创建，是否需要审批、是否允许提交仍以后端结果为准。
- 优化接单页：未登录访问接单链接时保存 token 并跳转登录，登录后继续接单，成功后跳转独立网页询价详情页。
- 细化接单失败提示：对 403 和 token/分配相关错误提示“不是被分配采购员、token 已过期，或任务已重新分配”。
- 完善客户/供应商管理体验：展示联系人、启用/停用状态切换、供应商负责人、供应商报价历史和客户历史询价。
- 强化状态与进度可视化：新增中文状态映射，`task-progress` 展示当前责任人、下一步动作和超时状态。
- 将任务工作台、询价项列表、询价项重点信息和客户历史询价中的裸状态替换为中文状态展示。
- 核对 `purchase-flow-implementation.md` 与实际扩展/前端代码，确认除权限优化和后续新增语义化业务动作 Endpoint 外，超时重分配、供应商报价提醒、历史类似报价、任务页面、任务统计可视化、客户报价提交和经理审批等主体能力已完成。
- 更新 `purchase-flow-implementation.md`：把已完成项从“后续建议”中移出，保留权限优化、前端迁移到 `communicate-and-transition`、`submit-supplier-quote`、`return-to-purchasing` 和 `close-inquiry` 为后续项。
- 修改 `business-apps/purchase-flow/web/src/api/purchase-flow.ts`：`commentAndUpdateState` 在有目标状态时改为调用 `/purchase-flow-actions/communicate-and-transition`，不再由前端串联创建沟通记录和更新询价状态。
- 更新 `purchase-flow-implementation.md`：将独立前端沟通状态切换迁移标记为已完成，保留供应商报价提交普通 CRUD 收口为后续建议。
- 修复 `accept-assignment-view.vue` 在 `<script setup>` 中导出 `PENDING_ACCEPT_TOKEN_KEY` 导致的 Vite Vue 编译错误：新增 `src/utils/accept-token.ts` 统一导出常量，并更新接单页和登录页引用。
- 执行 `pnpm test -- accept-assignment-view login-view purchase-flow.test.ts`，结果 9 个测试文件、38 个用例通过；执行 `pnpm typecheck`，结果通过且无错误输出。
- 修复客户/供应商管理页统计条与表格左右不齐：管理页内 `.table-card--wide` 改为跟随 `.management-stack` 宽度。
- 修复询价项列表“状态”列过宽：`TaskProgress` 新增紧凑模式，列表只展示状态标签，详情区域保留完整责任人、下一步和超时信息。
- 执行 `pnpm test -- inquiry-items-view customers-view suppliers-view`，结果 9 个测试文件、38 个用例通过；执行 `pnpm typecheck`，结果通过且无错误输出。

## 2026-06-10

- 修复独立采购前端存在本地 token 但无法加载当前用户时停留业务页的问题：`auth` store 新增 `ensureCurrentUser()`，失败时清理会话。
- 修改 `business-apps/purchase-flow/web/src/router.ts`：进入非公开页面前补齐当前用户，无法识别时直接跳转 `/login` 并保留 `redirect`。
- 补充 `auth.test.ts`：覆盖过期 token 无法加载当前用户时清理本地会话。
- 梳理企业微信通知逻辑：新询价分配、超时重新分配、供应商报价字段缺失提醒均通过 `WECHAT_WORK_WEBHOOK_URL` 发送 markdown 消息。
- 执行 `pnpm test -- auth.test.ts`，结果 9 个测试文件、39 个用例通过。
- 执行 `pnpm typecheck`，结果通过且无错误输出。
- 新增 `purchase-flow-cleanup.md`，记录采购流程业务流水数据清理范围、SQL 删除顺序和重新初始化建议，未执行数据库删除操作。
