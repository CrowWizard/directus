# Purchase Flow Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use trycycle-executing to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:**
构建一个独立采购报价前端应用，让用户查看自己的任务、维护客户和供应商、浏览 询价项摘要与完整详情，并在详情页围绕报价沟通和切换状态。

**Architecture:** 使用 `inquiry_items` 作为前端业务实体：一个 `inquiry_items`
记录就是一次报价询价项。前端新建独立 Vue 应用，直接调用现有 Directus REST 接口和接单 Endpoint；登录态使用 Directus
`/auth/login`、`/auth/refresh`、`/users/me`，业务数据通过 `/items/*` 聚合。

**Tech Stack:** Vue 3、Vue Router、Pinia、Vite、TypeScript、Axios、Vitest、Vue Test Utils、Directus REST API。

---

## 关键决策

1. 询价项直接使用
   `inquiry_items`。当前数据模型已经把询价、负责人、状态、优先级、客户、采购员、附件、时间线关键字段都放在
   `inquiry_items`，而 `supplier_quotes`、`customer_quotes`、`conversations` 都通过 `inquiry_item_id`
   关联它。因此前端只需要在命名上把 `inquiry_items` 映射为 询价项，不需要新增 `inquiry-items` 集合。

2. 不做 Directus 业务前端 Module。前端单独作为一个应用实现，避免被 Directus
   Admin 的信息架构、组件和路由约束影响，也方便后续做更贴合采购报价流程的界面。

3. 第一版不强制新增后端接口。独立前端先复用现有 Directus
   REST 能力完成闭环；后端原子接口、权限收窄、状态枚举增强作为后续补强。

## 前置分析：当前后端不足

1. 没有 询价项 聚合接口。虽然 询价项 可以直接等于 `inquiry_items`，但前端展示完整 询价项 时仍要多次请求
   `inquiry_items`、`supplier_quotes`、`customer_quotes`、`conversations`、客户、供应商和用户信息。后续更好的接口是
   `GET /purchase-flow/inquiry-items/:id`，内部仍以 `inquiry_items.id` 为主键。

2. 没有“沟通并切换状态”的原子接口。当前只能前端先 `POST /items/conversations`，再
   `PATCH /items/inquiry_items/:id`。两步之间失败会导致沟通记录和状态不一致。

3. 状态模型缺少明确的“再次报价”状态。现有状态只有
   `Draft`、`Assigned`、`Purchasing`、`WaitingSalesReview`、`Quoted`、`Closed`。第一版将“再次报价【任务属于 buyer】”映射为
   `Purchasing`，后续建议新增 `RequoteRequested` 并同步任务统计规则。

4. “最新一步的具体内容”没有结构化字段。当前 `user_task_summaries.active_task_details`
   只包含任务摘要。最新一步需要前端从最新
   `conversations`、最新供应商报价、最新客户报价、接单时间和 询价项 更新时间中推导。

5. 任务统计刷新不覆盖所有业务动作。当前 Hook 只监听 `inquiry_items` 的 create/update。新增报价和沟通记录时不会直接刷新
   `user_task_summaries`，所以独立前端任务页应直接查询 `inquiry_items` 和相关最新记录，不把摘要 JSON 作为唯一数据源。

6. 权限过宽。`scripts/init-purchase-flow-permissions.sh` 对多个角色授予大量集合的全部操作权限，包括
   `assignment_accept_tokens` 等敏感集合。独立前端不能只靠隐藏按钮保证安全，后续必须收窄 Directus 权限。

7. 附件模型未与 Directus 文件库正式关联。`attachments` 使用 `file_url`，业务表上的 `attachment_ids`
   是 JSON。第一版可展示 URL，文件上传和预览后续再与 `directus_files` 关系化。

8. 接单 Endpoint 跳转仍指向 Directus 内容页。`extensions/purchase-flow-accept/dist/index.js` 目前跳转到
   `${PUBLIC_ADMIN_URL}/content/inquiry_items/:id`。独立前端上线后，应跳转到
   `${PUBLIC_PURCHASE_APP_URL}/inquiry-items/:id/detail`。

9. 后端 Hook 有一个逻辑死分支。`prepareInquiryAssignment` 在已提前 return finished state 后再检查 finished state 补
   `completed_at`，该分支不可达。前端不能假设完成时间总能自动补齐。

## 现有可复用接口

1. 登录：`POST /auth/login`，body 为 `{ email, password, mode: 'json' }`。

2. 刷新登录态：`POST /auth/refresh`。

3. 退出登录：`POST /auth/logout`。

4. 当前用户和角色：`GET /users/me?fields=id,email,first_name,last_name,role.name`。

5. 我的任务统计：`GET /items/user_task_summaries?filter[user_id][_eq]=$CURRENT_USER&fields=*`。只作为计数参考，列表不依赖它。

6. 我的任务列表：`GET /items/inquiry_items`。Sales 过滤 `sales_owner_id = currentUser` 和
   `state in Draft,WaitingSalesReview`；Buyer 过滤 `buyer_owner_id = currentUser` 和
   `state in Assigned,Purchasing`；Manager 过滤 `state in Assigned,Purchasing,WaitingSalesReview`。

7. 询价项摘要：`GET /items/inquiry_items/:id?fields=*,customer_id.*,sales_owner_id.*,buyer_owner_id.*,supplier_quotes.*,supplier_quotes.supplier_id.*,customer_quotes.*`。

8. 询价项完整详情：询价项摘要接口，加
   `GET /items/conversations?filter[inquiry_item_id][_eq]=$INQUIRY_ITEM_ID&sort=-created_at&fields=*,actor_id.*`。

9. 客户 CRUD：`GET/POST/PATCH/DELETE /items/customers`。

10. 客户联系人 CRUD：`GET/POST/PATCH/DELETE /items/customer_contacts`。

11. 供应商 CRUD：`GET/POST/PATCH/DELETE /items/suppliers`。

12. 供应商联系人 CRUD：`GET/POST/PATCH/DELETE /items/supplier_contacts`。

13. 供应商报价查询：`GET /items/supplier_quotes?filter[inquiry_item_id][_eq]=$INQUIRY_ITEM_ID&fields=*,supplier_id.*,quoted_by.*&sort=-quoted_at`。

14. 客户报价查询：`GET /items/customer_quotes?filter[inquiry_item_id][_eq]=$INQUIRY_ITEM_ID&fields=*,customer_id.*,quoted_by.*&sort=-quoted_at`。

15. 沟通记录创建：`POST /items/conversations`，body 为 `{ inquiry_item_id, actor_id, content, metadata }`。

16. 状态切换：`PATCH /items/inquiry_items/:id`，body 为 `{ state: 'WaitingSalesReview' }` 或 `{ state: 'Purchasing' }`。

17. 接单链接：`GET /purchase-flow-accept/accept?token=xxx`。后续修改成功跳转到独立前端 询价项详情页。

## File Structure

新增业务代码统一放在 `business-apps/` 下。本次采购报价前端放在
`business-apps/purchase-flow/web/`；后续通过同一个 Directus 承载更多业务项目时，按
`business-apps/<business-name>/web/`、`business-apps/<business-name>/scripts/`、`business-apps/<business-name>/extensions/`
继续扩展，避免新增业务代码散落在仓库根目录。

- Create: `business-apps/purchase-flow/web/package.json`，独立前端应用包定义。
- Create: `business-apps/purchase-flow/web/index.html`，Vite HTML 入口。
- Create: `business-apps/purchase-flow/web/vite.config.ts`，Vite、Vue、测试配置。
- Create: `business-apps/purchase-flow/web/tsconfig.json`，TypeScript 配置。
- Create: `business-apps/purchase-flow/web/src/main.ts`，应用启动入口。
- Create: `business-apps/purchase-flow/web/src/app.vue`，应用壳层。
- Create: `business-apps/purchase-flow/web/src/router.ts`，路由定义和登录守卫。
- Create: `business-apps/purchase-flow/web/src/api/http.ts`，Directus Axios 实例和 Token 注入。
- Create: `business-apps/purchase-flow/web/src/api/auth.ts`，登录、刷新、退出、当前用户接口。
- Create: `business-apps/purchase-flow/web/src/api/purchase-flow.ts`，任务、客户、供应商、询价项、沟通和状态接口。
- Create: `business-apps/purchase-flow/web/src/stores/auth.ts`，认证状态、当前用户和角色。
- Create: `business-apps/purchase-flow/web/src/types/purchase-flow.ts`，`InquiryItem`、报价、沟通、客户、供应商类型。
- Create: `business-apps/purchase-flow/web/src/utils/latest-step.ts`，推导最新一步。
- Create: `business-apps/purchase-flow/web/src/views/login-view.vue`，登录页。
- Create: `business-apps/purchase-flow/web/src/views/tasks-view.vue`，我的任务页。
- Create: `business-apps/purchase-flow/web/src/views/customers-view.vue`，客户 CRUD 页面。
- Create: `business-apps/purchase-flow/web/src/views/suppliers-view.vue`，供应商 CRUD 页面。
- Create: `business-apps/purchase-flow/web/src/views/inquiry-items-view.vue`，询价项列表页，数据源为 `inquiry_items`。
- Create: `business-apps/purchase-flow/web/src/views/inquiry-item-summary-view.vue`，询价项摘要页。
- Create: `business-apps/purchase-flow/web/src/views/inquiry-item-detail-view.vue`，询价项完整详情和沟通页。
- Create: `business-apps/purchase-flow/web/src/components/app-shell.vue`，独立前端布局和导航。
- Create: `business-apps/purchase-flow/web/src/components/task-progress.vue`，任务进度展示。
- Create: `business-apps/purchase-flow/web/src/components/inquiry-item-key-info.vue`，询价项重点信息。
- Create: `business-apps/purchase-flow/web/src/components/quote-summary-table.vue`，供应商报价重点表。
- Create: `business-apps/purchase-flow/web/src/components/conversation-panel.vue`，沟通记录与状态动作表单。
- Create: `business-apps/purchase-flow/web/src/components/entity-crud-table.vue`，客户和供应商 CRUD 复用表格。
- Create: `business-apps/purchase-flow/web/src/utils/latest-step.test.ts`，最新一步推导测试。
- Create: `business-apps/purchase-flow/web/src/api/purchase-flow.test.ts`，API 参数和状态动作测试。
- Modify: `package.json`，新增根脚本 `purchase-flow:web:dev`、`purchase-flow:web:build`、`purchase-flow:web:test`。
- Modify: `pnpm-workspace.yaml`，加入 `business-apps/purchase-flow/web` workspace。
- Modify: `extensions/purchase-flow-accept/dist/index.js:99-102`，把接单成功跳转改为独立前端 询价项详情页。
- Optional Modify: `purchase-flow-implementation.md`，实现完成后记录独立前端入口和后端风险。

## Strategy Gate

当前用户明确要求“前端页面准备单独做一个，不做业务前端 Module”，所以方案从 Directus 内置 Module 改为独立 Vue 应用。

独立前端的优势：界面和交互可以围绕采购报价任务重做，不受 Directus
Admin 页面结构限制；可以使用更直接的任务、询价项、沟通工作流；后续也方便独立部署给业务用户使用。

独立前端的代价：需要自己处理登录、Token 刷新、权限失败、路由守卫、构建部署和后端地址配置。第一版通过复用 Directus
`/auth/*` 和 `/items/*` 降低复杂度，不自建认证服务。

### Task 1: Scaffold Independent Purchase Web App

**Files:**

- Create: `business-apps/purchase-flow/web/package.json`
- Create: `business-apps/purchase-flow/web/index.html`
- Create: `business-apps/purchase-flow/web/vite.config.ts`
- Create: `business-apps/purchase-flow/web/tsconfig.json`
- Create: `business-apps/purchase-flow/web/src/main.ts`
- Create: `business-apps/purchase-flow/web/src/app.vue`
- Create: `business-apps/purchase-flow/web/src/router.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`

- [ ] **Step 1: Identify or write the failing test**

Run a workspace command that should fail before the package exists.

```bash
pnpm --filter @purchase-flow/web build
```

Expected: FAIL because workspace package `@purchase-flow/web` does not exist.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @purchase-flow/web build` Expected: FAIL with no matching workspace package.

- [ ] **Step 3: Write minimal implementation**

Create `business-apps/purchase-flow/web/package.json`:

```json
{
	"name": "@purchase-flow/web",
	"private": true,
	"type": "module",
	"scripts": {
		"dev": "vite --host 0.0.0.0",
		"build": "vue-tsc --noEmit && vite build",
		"test": "vitest run",
		"typecheck": "vue-tsc --noEmit"
	},
	"dependencies": {
		"@vitejs/plugin-vue": "catalog:",
		"axios": "catalog:",
		"pinia": "catalog:",
		"typescript": "catalog:",
		"vite": "catalog:",
		"vitest": "catalog:",
		"vue": "catalog:",
		"vue-router": "catalog:",
		"vue-tsc": "catalog:"
	},
	"devDependencies": {
		"@vue/test-utils": "catalog:",
		"happy-dom": "catalog:"
	}
}
```

Add `business-apps/purchase-flow/web` to `pnpm-workspace.yaml` packages and root scripts:

```yaml
packages:
  - business-apps/*/web
```

```json
"purchase-flow:web:dev": "pnpm --filter @purchase-flow/web dev",
"purchase-flow:web:build": "pnpm --filter @purchase-flow/web build",
"purchase-flow:web:test": "pnpm --filter @purchase-flow/web test"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @purchase-flow/web build` Expected: PASS and creates `business-apps/purchase-flow/web/dist`.

- [ ] **Step 5: Refactor and verify**

Keep the scaffold minimal. Do not add UI libraries before a concrete need exists.

Run: `pnpm --filter @purchase-flow/web test` Run: `pnpm --filter @purchase-flow/web typecheck` Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add business-apps/purchase-flow/web package.json pnpm-workspace.yaml
git commit -m "feat: scaffold purchase web app"
```

### Task 2: Add Auth and HTTP Client

**Files:**

- Create: `business-apps/purchase-flow/web/src/api/http.ts`
- Create: `business-apps/purchase-flow/web/src/api/auth.ts`
- Create: `business-apps/purchase-flow/web/src/stores/auth.ts`
- Create: `business-apps/purchase-flow/web/src/views/login-view.vue`
- Modify: `business-apps/purchase-flow/web/src/router.ts`
- Test: `business-apps/purchase-flow/web/src/api/auth.test.ts`

- [ ] **Step 1: Identify or write the failing test**

Mock Axios and test login stores access token and current user.

```ts
test('logs in and loads current user', async () => {
	mockHttp.post.mockResolvedValueOnce({ data: { data: { access_token: 'token-1', refresh_token: 'refresh-1' } } });
	mockHttp.get.mockResolvedValueOnce({ data: { data: { id: 'user-1', role: { name: '采购员' } } } });

	const auth = useAuthStore();
	await auth.login('buyer1@example.com', '12345678');

	expect(auth.accessToken).toBe('token-1');
	expect(auth.roleScope).toBe('Buyer');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @purchase-flow/web test src/api/auth.test.ts` Expected: FAIL because auth client and store do not
exist.

- [ ] **Step 3: Write minimal implementation**

Use `VITE_DIRECTUS_URL` with fallback `http://localhost:8055`.

```ts
export const http = axios.create({
	baseURL: import.meta.env.VITE_DIRECTUS_URL || 'http://localhost:8055',
});
```

Store tokens in `localStorage` and add Authorization header in an interceptor.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @purchase-flow/web test src/api/auth.test.ts` Expected: PASS.

- [ ] **Step 5: Refactor and verify**

Add route guard: unauthenticated users go to `/login`; authenticated users cannot stay on `/login`.

Run: `pnpm --filter @purchase-flow/web test src/api/auth.test.ts` Run: `pnpm --filter @purchase-flow/web typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add business-apps/purchase-flow/web/src/api business-apps/purchase-flow/web/src/stores business-apps/purchase-flow/web/src/views/login-view.vue business-apps/purchase-flow/web/src/router.ts
git commit -m "feat: add purchase web authentication"
```

### Task 3: Add Purchase Flow API Layer

**Files:**

- Create: `business-apps/purchase-flow/web/src/types/purchase-flow.ts`
- Create: `business-apps/purchase-flow/web/src/api/purchase-flow.ts`
- Test: `business-apps/purchase-flow/web/src/api/purchase-flow.test.ts`

- [ ] **Step 1: Identify or write the failing test**

Assert 询价项 APIs use `inquiry_items` endpoints.

```ts
test('loads 询价项 summary from inquiry_items', async () => {
	mockHttp.get.mockResolvedValueOnce({ data: { data: { id: 'inq-1' } } });

	await get询价项Summary('inq-1');

	expect(mockHttp.get).toHaveBeenCalledWith(
		'/items/inquiry_items/inq-1',
		expect.objectContaining({
			params: expect.objectContaining({ fields: expect.any(Array) }),
		}),
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @purchase-flow/web test src/api/purchase-flow.test.ts` Expected: FAIL because API layer does not
exist.

- [ ] **Step 3: Write minimal implementation**

Expose functions:

```ts
export async function getTasks(roleScope: RoleScope, userId: string) {}
export async function get询价项Summary(询价项Id: string) {}
export async function get询价项Detail(询价项Id: string) {}
export async function listCustomers() {}
export async function createCustomer(payload: CustomerPayload) {}
export async function updateCustomer(id: string, payload: CustomerPayload) {}
export async function deleteCustomer(id: string) {}
export async function listSuppliers() {}
export async function createSupplier(payload: SupplierPayload) {}
export async function updateSupplier(id: string, payload: SupplierPayload) {}
export async function deleteSupplier(id: string) {}
export async function createConversation(payload: ConversationPayload) {}
export async function update询价项State(询价项Id: string, state: InquiryState) {}
export async function commentAndUpdateState(payload: CommentAndStatePayload) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @purchase-flow/web test src/api/purchase-flow.test.ts` Expected: PASS.

- [ ] **Step 5: Refactor and verify**

Rename UI-facing type to `InquiryItem` so developers know 询价项 is an alias of `inquiry_items`.

Run: `pnpm --filter @purchase-flow/web test src/api/purchase-flow.test.ts` Run:
`pnpm --filter @purchase-flow/web typecheck` Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add business-apps/purchase-flow/web/src/types/purchase-flow.ts business-apps/purchase-flow/web/src/api/purchase-flow.ts business-apps/purchase-flow/web/src/api/purchase-flow.test.ts
git commit -m "feat: add purchase flow api client"
```

### Task 4: Implement Latest Step Utility

**Files:**

- Create: `business-apps/purchase-flow/web/src/utils/latest-step.ts`
- Test: `business-apps/purchase-flow/web/src/utils/latest-step.test.ts`

- [ ] **Step 1: Identify or write the failing test**

Cover latest conversation, supplier quote, customer quote, accepted task, waiting sales review and assigned states.

```ts
test('uses latest conversation as 询价项 latest step', () => {
	const result = getLatestStep({
		询价项: { state: 'Purchasing', updated_at: '2026-06-05T01:00:00Z' },
		conversations: [{ content: '请补充 MOQ', created_at: '2026-06-05T02:00:00Z' }],
		supplierQuotes: [],
		customerQuotes: [],
	});

	expect(result.title).toBe('最新沟通');
	expect(result.detail).toContain('请补充 MOQ');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @purchase-flow/web test src/utils/latest-step.test.ts` Expected: FAIL because utility does not
exist.

- [ ] **Step 3: Write minimal implementation**

Return:

```ts
export type LatestStep = {
	title: string;
	detail: string;
	at: string | null;
	ownerScope: 'Sales' | 'Buyer' | 'Manager' | null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @purchase-flow/web test src/utils/latest-step.test.ts` Expected: PASS.

- [ ] **Step 5: Refactor and verify**

Keep fallback copy explicit: `Assigned` means“等待采购员接单”，`Purchasing` means“采购处理中”，`WaitingSalesReview`
means“等待外贸补充报价信息”。

Run: `pnpm --filter @purchase-flow/web test src/utils/latest-step.test.ts` Run:
`pnpm --filter @purchase-flow/web typecheck` Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add business-apps/purchase-flow/web/src/utils/latest-step.ts business-apps/purchase-flow/web/src/utils/latest-step.test.ts
git commit -m "feat: derive 询价项 latest step"
```

### Task 5: Build App Shell and Task Page

**Files:**

- Create: `business-apps/purchase-flow/web/src/components/app-shell.vue`
- Create: `business-apps/purchase-flow/web/src/components/task-progress.vue`
- Create: `business-apps/purchase-flow/web/src/views/tasks-view.vue`
- Modify: `business-apps/purchase-flow/web/src/router.ts`
- Test: `business-apps/purchase-flow/web/src/views/tasks-view.test.ts`

- [ ] **Step 1: Identify or write the failing test**

Mock API and auth store, then assert the page renders the user’s tasks and latest step.

```ts
test('shows buyer active tasks with latest step', async () => {
	mockGetTasks.mockResolvedValue([assigned询价项]);
	mockGet询价项Detail.mockResolvedValue(询价项DetailWithConversation);

	const wrapper = mount(TasksView, { global: testPlugins });
	await flushPromises();

	expect(wrapper.text()).toContain('INQ-001');
	expect(wrapper.text()).toContain('请补充 MOQ');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @purchase-flow/web test src/views/tasks-view.test.ts` Expected: FAIL because task page does not
exist.

- [ ] **Step 3: Write minimal implementation**

Render task list fields:
`inquiry_no`、`询价项_name`、`product_name`、`brand`、`priority`、`state`、`assignment_deadline`、最新一步。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @purchase-flow/web test src/views/tasks-view.test.ts` Expected: PASS.

- [ ] **Step 5: Refactor and verify**

Add loading、empty、error states. Ensure mobile layout is usable.

Run: `pnpm --filter @purchase-flow/web test src/views/tasks-view.test.ts` Run:
`pnpm --filter @purchase-flow/web typecheck` Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add business-apps/purchase-flow/web/src/components/app-shell.vue business-apps/purchase-flow/web/src/components/task-progress.vue business-apps/purchase-flow/web/src/views/tasks-view.vue business-apps/purchase-flow/web/src/router.ts
git commit -m "feat: add purchase task page"
```

### Task 6: Build Customer and Supplier CRUD Pages

**Files:**

- Create: `business-apps/purchase-flow/web/src/components/entity-crud-table.vue`
- Create: `business-apps/purchase-flow/web/src/views/customers-view.vue`
- Create: `business-apps/purchase-flow/web/src/views/suppliers-view.vue`
- Modify: `business-apps/purchase-flow/web/src/router.ts`
- Test: `business-apps/purchase-flow/web/src/views/customers-view.test.ts`
- Test: `business-apps/purchase-flow/web/src/views/suppliers-view.test.ts`

- [ ] **Step 1: Identify or write the failing test**

Test create/update/delete for customers and suppliers.

```ts
test('creates a customer', async () => {
	mockListCustomers.mockResolvedValue([]);
	mockCreateCustomer.mockResolvedValue({ id: 'customer-1', customer_name: 'ACME' });

	const wrapper = mount(CustomersView, { global: testPlugins });
	await flushPromises();
	await wrapper.find('[name="customer_name"]').setValue('ACME');
	await wrapper.find('form').trigger('submit');

	expect(mockCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ customer_name: 'ACME' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @purchase-flow/web test src/views/customers-view.test.ts src/views/suppliers-view.test.ts` Expected:
FAIL because pages do not exist.

- [ ] **Step 3: Write minimal implementation**

Customer fields: `customer_code`、`customer_name`、`country`、`address`、`website`、`status`、`remark`。

Supplier fields:
`supplier_code`、`supplier_name`、`supplier_type`、`country`、`tax_rate`、`payment_term`、`website`、`status`、`remark`。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @purchase-flow/web test src/views/customers-view.test.ts src/views/suppliers-view.test.ts` Expected:
PASS.

- [ ] **Step 5: Refactor and verify**

Keep shared table generic. Business labels remain in page files.

Run: `pnpm --filter @purchase-flow/web test src/views/customers-view.test.ts src/views/suppliers-view.test.ts` Run:
`pnpm --filter @purchase-flow/web typecheck` Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add business-apps/purchase-flow/web/src/components/entity-crud-table.vue business-apps/purchase-flow/web/src/views/customers-view.vue business-apps/purchase-flow/web/src/views/suppliers-view.vue business-apps/purchase-flow/web/src/router.ts
git commit -m "feat: add customer and supplier management"
```

### Task 7: Build 询价项 List and Summary Page

**Files:**

- Create: `business-apps/purchase-flow/web/src/views/inquiry-items-view.vue`
- Create: `business-apps/purchase-flow/web/src/views/inquiry-item-summary-view.vue`
- Create: `business-apps/purchase-flow/web/src/components/inquiry-item-key-info.vue`
- Create: `business-apps/purchase-flow/web/src/components/quote-summary-table.vue`
- Modify: `business-apps/purchase-flow/web/src/router.ts`
- Test: `business-apps/purchase-flow/web/src/views/inquiry-item-summary-view.test.ts`

- [ ] **Step 1: Identify or write the failing test**

Assert summary page labels 询价项 but uses `inquiry_items` data.

```ts
test('renders inquiry item as 询价项 summary', async () => {
	mockGet询价项Summary.mockResolvedValue(询价项Summary);

	const wrapper = mount(询价项SummaryView, { global: testPlugins });
	await flushPromises();

	expect(wrapper.text()).toContain('询价项');
	expect(wrapper.text()).toContain('INQ-001');
	expect(wrapper.text()).toContain('Best Supplier');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @purchase-flow/web test src/views/inquiry-item-summary-view.test.ts` Expected: FAIL
because 询价项 pages do not exist.

- [ ] **Step 3: Write minimal implementation**

Routes:

```ts
{ path: '/inquiry-items', component: inquiry-itemsView },
{ path: '/inquiry-items/:id', component: 询价项SummaryView },
{ path: '/inquiry-items/:id/detail', component: 询价项DetailView },
```

Summary shows important inquiry fields and supplier quote highlights.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @purchase-flow/web test src/views/inquiry-item-summary-view.test.ts` Expected: PASS.

- [ ] **Step 5: Refactor and verify**

Add clear link to完整详情页.

Run: `pnpm --filter @purchase-flow/web test src/views/inquiry-item-summary-view.test.ts` Run:
`pnpm --filter @purchase-flow/web typecheck` Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add business-apps/purchase-flow/web/src/views/inquiry-items-view.vue business-apps/purchase-flow/web/src/views/inquiry-item-summary-view.vue business-apps/purchase-flow/web/src/components/inquiry-item-key-info.vue business-apps/purchase-flow/web/src/components/quote-summary-table.vue business-apps/purchase-flow/web/src/router.ts
git commit -m "feat: add 询价项 summary pages"
```

### Task 8: Build Complete 询价项 Detail and Conversation Actions

**Files:**

- Create: `business-apps/purchase-flow/web/src/views/inquiry-item-detail-view.vue`
- Create: `business-apps/purchase-flow/web/src/components/conversation-panel.vue`
- Modify: `business-apps/purchase-flow/web/src/api/purchase-flow.ts`
- Modify: `business-apps/purchase-flow/web/src/router.ts`
- Test: `business-apps/purchase-flow/web/src/views/inquiry-item-detail-view.test.ts`

- [ ] **Step 1: Identify or write the failing test**

Assert all detail sections render and conversation action updates state.

```ts
test('adds conversation and sends 询价项 back to sales', async () => {
	mockGet询价项Detail.mockResolvedValue(询价项Detail);
	mockCommentAndUpdateState.mockResolvedValue(undefined);

	const wrapper = mount(询价项DetailView, { global: testPlugins });
	await flushPromises();
	await wrapper.find('[name="content"]').setValue('请补充目标价');
	await wrapper.find('[name="state_action"]').setValue('WaitingSalesReview');
	await wrapper.find('form').trigger('submit');

	expect(mockCommentAndUpdateState).toHaveBeenCalledWith(
		expect.objectContaining({
			state: 'WaitingSalesReview',
			content: '请补充目标价',
		}),
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @purchase-flow/web test src/views/inquiry-item-detail-view.test.ts` Expected: FAIL because detail
page does not exist.

- [ ] **Step 3: Write minimal implementation**

Detail sections:

```text
询价单全部内容
供应商报价全部内容
客户报价全部内容
报价沟通记录
新增沟通表单
状态动作：仅沟通 / 补充报价信息(Sales) / 再次报价(Buyer)
```

State action mapping:

```ts
const stateActions = [
	{ label: '仅沟通', value: null },
	{ label: '补充报价信息，任务交给外贸员', value: 'WaitingSalesReview' },
	{ label: '再次报价，任务交给采购员', value: 'Purchasing' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @purchase-flow/web test src/views/inquiry-item-detail-view.test.ts` Expected: PASS.

- [ ] **Step 5: Refactor and verify**

Submit success后重新加载 询价项详情。页面提示当前后端由前端串联两次请求，后续会补原子接口。

Run: `pnpm --filter @purchase-flow/web test src/views/inquiry-item-detail-view.test.ts` Run:
`pnpm --filter @purchase-flow/web typecheck` Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add business-apps/purchase-flow/web/src/views/inquiry-item-detail-view.vue business-apps/purchase-flow/web/src/components/conversation-panel.vue business-apps/purchase-flow/web/src/api/purchase-flow.ts business-apps/purchase-flow/web/src/router.ts
git commit -m "feat: add 询价项 detail conversations"
```

### Task 9: Redirect Accept Endpoint to Independent Frontend

**Files:**

- Modify: `extensions/purchase-flow-accept/dist/index.js:99-102`
- Optional Modify: `.env.example` if the 询价项 has one later

- [ ] **Step 1: Identify or write the failing test**

Use endpoint smoke command. Current valid-token behavior redirects to Directus Admin content page.

```bash
curl -i 'http://localhost:8055/purchase-flow-accept/accept?token=probe'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `curl -i 'http://localhost:8055/purchase-flow-accept/accept?token=probe'` Expected: Endpoint exists and returns
`PURCHASE_FLOW_ACCEPT_ERROR` for invalid token; with a valid token it currently redirects to
`/admin/content/inquiry_items/:id`.

- [ ] **Step 3: Write minimal implementation**

```js
function redirectToInquiry(res, env, inquiryItemId) {
	const purchaseAppUrl = env.PUBLIC_PURCHASE_APP_URL || env.PUBLIC_APP_URL || 'http://localhost:5173';
	return res.redirect(`${purchaseAppUrl}/inquiry-items/${inquiryItemId}/detail`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `curl -i 'http://localhost:8055/purchase-flow-accept/accept?token=probe'` Expected: invalid token still returns
structured error. With a valid token, redirect location is `${PUBLIC_PURCHASE_APP_URL}/inquiry-items/:id/detail`.

- [ ] **Step 5: Refactor and verify**

Do not change token validation logic.

Run: `pnpm --filter @purchase-flow/web test` Run: `pnpm --filter @purchase-flow/web build` Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add extensions/purchase-flow-accept/dist/index.js
git commit -m "feat: redirect accepted inquiries to purchase app"
```

### Task 10: Final Verification and Documentation

**Files:**

- Modify: `purchase-flow-implementation.md`
- Optional Create: `.changeset/<generated-name>.md` if this is prepared as a release PR

- [ ] **Step 1: Identify or write the failing test**

Identify final checks:

```bash
pnpm --filter @purchase-flow/web test
pnpm --filter @purchase-flow/web build
pnpm lint
pnpm format
```

- [ ] **Step 2: Run checks before final edits**

Run: `pnpm --filter @purchase-flow/web test` Run: `pnpm --filter @purchase-flow/web build` Expected: all PASS.

- [ ] **Step 3: Write minimal documentation update**

Append:

```markdown
## 独立前端页面

新增独立 Vue 前端应用：`business-apps/purchase-flow/web`。

询价项 直接使用 `inquiry_items`，一个询价项就是一个报价 询价项。

页面：登录、我的任务、客户管理、供应商管理、询价项列表、询价项摘要、询价项完整详情。

注意：沟通并切换状态当前由前端串联 `conversations` 创建和 `inquiry_items` 状态更新完成，后续建议补原子业务 Endpoint。
```

- [ ] **Step 4: Run checks after final edits**

Run: `pnpm --filter @purchase-flow/web test` Run: `pnpm --filter @purchase-flow/web build` Run: `pnpm lint` Run:
`pnpm format` Expected: all PASS.

- [ ] **Step 5: Refactor and verify**

Remove unused imports and placeholder copy. Confirm no valid tests were weakened.

Run: `git status --short` Run: `git diff --name-only main...HEAD` Expected: only planned files changed.

- [ ] **Step 6: Commit**

```bash
git add business-apps/purchase-flow/web package.json pnpm-workspace.yaml purchase-flow-implementation.md extensions/purchase-flow-accept/dist/index.js
git commit -m "docs: document purchase web app"
```

## 后端补强建议（不阻塞第一版前端）

1. 新增 `GET /purchase-flow/inquiry-items/:id` 聚合接口，但内部继续以 `inquiry_items.id` 为 询价项 主键。

2. 新增 `POST /purchase-flow/inquiry-items/:id/conversations` 原子接口，支持创建沟通记录并可选更新
   `inquiry_items.state`。

3. 增加 `RequoteRequested` 状态，或明确“再次报价”使用 `Purchasing` 的业务含义，并同步任务统计、权限、中文翻译。

4. 在 `supplier_quotes`、`customer_quotes`、`conversations` create/update 后刷新任务统计，或增加统一 timeline 字段。

5. 收窄权限，避免独立前端用户通过 API 读取或修改非本人任务、Token 哈希、规则配置。

6. 将附件与 `directus_files` 建立关系，替换裸 `file_url` 和 JSON 附件数组。

## 手工验收场景（仅作辅助，不能替代自动检查）

1. 使用 `sales@example.com` 登录独立前端，能看到自己的 Draft 和 WaitingSalesReview 任务。

2. 使用 `buyer1@example.com` 登录独立前端，能看到自己的 Assigned 和 Purchasing 任务，并看到最新一步。

3. 客户页面能新增、编辑、删除客户。

4. 供应商页面能新增、编辑、删除供应商。

5. 询价项列表中的每条记录来自 `inquiry_items`。

6. 询价项摘要页能看到询价重点和供应商报价重点。

7. 询价项完整详情页能看到询价、供应商报价、客户报价和沟通记录。

8. 在 询价项完整详情页新增沟通并选择“补充报价信息”，`inquiry_items.state` 变为 `WaitingSalesReview`。

9. 在 询价项完整详情页新增沟通并选择“再次报价”，`inquiry_items.state` 变为 `Purchasing`。

10. 采购员接单链接成功后跳转到独立前端 `/inquiry-items/:id/detail`。
