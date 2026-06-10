# 外贸询价采购报价流程落地记录

更新时间：2026-06-09

## 目标

在当前 Directus 项目中配置一套外贸询价、采购分配、供应商报价、客户报价、沟通、附件、经理审批和用户任务统计流程。

核心诉求：

- 外贸员创建询价项。
- 系统自动分配采购员。
- 企业微信通知采购员。
- 采购员点击接单链接后才算开始处理。
- 非被分配采购员点击链接不能生效。
- 用户可以看到自己的任务统计。
- 经理可以看到未完成采购单状态。
- 自定义集合和字段尽量中文显示。

## 主要集合

### customers 客户

字段：

- `id`
- `customer_code` 客户编码
- `customer_name` 客户名称
- `country` 国家
- `address` 地址
- `website` 网站
- `remark` 备注
- `status` 状态

### customer_contacts 客户联系人

字段：

- `id`
- `customer_id` 客户
- `name` 姓名
- `position` 职位
- `phone` 电话
- `email` 邮箱
- `wechat` 微信
- `remark` 备注

### suppliers 供应商

字段：

- `id`
- `supplier_code` 供应商编码
- `supplier_name` 供应商名称
- `supplier_type` 类型
- `buyer_id` 采购负责人
- `country` 国家
- `tax_rate` 税率
- `payment_term` 付款方式
- `website` 网站
- `remark` 备注
- `status` 状态

### supplier_contacts 供应商联系人

字段：

- `id`
- `supplier_id` 供应商
- `name` 姓名
- `position` 职位
- `phone` 电话
- `email` 邮箱
- `wechat` 微信
- `remark` 备注

### inquiry_items 询价项

字段：

- `id`
- `inquiry_no` 询价编号
- `customer_id` 客户
- `project_name` 项目名称
- `product_name` 产品名称
- `brand` 品牌
- `model` 型号
- `specification` 规格参数
- `quantity` 数量
- `unit` 单位
- `target_price` 目标价格
- `priority` 优先级
- `sales_owner_id` 外贸员
- `buyer_owner_id` 采购员
- `state` 当前状态
- `remark` 备注
- `attachment_ids` 附件
- `tags` 标签
- `accepted_at` 开始处理时间
- `assignment_deadline` 分配超时时间
- `next_reminder_at` 下次提醒时间
- `completed_at` 完成时间
- `created_at` 创建时间
- `updated_at` 更新时间

状态：

- `Draft`
- `Assigned`
- `Purchasing`
- `WaitingSalesReview`
- `Quoted`
- `Closed`

优先级：

- `Low`
- `Normal`
- `High`
- `Urgent`

### supplier_quotes 供应商报价

这是采购员填写的供应商报价。

字段：

- `id`
- `inquiry_item_id` 询价项
- `supplier_id` 供应商
- `price` 采购价格
- `currency` 币种
- `lead_time` 货期
- `inquiry_price` 询价价格
- `inquiry_coef` 询价系数
- `remark` 备注
- `attachment_ids` 附件
- `quoted_by` 报价人
- `quoted_at` 报价时间
- `is_recommended` 推荐报价

### customer_quotes 客户报价

字段：

- `id`
- `inquiry_item_id` 询价项
- `customer_id` 客户
- `price` 销售价格
- `currency` 币种
- `lead_time` 货期
- `remark` 备注
- `attachment_ids` 附件
- `quoted_by` 报价人
- `quoted_at` 报价时间
- `approval_status` 审批状态

审批状态：

- `NotRequired`
- `Pending`
- `Approved`
- `Rejected`

### conversations 沟通会话

字段：

- `id`
- `inquiry_item_id` 报价项
- `actor_id` 操作人
- `content` 内容
- `metadata` 扩展数据
- `created_at` 创建时间

### attachments 附件

字段：

- `id`
- `file_name` 文件名
- `file_url` 文件地址
- `file_size` 文件大小
- `mime_type` 文件类型
- `uploaded_by` 上传人
- `uploaded_at` 上传时间

### buyer_profiles 采购员画像

用于自动分配采购员。

字段：

- `id`
- `buyer_id` 采购员
- `tags` 采购标签
- `brands` 熟悉品牌
- `score` 评分
- `active_task_count` 进行中任务数
- `completed_task_count` 已完成任务数
- `is_available` 是否可分配

### priority_rules 优先级规则

字段：

- `id`
- `priority` 优先级
- `assignment_timeout_minutes` 分配超时分钟
- `reminder_interval_minutes` 定时提醒分钟
- `approval_threshold` 经理审批金额阈值

默认规则：

- `Low`: 240 分钟超时，120 分钟提醒
- `Normal`: 120 分钟超时，60 分钟提醒
- `High`: 60 分钟超时，30 分钟提醒
- `Urgent`: 30 分钟超时，10 分钟提醒

注意：之前执行时出现过重复规则，已建议只保留每个优先级一条。

### assignment_rules 自动分配规则

字段：

- `id`
- `tag` 标签
- `brand` 品牌
- `buyer_id` 采购员
- `score` 规则评分
- `enabled` 启用

当前 Hook 没强依赖该集合，主要使用 `buyer_profiles`。

### assignment_accept_tokens 接单令牌

用于保证只有被分配采购员点击链接才算开始处理。

字段：

- `id`
- `inquiry_item_id` 询价项
- `buyer_id` 被分配采购员
- `token_hash` 接单令牌哈希
- `expires_at` 过期时间
- `used_at` 使用时间
- `created_at` 创建时间

明文 Token 不保存到数据库，只保存 SHA-256 哈希。

### manager_approvals 经理审批

字段：

- `id`
- `inquiry_item_id` 询价项
- `customer_quote_id` 客户报价
- `requested_by` 发起人
- `approved_by` 审批人
- `status` 审批状态
- `reason` 审批原因
- `created_at` 创建时间
- `approved_at` 审批时间

### user_task_summaries 用户任务统计

用于展示“我的任务”。

字段：

- `id`
- `user_id` 用户
- `role_scope` 统计角色
- `active_task_count` 进行中任务数
- `total_completed_task_count` 累计完成任务数
- `weekly_completed_task_count` 本周完成任务数
- `active_task_details` 进行中任务详情
- `weekly_completed_task_details` 本周完成任务详情
- `refreshed_at` 刷新时间

`id` 已配置为隐藏。列表显示模板已配置为：

```text
{{user_id.email}} / {{user_id.first_name}} {{user_id.last_name}} / {{role_scope}}
```

字段顺序优先显示：用户、统计角色、进行中、累计完成、本周完成、刷新时间、详情。

## 角色与用户

角色：

- 外贸员
- 采购员
- 经理

默认初始化用户：

| 角色   | 邮箱                  | 密码       |
| ------ | --------------------- | ---------- |
| 外贸员 | `sales@example.com`   | `12345678` |
| 采购员 | `buyer1@example.com`  | `12345678` |
| 采购员 | `buyer2@example.com`  | `12345678` |
| 经理   | `manager@example.com` | `12345678` |

默认采购员画像：

- buyer1: `tags=electronics,connector`, `brands=Omron,Siemens`, `score=90`
- buyer2: `tags=hardware,mechanical`, `brands=ABB,Schneider`, `score=85`

企业微信 @ 人需要维护：

```text
directus_users.wechat_work_userid
```

这里要填企业微信通讯录里的 userid，不是邮箱、手机号或姓名。

## 自动分配规则

Hook 中自动分配采购员规则：

1. 查询 `buyer_profiles.is_available = true` 的采购员。
2. 按分数排序。
3. 评分规则：
   - `active_task_count = 0` 且采购员 `tags` 命中询价项 `tags`，加 1000 分。
   - 采购员 `brands` 命中询价项 `brand`，加 500 分。
   - 历史完成过相同品牌，加 300 分。
   - 加上 `buyer_profiles.score`。
   - 每个进行中任务扣 10 分。
4. 选分数最高的采购员。

如果外贸员手动指定了 `buyer_owner_id`，Hook 尊重手动指定，不重新分配。

分配后：

- `buyer_owner_id` 写入采购员。
- `state` 从 `Draft` 改成 `Assigned`。
- 根据 `priority_rules` 写入 `assignment_deadline`。
- 根据 `priority_rules` 写入 `next_reminder_at`。
- 创建 `assignment_accept_tokens`。
- 如果配置了 `WECHAT_WORK_WEBHOOK_URL`，发送企业微信通知。
- 如果用户有 `wechat_work_userid`，企业微信消息会加 `<@userid>`。

## 接单链接

Endpoint：

```text
GET /purchase-flow-accept/accept?token=xxx
```

逻辑：

- 没有 token，返回 400。
- 未登录，返回 401。
- token 不存在、过期或校验失败，返回 403。
- 当前登录用户不是 token 绑定采购员，返回 403。
- 询价项已经重新分配给别人，返回 403。
- 校验通过后：
  - `inquiry_items.accepted_at = now`
  - `inquiry_items.state = Purchasing`
  - `assignment_accept_tokens.used_at = now`
  - 跳转到询价项详情页。

注意：A 拿到 B 的接单链接点击不会生效，只有 B 登录后点击才会开始处理。

## 用户任务统计规则

当前已修正为按真实角色生成统计。

只生成：

- 外贸员用户：`Sales`
- 采购员用户：`Buyer`
- 经理用户：`Manager`

进行中任务规则：

- `Sales`: `state in Draft, WaitingSalesReview`
- `Buyer`: `state in Assigned, Purchasing`
- `Manager`: `state in Assigned, Purchasing, WaitingSalesReview`

完成任务规则：

- `state in Quoted, Closed`

本周完成任务规则：

- `state in Quoted, Closed`
- `completed_at >= 本周一 00:00:00`

当前重算后的统计结果曾为：

| 用户                  | 姓名   | 角色    | 进行中 | 累计完成 | 本周完成 |
| --------------------- | ------ | ------- | -----: | -------: | -------: |
| `buyer1@example.com`  | 采购 B | Buyer   |      2 |        0 |        0 |
| `buyer2@example.com`  | 采购 C | Buyer   |      1 |        0 |        0 |
| `manager@example.com` | 经理 M | Manager |      3 |        0 |        0 |
| `sales@example.com`   | 外贸 A | Sales   |      1 |        0 |        0 |

## 脚本清单

### 全量/基础初始化

- `scripts/init-purchase-flow.sh`
  - 总入口。
  - 执行集合、关系、权限、优先级规则、翻译、Hook、Endpoint、可选 Flow。
  - 适合新环境初始化或确认幂等的基础配置重跑。
  - 已部署环境不建议把字段升级都放到全量初始化里执行；字段新增、字段属性调整、权限细化等后续变更应新增独立增量脚本。

- `scripts/init-purchase-flow-collections.sh`
  - 创建业务集合和字段。

- `scripts/init-purchase-flow-relations.sh`
  - 创建关系。

- `scripts/init-purchase-flow-permissions.sh`
  - 创建外贸员、采购员、经理角色和权限。

- `scripts/init-purchase-flow-assignment-rules.sh`
  - 初始化优先级规则。

- `scripts/init-purchase-flow-users.sh`
  - 创建默认外贸员、两个采购员、经理。
  - 给两个采购员创建 `buyer_profiles`。

- `scripts/init-purchase-flow-master-data.sh`
  - 创建客户、客户联系人、供应商、供应商联系人。

- `scripts/init-purchase-flow-translations.sh`
  - 写入集合和字段中文翻译。

### 增量/修复脚本

- `scripts/init-purchase-flow-task-summary.sh`
  - 增量创建 `user_task_summaries`。
  - 修复过 schema 为 null 的坏集合问题，存在判断要求 `schema != null`。

- `scripts/configure-user-task-summary-display.sh`
  - 配置用户任务统计列表显示模板和字段排序。

- `scripts/rebuild-user-task-summaries.sh`
  - 删除旧统计记录。
  - 按最新规则重建统计。

### 扩展安装脚本

- `scripts/install-purchase-flow-auto-id-hook.sh`
  - 安装 Hook。
  - 标准 Directus 扩展格式：`extensions/purchase-flow-auto-id/package.json` + `dist/index.js`。
  - 当前脚本只从 `extensions/purchase-flow-auto-id` 复制真实扩展包，不再内嵌 JS 代码。
  - 功能：自动 UUID、自动分配、设置超时/提醒、生成 Token、企业微信通知、刷新任务统计。

- `scripts/install-purchase-flow-accept-endpoint.sh`
  - 安装 Endpoint。
  - 标准 Directus 扩展格式：`extensions/purchase-flow-accept/package.json` + `dist/index.js`。
  - 当前脚本只从 `extensions/purchase-flow-accept` 复制真实扩展包，不再内嵌 JS 代码。
  - 提供接单链接接口。

- `scripts/install-purchase-flow-actions-endpoint.sh`
  - 安装通用业务动作 Endpoint。
  - 标准 Directus 扩展格式：`extensions/purchase-flow-actions/package.json` + `dist/index.js`。
  - 当前脚本只从 `extensions/purchase-flow-actions` 复制真实扩展包，不内嵌 JS 代码。
  - 提供第一阶段原子沟通与状态切换接口。
  - 提供历史类似报价推荐查询接口。

- `scripts/install-purchase-flow-scanner-endpoint.sh`
  - 安装采购流程扫描 Endpoint。
  - 标准 Directus 扩展格式：`extensions/purchase-flow-scanner/package.json` + `dist/index.js`。
  - 当前脚本只从 `extensions/purchase-flow-scanner` 复制真实扩展包，不内嵌 JS 代码。
  - 提供超时自动重分配扫描和供应商报价缺字段提醒扫描接口。

## Directus 扩展目录注意事项

## 采购流程插件目录职责总览

当前共有 4 个采购流程插件目录：

```text
extensions/purchase-flow-auto-id
extensions/purchase-flow-accept
extensions/purchase-flow-actions
extensions/purchase-flow-scanner
```

### `purchase-flow-auto-id`

类型：

```text
Hook
```

安装脚本：

```text
scripts/install-purchase-flow-auto-id-hook.sh
```

主要职责：

- 监听采购流程相关集合的 `items.create`。
- 给自定义业务集合自动补 UUID 主键。
- 创建 `inquiry_items` 时自动生成 `inquiry_no`，格式类似 `INQ-20260609-0001`。
- 创建或更新 `inquiry_items` 后，自动执行采购分配准备逻辑。
- 如果外贸员未手动指定 `buyer_owner_id`，按采购员画像自动选择采购员。
- 将新询价项从 `Draft` 推进到 `Assigned`。
- 根据 `priority_rules` 写入 `assignment_deadline` 和 `next_reminder_at`。
- 创建 `assignment_accept_tokens` 接单 Token，只保存 SHA-256 哈希。
- 根据 `PUBLIC_PURCHASE_APP_URL` 或 `PUBLIC_APP_URL` 生成接单链接。
- 优先根据 `PUBLIC_PURCHASE_FLOW_WEB_URL` 生成独立前端接单链接，兼容回退到 `PUBLIC_PURCHASE_APP_URL` 或 `PUBLIC_APP_URL`。
- 如果配置 `WECHAT_WORK_WEBHOOK_URL`，向采购员发送企业微信通知。
- 刷新采购员 `buyer_profiles.active_task_count` 和 `completed_task_count`。
- 刷新外贸员、采购员、经理的 `user_task_summaries`。

触发方式：

- 用户或接口创建采购流程相关业务记录时自动触发。
- 创建或更新 `inquiry_items` 时自动触发分配、通知和统计刷新。

适用场景：

- 外贸员新建询价项后，系统自动分配采购员。
- 自动生成接单链接并通知采购员。
- 保持“我的任务”统计随询价项变更更新。

### `purchase-flow-accept`

类型：

```text
Endpoint
```

安装脚本：

```text
scripts/install-purchase-flow-accept-endpoint.sh
```

接口：

```text
GET /purchase-flow-accept/accept?token=xxx
GET /purchase-flow-accept/accept-json?token=xxx
```

主要职责：

- 校验接单链接中的明文 Token。
- 将明文 Token 做 SHA-256 后匹配 `assignment_accept_tokens.token_hash`。
- 校验当前用户已登录。
- 校验 Token 未过期、未被其他人使用。
- 校验当前登录用户就是 Token 绑定的采购员。
- 校验询价项当前仍分配给该采购员，防止超时重分配后旧链接继续生效。
- 接单成功后写入 `inquiry_items.accepted_at`。
- 将 `inquiry_items.state` 从 `Assigned` 推进到 `Purchasing`。
- 写入 `assignment_accept_tokens.used_at`。
- `/accept` 成功后跳转到独立前端询价详情页。
- `/accept` 成功后优先跳转到 `PUBLIC_PURCHASE_FLOW_WEB_URL` 对应的独立前端询价详情页。
- `/accept-json` 返回 JSON，方便独立前端或测试直接处理。

触发方式：

- 采购员点击企业微信中的接单链接。
- 独立前端接单页调用 `/accept-json`。

适用场景：

- 确保只有被分配采购员本人可以开始处理询价。
- 防止其他用户拿到链接后越权接单。
- 防止询价项重新分配后旧接单链接继续生效。

### `purchase-flow-actions`

类型：

```text
Endpoint
```

安装脚本：

```text
scripts/install-purchase-flow-actions-endpoint.sh
```

接口：

```text
POST /purchase-flow-actions/communicate-and-transition
GET /purchase-flow-actions/inquiries/:id/similar-quotes
POST /purchase-flow-actions/submit-customer-quote
POST /purchase-flow-actions/approve-customer-quote
```

#### 原子沟通与状态切换

接口：

```text
POST /purchase-flow-actions/communicate-and-transition
```

主要职责：

- 替代前端串联 `conversations` 创建和 `inquiry_items.state` 更新。
- 校验当前用户已登录。
- 校验询价项存在。
- 校验当前用户是否有权限操作该询价项。
- 校验状态切换是否合法。
- 在同一个数据库事务里创建 `conversations` 记录并更新 `inquiry_items.state`。
- 如果目标状态是 `Quoted` 或 `Closed`，写入 `completed_at`。
- 事务成功后刷新相关用户的 `user_task_summaries`。
- 刷新采购员 `buyer_profiles.active_task_count` 和 `completed_task_count`。

当前允许的状态切换：

```text
Purchasing -> WaitingSalesReview
WaitingSalesReview -> Purchasing
WaitingSalesReview -> Quoted
Quoted -> Closed
```

当前权限规则：

- `Manager` 可执行当前允许的状态切换。
- `Buyer` 只能对自己负责的询价项执行 `Purchasing -> WaitingSalesReview`。
- `Sales` 只能对自己负责的询价项执行 `WaitingSalesReview -> Purchasing`、`WaitingSalesReview -> Quoted`、`Quoted -> Closed`。

适用场景：

- 采购员完成采购询价后，带沟通记录推进到外贸员复核。
- 外贸员退回采购员补充报价。
- 外贸员确认客户报价后推进到已报价。
- 外贸员或经理关闭询价项。

#### 历史类似报价推荐

接口：

```text
GET /purchase-flow-actions/inquiries/:id/similar-quotes
```

主要职责：

- 根据当前询价项查询历史类似供应商报价。
- 校验当前用户是否有权限查看该询价项。
- 查询历史 `supplier_quotes`，并关联历史 `inquiry_items` 和 `suppliers`。
- 排除当前询价项。
- 只使用历史询价项状态为 `Quoted` 或 `Closed` 的报价。
- 按规则评分并返回 Top N 推荐结果。

当前评分规则：

```text
brand 完全匹配：+500
model 完全匹配：+400
product_name 关键词命中：每个关键词 +80，最多 +200
历史推荐报价：+80
报价时间较近：最多 +100
```

查询参数：

- `limit`：返回数量，默认 10，最大 50。
- `candidate_limit`：候选报价数量，默认 200，最大 500。

适用场景：

- 询价详情页展示历史类似报价。
- 采购员参考历史供应商价格、货期和供应商。
- 网页端实现“一键带入”供应商报价表单。

#### 客户报价提交与经理审批

接口：

```text
POST /purchase-flow-actions/submit-customer-quote
POST /purchase-flow-actions/approve-customer-quote
```

`submit-customer-quote` 主要职责：

- 仅允许询价项外贸负责人提交客户报价。
- 仅允许 `WaitingSalesReview` 状态提交客户报价。
- 创建 `customer_quotes`。
- 根据 `priority_rules.approval_threshold` 判断是否需要经理审批。
- 未超过审批阈值时，`customer_quotes.approval_status = NotRequired`，并将询价项推进到 `Quoted`。
- 超过审批阈值时，`customer_quotes.approval_status = Pending`，创建 `manager_approvals`，询价项保持 `WaitingSalesReview`。
- 创建 `conversations` 记录说明报价和是否触发审批。
- 刷新外贸员、采购员、经理任务统计和采购员任务数。

`submit-customer-quote` 请求示例：

```json
{
	"inquiry_item_id": "询价项ID",
	"price": 150,
	"currency": "USD",
	"lead_time": "10天",
	"remark": "按推荐供应商报价加成后给客户报价。",
	"approval_reason": "客户报价超过审批阈值时的审批说明。"
}
```

`approve-customer-quote` 主要职责：

- 仅允许经理审批。
- 仅处理 `manager_approvals.status = Pending` 的审批记录。
- 审批通过时，更新 `manager_approvals.status = Approved`、`customer_quotes.approval_status = Approved`，并将询价项推进到 `Quoted`。
- 审批拒绝时，更新 `manager_approvals.status = Rejected`、`customer_quotes.approval_status = Rejected`，并将询价项保持或退回 `WaitingSalesReview`。
- 审批通过时写入 `completed_at`。
- 创建 `conversations` 记录说明审批结果。
- 刷新外贸员、采购员、经理任务统计和采购员任务数。

`approve-customer-quote` 请求示例：

```json
{
	"approval_id": "审批记录ID",
	"decision": "Approved",
	"reason": "价格合理，同意报价。"
}
```

拒绝示例：

```json
{
	"approval_id": "审批记录ID",
	"decision": "Rejected",
	"reason": "利润率不足，请重新调整客户报价。"
}
```

### `purchase-flow-scanner`

类型：

```text
Endpoint
```

安装脚本：

```text
scripts/install-purchase-flow-scanner-endpoint.sh
```

接口：

```text
POST /purchase-flow-scanner/run
POST /purchase-flow-scanner/scan-assignment-timeouts
POST /purchase-flow-scanner/scan-supplier-quote-reminders
```

鉴权方式：

- 已登录经理用户可以手动触发。
- 配置 `PURCHASE_FLOW_SCANNER_SECRET` 后，可以通过 `x-purchase-flow-scanner-secret` Header 由定时任务触发。

#### 超时自动重分配扫描

接口：

```text
POST /purchase-flow-scanner/scan-assignment-timeouts
```

扫描条件：

```text
inquiry_items.state = Assigned
accepted_at is null
assignment_deadline <= now
```

主要职责：

- 查找已经超过接单截止时间、但采购员还没有接单的询价项。
- 优先排除原采购员，从 `buyer_profiles.is_available = true` 的采购员中重新评分选择采购员。
- 如果没有其他可用采购员，则回退到任一可用采购员。
- 作废旧的未使用 `assignment_accept_tokens`。
- 更新 `inquiry_items.buyer_owner_id`、`assignment_deadline`、`next_reminder_at`。
- 创建新的接单 Token。
- 写入 `conversations` 记录说明系统已超时重分配。
- 刷新新旧采购员、外贸员、经理的任务统计。
- 如果配置 `WECHAT_WORK_WEBHOOK_URL`，通知新采购员。

适用场景：

- 采购员长时间没有点击接单链接时，系统自动换人处理。
- 经理无需人工检查每个未接单询价项。

#### 供应商报价缺字段提醒扫描

接口：

```text
POST /purchase-flow-scanner/scan-supplier-quote-reminders
```

扫描条件：

```text
inquiry_items.state = Purchasing
buyer_owner_id is not null
next_reminder_at is null 或 next_reminder_at <= now
```

检查字段：

```text
supplier_id
price
currency
lead_time
inquiry_price
quoted_by
quoted_at
```

主要职责：

- 检查采购中的询价项是否缺少供应商报价信息。
- 如果没有供应商报价，则认为所有必填报价字段都缺失。
- 如果存在推荐报价，则优先检查推荐报价。
- 如果没有推荐报价，则检查第一条供应商报价。
- 对缺字段的询价项写入 `conversations` 提醒记录。
- 更新 `next_reminder_at`，避免短时间内重复提醒。
- 如果配置 `WECHAT_WORK_WEBHOOK_URL`，向采购员发送企业微信提醒。

适用场景：

- 采购员已接单但迟迟没有补齐供应商报价。
- 供应商报价缺少价格、币种、货期等关键信息时自动提醒。

#### 组合扫描

接口：

```text
POST /purchase-flow-scanner/run
```

主要职责：

- 一次触发超时自动重分配扫描。
- 一次触发供应商报价缺字段提醒扫描。

适用场景：

- 生产环境通过 `cron`、进程管理器定时任务或 Directus Flow 定时调用。
- 推荐优先调用该组合接口，减少定时任务配置数量。

### 插件职责边界

```text
purchase-flow-auto-id：事件驱动，负责创建/更新询价时的自动编号、自动分配、接单 Token、通知和统计刷新。
purchase-flow-accept：用户点击接单链接时执行接单校验，并把询价推进到 Purchasing。
purchase-flow-actions：前端业务操作接口，负责原子状态流转和历史类似报价推荐。
purchase-flow-scanner：定时扫描接口，负责超时重分配和供应商报价缺字段提醒。
```

这 4 个插件共同覆盖：创建询价、自动分配、接单、状态推进、历史推荐、超时处理、报价提醒、企业微信通知和任务统计刷新。

## 用户任务统计刷新机制

`user_task_summaries` 由服务端维护，网页端不应直接写入或自行计算任务统计。网页端只读取 `user_task_summaries`，或后续读取服务端聚合接口。

当前采用保守方案：各插件在自己的业务动作完成后刷新统计，不额外引入共享模块，避免 Directus 扩展部署路径和加载顺序变复杂。

当前刷新触发点：

| 触发点 | 负责插件/脚本 | 当前状态 | 刷新内容 |
| ------ | ------------- | -------- | -------- |
| 询价项创建 | `purchase-flow-auto-id` | 已实现 | 外贸员、采购员、经理任务统计；采购员任务数 |
| 自动分配采购员 | `purchase-flow-auto-id` | 已实现 | 外贸员、采购员、经理任务统计；采购员任务数 |
| 接单 | `purchase-flow-accept` | 已实现 | 外贸员、采购员、经理任务统计；采购员任务数 |
| 通用状态变更 | `purchase-flow-actions` | 已实现 | 外贸员、采购员、经理任务统计；采购员任务数 |
| 超时重分配 | `purchase-flow-scanner` | 已实现 | 外贸员、新旧采购员、经理任务统计；新旧采购员任务数 |
| 供应商报价缺字段提醒 | `purchase-flow-scanner` | 不改变统计 | 只写沟通提醒和更新 `next_reminder_at` |
| 历史类似报价推荐 | `purchase-flow-actions` | 不改变统计 | 只读查询，不写统计 |
| 手动重建统计 | `scripts/rebuild-user-task-summaries.sh` | 已实现 | 删除旧统计后按当前规则全量重建 |
| 客户报价提交 | `purchase-flow-actions` | 已实现 | 外贸员、采购员、经理任务统计；采购员任务数 |
| 审批完成 | `purchase-flow-actions` | 已实现 | 外贸员、采购员、经理任务统计；采购员任务数 |
| 供应商报价提交 | 后续明确业务动作 Endpoint | 待后续实现 | 应刷新外贸员、采购员、经理任务统计；采购员任务数 |

当前统计口径：

```text
Sales 进行中：state in Draft, WaitingSalesReview
Buyer 进行中：state in Assigned, Purchasing
Manager 进行中：state in Assigned, Purchasing, WaitingSalesReview
完成任务：state in Quoted, Closed
本周完成：state in Quoted, Closed 且 completed_at >= 本周一 00:00:00
```

当前接单刷新说明：

- `purchase-flow-accept` 在采购员首次成功接单后，将 `inquiry_items.state` 更新为 `Purchasing`。
- 同时写入 `assignment_accept_tokens.used_at`。
- 事务完成后刷新外贸员、采购员、经理的 `user_task_summaries`。
- 同步刷新采购员 `buyer_profiles.active_task_count` 和 `buyer_profiles.completed_task_count`。
- 如果 Token 已经使用过，再次访问只返回询价项，不重复刷新统计。

当前排查发现 Directus 新版本不会加载旧格式：

```text
extensions/hooks/name/index.js
extensions/endpoints/name/index.js
```

需要标准包格式：

```text
extensions/purchase-flow-auto-id/package.json
extensions/purchase-flow-auto-id/dist/index.js
extensions/purchase-flow-accept/package.json
extensions/purchase-flow-accept/dist/index.js
extensions/purchase-flow-actions/package.json
extensions/purchase-flow-actions/dist/index.js
extensions/purchase-flow-scanner/package.json
extensions/purchase-flow-scanner/dist/index.js
```

`package.json` 必须包含 `directus:extension`，且当前版本要求 `source` 和 `sandbox`。

示例：

```json
{
	"directus:extension": {
		"type": "endpoint",
		"path": "dist/index.js",
		"source": "src/index.js",
		"sandbox": {
			"enabled": false,
			"requestedScopes": {}
		},
		"host": "^11.0.0"
	}
}
```

## 环境变量

Directus 服务进程需要：

```env
EXTENSIONS_PATH=/home/jswork/directus/extensions
PUBLIC_APP_URL=http://10.0.11.6:8055
PUBLIC_ADMIN_URL=http://10.0.11.6:8055/admin
PUBLIC_PURCHASE_FLOW_WEB_URL=http://10.0.11.6:5173
ACCEPT_TOKEN_TTL_HOURS=24
WECHAT_WORK_WEBHOOK_URL=企业微信机器人Webhook
PURCHASE_FLOW_SCANNER_SECRET=采购流程扫描接口密钥
PURCHASE_FLOW_SCAN_LIMIT=50
```

注意：

- `.env` 修改后必须重启 Directus。
- 曾经发现 Directus 进程没有读到 `.env`，建议启动时显式传环境变量，或确认服务进程实际 cwd 和 `.env` 位置。
- Directus 曾扫描 `/home/jswork/directus/extensions`，也曾使用
  `/home/jswork/directus/dist/extensions`，因此扩展安装脚本曾同步安装到两个目录。
- 接单链接和接单成功跳转优先使用 `PUBLIC_PURCHASE_FLOW_WEB_URL`，没有配置时回退到 `PUBLIC_PURCHASE_APP_URL`，再回退到 `PUBLIC_APP_URL`。

## 企业微信通知

当前 Hook 会在自动分配后通知采购员。

如果用户有：

```text
directus_users.wechat_work_userid
```

消息会加：

```text
<@userid>
```

群机器人 markdown 示例：

```text
<@buyer_userid>
**新的采购询价待处理**
询价编号：xxx
产品：xxx
品牌：xxx
优先级：High
接单链接：[点击开始处理](http://10.0.11.6:8055/purchase-flow-accept/accept?token=xxx)
```

## 中文化

Directus 用户语言在：

```text
directus_users.language
```

可以直接 SQL 设置：

```sql
UPDATE directus_users SET language = 'zh-CN';
```

自定义集合/字段中文化依赖：

```text
directus_collections.meta.translations
directus_fields.meta.translations
```

脚本：

```bash
./scripts/init-purchase-flow-translations.sh
```

下拉字段曾出现不能选择问题，原因是 `options` 需要 `choices` 格式。已修复脚本中的 `select_options()` 为：

```json
{
	"choices": [{ "text": "High", "value": "High" }]
}
```

## 常用执行命令

初始化任务统计增量：

```bash
BASE_URL=http://localhost:8055 \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=123456 \
./scripts/init-purchase-flow-task-summary.sh
```

配置任务统计列表：

```bash
BASE_URL=http://localhost:8055 \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=123456 \
./scripts/configure-user-task-summary-display.sh
```

重建用户任务统计：

```bash
BASE_URL=http://localhost:8055 \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=123456 \
./scripts/rebuild-user-task-summaries.sh
```

安装 Hook：

```bash
EXTENSIONS_PATH=/home/jswork/directus/extensions \
PUBLIC_APP_URL=http://10.0.11.6:8055 \
ACCEPT_TOKEN_TTL_HOURS=24 \
./scripts/install-purchase-flow-auto-id-hook.sh
```

安装 Endpoint：

```bash
EXTENSIONS_PATH=/home/jswork/directus/extensions \
PUBLIC_ADMIN_URL=http://10.0.11.6:8055/admin \
./scripts/install-purchase-flow-accept-endpoint.sh
```

安装业务动作 Endpoint：

```bash
EXTENSIONS_PATH=/home/jswork/directus/extensions \
./scripts/install-purchase-flow-actions-endpoint.sh
```

安装扫描 Endpoint：

```bash
EXTENSIONS_PATH=/home/jswork/directus/extensions \
./scripts/install-purchase-flow-scanner-endpoint.sh
```

测试 Endpoint 是否加载：

```bash
curl -i 'http://localhost:8055/purchase-flow-accept/accept?token=probe'
```

如果返回 `ROUTE_NOT_FOUND`，说明扩展没加载。

## 后续建议

经 2026-06-09 核对，原后续建议中除“优化权限”和“建议后续新增的明确业务动作 Endpoint”外，主体能力均已落地。

已完成：

1. 已新增独立业务页面：`business-apps/purchase-flow/web`，覆盖登录、我的任务、客户/供应商管理、询价列表、询价详情、接单页、供应商报价、客户报价展示、审批状态展示和任务统计展示。
2. 已补超时自动重分配扫描逻辑：`POST /purchase-flow-scanner/scan-assignment-timeouts`。
3. 已补供应商报价缺字段提醒逻辑：`POST /purchase-flow-scanner/scan-supplier-quote-reminders`。
4. 已补历史类似报价模糊推荐：`GET /purchase-flow-actions/inquiries/:id/similar-quotes`。
5. 已将 `user_task_summaries` 详情 JSON 在独立前端渲染为任务卡片、本周完成列表和快捷详情入口。
6. 已补服务端通用原子沟通与状态切换接口：`POST /purchase-flow-actions/communicate-and-transition`。
7. 已将独立前端沟通并切换状态迁移为调用 `POST /purchase-flow-actions/communicate-and-transition`，避免继续串联创建 `conversations` 和更新 `inquiry_items.state`。
8. 已补客户报价提交与经理审批接口：`POST /purchase-flow-actions/submit-customer-quote`、`POST /purchase-flow-actions/approve-customer-quote`。

仍需优化：

1. 优化 Directus 集合级权限，不要让外贸员、采购员、经理拥有过宽的集合级权限；集合权限应与服务端业务 Endpoint 的角色和负责人校验保持一致。
2. 供应商报价提交仍通过普通 CRUD 创建/更新 `supplier_quotes`，后续应封装为 `submit-supplier-quote`，统一校验权限、推进状态和刷新统计。

建议后续新增：

1. 新增 `POST /purchase-flow-actions/submit-supplier-quote`，把采购员提交供应商报价、写沟通记录、推进 `WaitingSalesReview` 和刷新统计统一封装到服务端。
2. 新增 `POST /purchase-flow-actions/return-to-purchasing`，把外贸员退回采购员补充报价封装为语义化业务动作。
3. 新增 `POST /purchase-flow-actions/close-inquiry`，把关闭询价和写入 `completed_at` 封装为语义化业务动作。

## 服务端已实现：超时重分配与供应商报价提醒扫描 Endpoint

已新增采购流程扫描 Endpoint：

```text
extensions/purchase-flow-scanner/package.json
extensions/purchase-flow-scanner/dist/index.js
```

接口：

```text
POST /purchase-flow-scanner/run
POST /purchase-flow-scanner/scan-assignment-timeouts
POST /purchase-flow-scanner/scan-supplier-quote-reminders
```

鉴权方式：

- 已登录经理用户可以手动触发。
- 或配置 `PURCHASE_FLOW_SCANNER_SECRET`，定时任务通过 `x-purchase-flow-scanner-secret` Header 触发。

### 超时自动重分配

扫描条件：

```text
inquiry_items.state = Assigned
accepted_at is null
assignment_deadline <= now
```

处理逻辑：

- 优先排除原采购员，从可用 `buyer_profiles` 中重新评分选择采购员。
- 如果没有其他可用采购员，则允许回退到原采购员或任一可用采购员。
- 作废旧的未使用 `assignment_accept_tokens`。
- 更新 `inquiry_items.buyer_owner_id`、`assignment_deadline`、`next_reminder_at`。
- 创建新的接单 Token。
- 写入一条 `conversations` 记录说明系统已超时重分配。
- 刷新新旧采购员、外贸员、经理的任务统计。
- 如果配置 `WECHAT_WORK_WEBHOOK_URL`，发送企业微信通知给新采购员。

手动触发示例：

```bash
curl -i -X POST 'http://localhost:8055/purchase-flow-scanner/scan-assignment-timeouts' \
  -H 'x-purchase-flow-scanner-secret: <PURCHASE_FLOW_SCANNER_SECRET>'
```

### 供应商报价缺字段提醒

扫描条件：

```text
inquiry_items.state = Purchasing
buyer_owner_id is not null
next_reminder_at is null 或 next_reminder_at <= now
```

检查字段：

```text
supplier_id
price
currency
lead_time
inquiry_price
quoted_by
quoted_at
```

处理逻辑：

- 如果没有供应商报价，则认为所有必填字段都缺失。
- 如果存在推荐报价，则检查推荐报价；否则检查第一条供应商报价。
- 如果字段缺失，更新 `next_reminder_at`，避免重复高频提醒。
- 创建一条 `conversations` 记录说明缺失字段。
- 如果配置 `WECHAT_WORK_WEBHOOK_URL`，发送企业微信提醒给采购员。

手动触发示例：

```bash
curl -i -X POST 'http://localhost:8055/purchase-flow-scanner/scan-supplier-quote-reminders' \
  -H 'x-purchase-flow-scanner-secret: <PURCHASE_FLOW_SCANNER_SECRET>'
```

同时触发两个扫描：

```bash
curl -i -X POST 'http://localhost:8055/purchase-flow-scanner/run' \
  -H 'x-purchase-flow-scanner-secret: <PURCHASE_FLOW_SCANNER_SECRET>'
```

生产环境建议用系统 `cron`、进程管理器定时任务或 Directus Flow 定时调用 `/purchase-flow-scanner/run`。扫描接口本身不常驻后台循环，避免在 Directus 扩展内创建不可控长任务。

## 服务端已实现：历史类似报价模糊推荐 Endpoint

已在业务动作 Endpoint 中新增历史类似报价查询接口：

```text
GET /purchase-flow-actions/inquiries/:id/similar-quotes
```

示例：

```bash
curl -i 'http://localhost:8055/purchase-flow-actions/inquiries/询价项ID/similar-quotes?limit=10' \
  -H 'Authorization: Bearer <access_token>'
```

鉴权规则：

- `Manager` 可以查看。
- `Sales` 只能查看自己负责询价项的类似报价。
- `Buyer` 只能查看自己负责询价项的类似报价。

查询范围：

- 从历史 `supplier_quotes` 中查询。
- 关联历史 `inquiry_items` 和 `suppliers`。
- 排除当前询价项。
- 只取历史询价项状态为 `Quoted` 或 `Closed` 的报价。
- 默认最多从最近 200 条候选报价中评分，可通过 `candidate_limit` 调整，上限 500。
- 默认返回 10 条，可通过 `limit` 调整，上限 50。

当前规则评分：

```text
brand 完全匹配：+500
model 完全匹配：+400
product_name 关键词命中：每个关键词 +80，最多 +200
历史推荐报价：+80
报价时间较近：最多 +100
```

返回字段：

```text
inquiry_item_id
inquiry_no
product_name
brand
model
supplier_quote_id
supplier_id
supplier_name
price
currency
lead_time
inquiry_price
inquiry_coef
remark
quoted_at
completed_at
is_recommended
score
matched_reasons
```

网页端只需要在询价详情页调用该接口，展示推荐结果，并提供“一键带入”到供应商报价表单的能力。相似度算法和权限控制统一由服务端负责。

## 第一阶段服务端已实现：通用原子沟通与状态切换 Endpoint

此前独立前端页面中，沟通并切换状态由前端串联完成：

1. 创建 `conversations` 沟通记录。
2. 更新 `inquiry_items.state`。

这种方式存在一致性风险：如果第一步成功、第二步失败，就会出现“有沟通记录但状态没变化”；如果状态更新成功但沟通记录失败，就会出现“状态已推进但没有过程说明”。

第一阶段已补一个通用服务端业务 Endpoint，把“写沟通记录”和“切换询价项状态”放到一个数据库事务里执行，确保一起成功或一起失败。独立前端已迁移为在状态切换时调用该 Endpoint。

建议 Endpoint：

```text
POST /purchase-flow-actions/communicate-and-transition
```

扩展文件：

```text
extensions/purchase-flow-actions/package.json
extensions/purchase-flow-actions/dist/index.js
```

请求示例：

```json
{
	"inquiry_item_id": "询价项ID",
	"content": "已完成供应商报价，请外贸员确认。",
	"next_state": "WaitingSalesReview"
}
```

当前服务端职责：

- 校验当前用户已登录。
- 校验询价项存在。
- 校验当前用户是否有权限操作该询价项。
- 校验当前状态是否允许切换到目标状态。
- 在事务中创建 `conversations` 记录。
- 在同一个事务中更新 `inquiry_items.state`。
- 如果目标状态是 `Quoted` 或 `Closed`，写入 `completed_at`。
- 刷新相关用户的 `user_task_summaries`。
- 刷新采购员 `buyer_profiles.active_task_count` 和 `buyer_profiles.completed_task_count`。

当前第一阶段允许的基础状态切换：

```text
Purchasing -> WaitingSalesReview
WaitingSalesReview -> Purchasing
WaitingSalesReview -> Quoted
Quoted -> Closed
```

该 Endpoint 不是页面功能，而是服务端业务接口。独立前端页面只调用一次该接口，避免继续直接串联 `conversations` 和 `inquiry_items` 两个集合写操作。

权限规则：

- `Manager` 可执行当前第一阶段允许的状态切换。
- `Buyer` 只能对自己负责的询价项执行 `Purchasing -> WaitingSalesReview`。
- `Sales` 只能对自己负责的询价项执行 `WaitingSalesReview -> Purchasing`、`WaitingSalesReview -> Quoted`、`Quoted -> Closed`。

测试接口示例：

```bash
curl -i -X POST 'http://localhost:8055/purchase-flow-actions/communicate-and-transition' \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  --data '{"inquiry_item_id":"询价项ID","content":"已完成供应商报价，请外贸员确认。","next_state":"WaitingSalesReview"}'
```

## 第一阶段之后的后续建议：明确业务动作 Endpoint

通用 `communicate-and-transition` Endpoint 落地后，再逐步把高频操作拆成语义更清晰的业务动作 Endpoint。这样前端不再直接传“我要切到什么状态”，而是传“我要完成什么业务动作”，由服务端决定状态如何变化、需要写哪些表、是否需要审批以及如何刷新统计。

当前状态：

- `submit-customer-quote` 已实现。
- `approve-customer-quote` 已实现。
- `submit-supplier-quote`、`return-to-purchasing`、`close-inquiry` 仍建议后续新增。
- 独立前端沟通状态切换已迁移到 `communicate-and-transition`，不再串联创建 `conversations` 和更新 `inquiry_items.state`。

建议后续新增或保留：

1. `POST /purchase-flow-actions/submit-supplier-quote`
   - 采购员提交供应商报价。
   - 创建 `supplier_quotes`。
   - 创建 `conversations`。
   - 将 `inquiry_items.state` 从 `Purchasing` 推进到 `WaitingSalesReview`。
   - 刷新采购员、外贸员、经理任务统计。

2. `POST /purchase-flow-actions/submit-customer-quote`
   - 外贸员提交客户报价。
   - 创建 `customer_quotes`。
   - 根据 `priority_rules.approval_threshold` 判断是否需要经理审批。
   - 不需要审批时推进到 `Quoted`。
   - 需要审批时创建 `manager_approvals`，并将客户报价标记为 `Pending`。
   - 创建 `conversations` 并刷新任务统计。
   - 当前已实现。

3. `POST /purchase-flow-actions/approve-customer-quote`
   - 经理审批客户报价。
   - 审批通过时更新 `manager_approvals.status = Approved`、`customer_quotes.approval_status = Approved`，并将询价项推进到 `Quoted`。
   - 审批拒绝时更新审批状态为 `Rejected`，并将询价项退回 `WaitingSalesReview`。
   - 创建审批沟通记录并刷新任务统计。
   - 当前已实现。

4. `POST /purchase-flow-actions/return-to-purchasing`
   - 外贸员发现供应商报价不完整或不合适时退回采购员补充。
   - 将 `inquiry_items.state` 从 `WaitingSalesReview` 改回 `Purchasing`。
   - 创建退回原因沟通记录。
   - 可选更新 `next_reminder_at` 并刷新任务统计。

5. `POST /purchase-flow-actions/close-inquiry`
   - 外贸员或经理关闭询价项。
   - 将 `inquiry_items.state` 改为 `Closed`。
   - 写入 `completed_at`。
   - 创建关闭原因沟通记录并刷新任务统计。

这些明确业务动作 Endpoint 建议放在第一阶段通用原子 Endpoint 稳定后继续补齐。客户报价和经理审批已完成，剩余重点是供应商报价提交、退回采购补充和关闭询价三个语义化动作。

## 独立前端页面

新增独立 Vue 前端应用：`business-apps/purchase-flow/web`。

询价项 直接使用 `inquiry_items`，一个询价项就是一个报价 询价项。

页面：登录、我的任务、客户管理、供应商管理、询价项列表、询价项摘要、询价项完整详情。

当前已完成：

- 登录和接单页：未登录访问接单链接时保存 Token，登录后继续接单，成功后跳转独立网页询价详情页。
- 我的任务：按采购员、外贸员、经理角色分组展示任务，支持优先级、状态、截止时间、客户、采购员筛选。
- 任务统计：将 `user_task_summaries.active_task_details` 和 `weekly_completed_task_details` 渲染为任务卡片、本周完成列表和快捷详情入口。
- 询价详情：展示基础信息、供应商报价列表、推荐报价、客户报价区、沟通时间线入口、附件区、状态流转入口和审批状态。
- 供应商报价：支持新增、本人编辑、本人删除、价格/币种/MOQ/货期校验、附件 URL、推荐报价勾选和草稿/提交提示。
- 沟通与状态切换：状态切换时调用 `POST /purchase-flow-actions/communicate-and-transition`，由服务端在事务内同时写沟通记录和更新询价状态。
- 客户与供应商管理：支持联系人展示、启用/停用状态切换、供应商负责人、供应商报价历史和客户历史询价。
- 状态与进度：新增中文状态映射，展示当前责任人、下一步动作和超时状态。

注意：供应商报价新增/编辑/删除当前仍使用 Directus 普通 CRUD，后续建议通过 `submit-supplier-quote` 等语义化业务动作 Endpoint 统一收口。
