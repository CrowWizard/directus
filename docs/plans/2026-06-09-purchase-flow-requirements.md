# 外贸询价采购报价流程需求说明

更新时间：2026-06-09

## 1. 业务目标

当前系统实现的是一套外贸业务中的“客户询价 -> 采购询价 -> 供应商报价 -> 外贸报价 -> 经理审批 -> 完成/关闭”工作流。

核心目标：

- 外贸员创建客户询价项。
- 系统自动按规则分配采购员。
- 系统生成接单 Token，并通过企业微信通知采购员。
- 采购员必须点击接单链接后，询价才进入实际处理状态。
- 非被分配采购员不能通过链接越权接单。
- 采购员填写供应商报价。
- 外贸员根据供应商报价提交客户报价。
- 客户报价超过阈值时需要经理审批。
- 经理可以查看未完成询价，并审批高额报价。
- 系统维护每个用户的任务统计。
- 系统定时扫描超时未接单任务并自动重分配。
- 系统定时提醒采购员补齐供应商报价关键信息。

## 2. 角色

| 角色 | 英文标识 | 主要职责 |
| --- | --- | --- |
| 外贸员 | `Sales` | 创建询价项、复核采购报价、提交客户报价、关闭询价 |
| 采购员 | `Buyer` | 接收分配、点击接单、填写供应商报价、提交给外贸复核 |
| 经理 | `Manager` | 查看未完成任务、审批高额报价、可代执行状态流转 |

权限核心规则：

- 外贸员只能操作自己负责的询价项。
- 采购员只能操作分配给自己的询价项。
- 经理可以查看和处理所有进行中询价项。
- 接单必须校验当前登录用户与 Token 绑定采购员一致。
- 定时扫描接口只能经理手动触发，或使用系统密钥触发。

## 3. 核心数据模型

### customers 客户

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `customer_code` | 客户编码 |
| `customer_name` | 客户名称 |
| `country` | 国家 |
| `address` | 地址 |
| `website` | 网站 |
| `remark` | 备注 |
| `status` | 状态 |

### customer_contacts 客户联系人

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `customer_id` | 客户 |
| `name` | 姓名 |
| `position` | 职位 |
| `phone` | 电话 |
| `email` | 邮箱 |
| `wechat` | 微信 |
| `remark` | 备注 |

### suppliers 供应商

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `supplier_code` | 供应商编码 |
| `supplier_name` | 供应商名称 |
| `supplier_type` | 类型 |
| `buyer_id` | 采购负责人 |
| `country` | 国家 |
| `tax_rate` | 税率 |
| `payment_term` | 付款方式 |
| `website` | 网站 |
| `remark` | 备注 |
| `status` | 状态 |

### supplier_contacts 供应商联系人

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `supplier_id` | 供应商 |
| `name` | 姓名 |
| `position` | 职位 |
| `phone` | 电话 |
| `email` | 邮箱 |
| `wechat` | 微信 |
| `remark` | 备注 |

### inquiry_items 询价项

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `inquiry_no` | 询价编号，如 `INQ-20260609-0001` |
| `customer_id` | 客户 |
| `project_name` | 项目名称 |
| `product_name` | 产品名称 |
| `brand` | 品牌 |
| `model` | 型号 |
| `specification` | 规格参数 |
| `quantity` | 数量 |
| `unit` | 单位 |
| `target_price` | 目标价格 |
| `priority` | 优先级 |
| `sales_owner_id` | 外贸负责人 |
| `buyer_owner_id` | 采购负责人 |
| `state` | 当前状态 |
| `remark` | 备注 |
| `attachment_ids` | 附件 |
| `tags` | 标签 |
| `accepted_at` | 接单时间 |
| `assignment_deadline` | 接单截止时间 |
| `next_reminder_at` | 下次提醒时间 |
| `completed_at` | 完成时间 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

### supplier_quotes 供应商报价

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `inquiry_item_id` | 询价项 |
| `supplier_id` | 供应商 |
| `price` | 采购价格 |
| `currency` | 币种 |
| `lead_time` | 货期 |
| `inquiry_price` | 询价价格 |
| `inquiry_coef` | 询价系数 |
| `moq` | 最小起订量，前端类型中存在 |
| `remark` | 备注 |
| `attachment_ids` | 附件 |
| `quoted_by` | 报价人 |
| `quoted_at` | 报价时间 |
| `is_recommended` | 是否推荐报价 |

### customer_quotes 客户报价

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `inquiry_item_id` | 询价项 |
| `customer_id` | 客户 |
| `price` | 销售价格 |
| `currency` | 币种 |
| `lead_time` | 货期 |
| `remark` | 备注 |
| `attachment_ids` | 附件 |
| `quoted_by` | 报价人 |
| `quoted_at` | 报价时间 |
| `approval_status` | 审批状态 |

### conversations 沟通记录

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `inquiry_item_id` | 询价项 |
| `actor_id` | 操作人 |
| `content` | 沟通内容 |
| `metadata` | 扩展数据，记录动作类型、状态变化等 |
| `created_at` | 创建时间 |

### buyer_profiles 采购员画像

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `buyer_id` | 采购员用户 |
| `tags` | 采购标签，逗号分隔 |
| `brands` | 熟悉品牌，逗号分隔 |
| `score` | 基础评分 |
| `active_task_count` | 进行中任务数 |
| `completed_task_count` | 已完成任务数 |
| `is_available` | 是否可分配 |

### priority_rules 优先级规则

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `priority` | 优先级 |
| `assignment_timeout_minutes` | 接单超时分钟 |
| `reminder_interval_minutes` | 提醒间隔分钟 |
| `approval_threshold` | 客户报价审批阈值 |

### assignment_accept_tokens 接单 Token

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `inquiry_item_id` | 询价项 |
| `buyer_id` | 被分配采购员 |
| `token_hash` | Token 的 SHA-256 哈希 |
| `expires_at` | 过期时间 |
| `used_at` | 使用时间 |
| `created_at` | 创建时间 |

### manager_approvals 经理审批

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `inquiry_item_id` | 询价项 |
| `customer_quote_id` | 客户报价 |
| `requested_by` | 发起人 |
| `approved_by` | 审批人 |
| `status` | 审批状态 |
| `reason` | 审批原因 |
| `created_at` | 创建时间 |
| `approved_at` | 审批时间 |

### user_task_summaries 用户任务统计

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `user_id` | 用户 |
| `role_scope` | 统计角色，`Sales`、`Buyer`、`Manager` |
| `active_task_count` | 进行中任务数 |
| `total_completed_task_count` | 累计完成任务数 |
| `weekly_completed_task_count` | 本周完成任务数 |
| `active_task_details` | 进行中任务详情快照 |
| `weekly_completed_task_details` | 本周完成任务详情快照 |
| `refreshed_at` | 刷新时间 |

## 4. 枚举定义

询价状态 `InquiryState`：

| 状态 | 含义 |
| --- | --- |
| `Draft` | 草稿/刚创建 |
| `Assigned` | 已分配采购员，等待采购员接单 |
| `Purchasing` | 采购员已接单，正在询价 |
| `WaitingSalesReview` | 采购员完成供应商询价，等待外贸复核 |
| `Quoted` | 已向客户报价 |
| `Closed` | 已关闭 |

优先级 `priority`：

| 值 | 含义 |
| --- | --- |
| `Low` | 低 |
| `Normal` | 普通 |
| `High` | 高 |
| `Urgent` | 紧急 |

客户报价审批状态 `approval_status`：

| 值 | 含义 |
| --- | --- |
| `NotRequired` | 不需要审批 |
| `Pending` | 待审批 |
| `Approved` | 已通过 |
| `Rejected` | 已拒绝 |

默认优先级规则：

| 优先级 | 接单超时 | 提醒间隔 |
| --- | ---: | ---: |
| `Low` | 240 分钟 | 120 分钟 |
| `Normal` | 120 分钟 | 60 分钟 |
| `High` | 60 分钟 | 30 分钟 |
| `Urgent` | 30 分钟 | 10 分钟 |

## 5. 状态机

| 当前状态 | 目标状态 | 触发人 | 场景 |
| --- | --- | --- | --- |
| `Draft` | `Assigned` | 系统 | 外贸员创建询价后自动分配 |
| `Assigned` | `Purchasing` | 被分配采购员 | 点击接单链接 |
| `Purchasing` | `WaitingSalesReview` | 采购员/经理 | 采购员完成供应商询价，提交外贸复核 |
| `WaitingSalesReview` | `Purchasing` | 外贸员/经理 | 外贸员退回采购员补充报价 |
| `WaitingSalesReview` | `Quoted` | 外贸员/经理/审批通过 | 客户报价完成 |
| `Quoted` | `Closed` | 外贸员/经理 | 关闭询价 |

禁止事项：

- 不允许未定义的任意状态跳转。
- 不允许未接单时直接进入 `Purchasing`，必须通过 Token 接单。
- 不允许采购员操作非自己负责的询价项。
- 不允许外贸员操作非自己负责的询价项。
- 已完成状态 `Quoted`、`Closed` 不应再次触发自动分配。

## 6. 主业务流程

1. 外贸员创建询价项。
2. 系统自动生成主键和询价编号。
3. 系统判断是否已有手动指定采购员。
4. 如果未指定采购员，系统根据采购员画像自动选择采购员。
5. 系统将询价状态从 `Draft` 改为 `Assigned`。
6. 系统根据优先级写入 `assignment_deadline` 和 `next_reminder_at`。
7. 系统生成接单 Token，仅保存哈希。
8. 系统生成接单链接。
9. 系统通过企业微信通知采购员。
10. 采购员点击接单链接。
11. 系统校验 Token、登录用户、绑定采购员、询价当前负责人。
12. 校验通过后状态进入 `Purchasing`。
13. 采购员填写供应商报价。
14. 采购员提交沟通记录，并将状态推进到 `WaitingSalesReview`。
15. 外贸员复核采购结果。
16. 如果需要补充，外贸员将状态退回 `Purchasing`。
17. 如果可以报价，外贸员提交客户报价。
18. 系统判断客户报价是否超过审批阈值。
19. 未超过阈值，客户报价状态为 `NotRequired`，询价进入 `Quoted`。
20. 超过阈值，客户报价状态为 `Pending`，创建经理审批，询价保持 `WaitingSalesReview`。
21. 经理审批通过后，客户报价状态为 `Approved`，询价进入 `Quoted`。
22. 经理审批拒绝后，客户报价状态为 `Rejected`，询价保持或退回 `WaitingSalesReview`。
23. 外贸员或经理关闭询价，状态进入 `Closed`。
24. 所有关键动作后刷新用户任务统计和采购员任务数。

## 7. 自动分配规则

采购员候选条件：

```text
buyer_profiles.is_available = true
```

评分规则：

| 条件 | 分数 |
| --- | ---: |
| 采购员当前进行中任务数为 0，且采购员标签命中询价标签 | +1000 |
| 采购员熟悉品牌命中询价品牌 | +500 |
| 采购员历史完成过相同品牌询价 | +300 |
| 采购员画像基础评分 | +`score` |
| 每个进行中任务 | -10 |

排序规则：

- 优先按总评分从高到低。
- 分数相同，进行中任务少者优先。
- 仍相同，基础评分高者优先。

特殊规则：

- 外贸员手动指定 `buyer_owner_id` 时，系统尊重手动指定，不重新分配。
- 若没有可用采购员，则跳过分配并记录告警。
- 超时重分配时优先排除原采购员。
- 如果排除原采购员后没有候选人，则允许回退到任一可用采购员。

## 8. 接单 Token 需求

Token 规则：

- 明文 Token 使用随机 32 字节十六进制字符串。
- 数据库只保存 SHA-256 哈希，不保存明文。
- 默认过期时间由 `ACCEPT_TOKEN_TTL_HOURS` 控制，当前默认 24 小时。
- 接单链接格式类似：`/purchase-flow-accept/accept?token=xxx`。
- 前端可调用 JSON 版本：`/purchase-flow-accept/accept-json?token=xxx`。

接单校验：

| 场景 | 响应 |
| --- | --- |
| 缺少 Token | `400` |
| 未登录 | `401` |
| Token 不存在 | `403` |
| Token 哈希校验失败 | `403` |
| Token 过期 | `403` |
| 当前用户不是绑定采购员 | `403` |
| 询价项不存在 | `404` |
| 询价项已重新分配给别人 | `403` |
| Token 已使用且同一询价项 | 返回成功结果 |

接单成功后：

- `inquiry_items.accepted_at = now`
- `inquiry_items.state = Purchasing`
- `assignment_accept_tokens.used_at = now`
- 刷新任务统计
- 跳转到询价详情页，或返回 JSON

## 9. 供应商报价需求

采购员在 `Purchasing` 状态填写供应商报价。

供应商报价关键字段：

- `supplier_id`
- `price`
- `currency`
- `lead_time`
- `inquiry_price`
- `quoted_by`
- `quoted_at`

业务规则：

- 一个询价项可以有多条供应商报价。
- 可以标记一条为推荐报价 `is_recommended = true`。
- 扫描提醒时，如果有推荐报价，优先检查推荐报价字段是否完整。
- 如果没有推荐报价，则检查第一条供应商报价。
- 如果没有任何供应商报价，则认为全部关键字段缺失。
- 当前前端里供应商报价仍是直接通过普通 CRUD 创建、更新、删除；迁移时建议封装成后端业务接口，统一校验权限、状态和统计刷新。

## 10. 沟通与状态流转需求

系统提供原子动作：创建沟通记录并更新状态。

接口语义：

```text
POST /purchase-flow-actions/communicate-and-transition
```

请求字段：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `inquiry_item_id` | 是 | 询价项 ID |
| `content` | 是 | 沟通内容 |
| `next_state` | 是 | 目标状态 |

事务要求：

- 创建 `conversations`。
- 更新 `inquiry_items.state`。
- 若目标状态为 `Quoted` 或 `Closed`，写入 `completed_at`。
- 提交成功后刷新任务统计。
- 以上写入应在一个数据库事务内完成。

权限规则：

- `Manager` 可以执行所有当前允许的状态切换。
- `Buyer` 只能对自己负责的询价执行 `Purchasing -> WaitingSalesReview`。
- `Sales` 只能对自己负责的询价执行 `WaitingSalesReview -> Purchasing`、`WaitingSalesReview -> Quoted`、`Quoted -> Closed`。

## 11. 客户报价与经理审批需求

提交客户报价接口：

```text
POST /purchase-flow-actions/submit-customer-quote
```

请求示例：

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

提交规则：

- 必须登录。
- 只有该询价项的外贸负责人可以提交。
- 询价项必须处于 `WaitingSalesReview`。
- 必填字段：询价项、价格、币种、货期。
- 创建 `customer_quotes`。
- 根据 `priority_rules.approval_threshold` 判断是否需要审批。
- 如果报价未超过阈值，`customer_quotes.approval_status = NotRequired`，`inquiry_items.state = Quoted`，并写入 `completed_at`。
- 如果报价超过阈值，`customer_quotes.approval_status = Pending`，创建 `manager_approvals`，`inquiry_items.state` 保持 `WaitingSalesReview`。
- 创建沟通记录。
- 刷新任务统计。

经理审批接口：

```text
POST /purchase-flow-actions/approve-customer-quote
```

通过请求示例：

```json
{
  "approval_id": "审批记录ID",
  "decision": "Approved",
  "reason": "价格合理，同意报价。"
}
```

拒绝请求示例：

```json
{
  "approval_id": "审批记录ID",
  "decision": "Rejected",
  "reason": "利润率不足，请重新调整客户报价。"
}
```

审批规则：

- 必须登录。
- 只有经理可以审批。
- 只能处理 `manager_approvals.status = Pending` 的记录。
- `decision` 只能是 `Approved` 或 `Rejected`。
- 审批通过时，更新审批和客户报价为通过，将询价推进到 `Quoted`，并写入 `completed_at`。
- 审批拒绝时，更新审批和客户报价为拒绝，将询价保持或退回 `WaitingSalesReview`。
- 创建沟通记录。
- 刷新任务统计。

## 12. 历史类似报价推荐需求

接口语义：

```text
GET /purchase-flow-actions/inquiries/:id/similar-quotes
```

查询参数：

| 参数 | 默认 | 最大 | 含义 |
| --- | ---: | ---: | --- |
| `limit` | 10 | 50 | 返回结果数量 |
| `candidate_limit` | 200 | 500 | 候选历史报价数量 |

权限规则：

- 经理可查看所有询价。
- 外贸员只能查看自己负责的询价。
- 采购员只能查看自己负责的询价。

候选条件：

- 排除当前询价项。
- 历史询价项状态必须是 `Quoted` 或 `Closed`。
- 供应商报价必须有 `price`。
- 按报价时间倒序取候选。

评分规则：

| 条件 | 分数 |
| --- | ---: |
| 品牌完全匹配 | +500 |
| 型号完全匹配 | +400 |
| 产品名称关键词命中 | 每个 +80，最多 +200 |
| 标签匹配 | 每个 +50，最多 +150 |
| 历史报价为推荐报价 | +80 |
| 报价时间 30 天内 | +100 |
| 报价时间 90 天内 | +70 |
| 报价时间 180 天内 | +40 |
| 报价时间 365 天内 | +20 |

返回字段应包含历史询价项、历史报价、供应商、价格、货期、匹配分数和匹配原因。

## 13. 定时扫描需求

需要实现一个后台定时任务或可被 cron 调用的接口。

组合扫描：

```text
POST /purchase-flow-scanner/run
```

### 接单超时重分配

扫描条件：

```text
state = Assigned
accepted_at is null
assignment_deadline <= now
```

处理逻辑：

- 找到超时未接单询价项。
- 优先排除原采购员重新评分分配。
- 如果没有其他采购员，则回退任一可用采购员。
- 作废旧未使用 Token，即写入 `used_at = now`。
- 更新询价项负责人、状态、接单截止时间、提醒时间和更新时间。
- 创建新的接单 Token。
- 写入沟通记录，说明系统已超时重分配。
- 刷新新旧采购员、外贸员、经理任务统计。
- 通知新采购员。

### 供应商报价缺字段提醒

扫描条件：

```text
state = Purchasing
buyer_owner_id is not null
next_reminder_at is null 或 next_reminder_at <= now
```

检查字段：

- `supplier_id`
- `price`
- `currency`
- `lead_time`
- `inquiry_price`
- `quoted_by`
- `quoted_at`

处理逻辑：

- 如果没有供应商报价，认为全部字段缺失。
- 如果有推荐报价，检查推荐报价。
- 如果没有推荐报价，检查第一条报价。
- 缺字段时创建沟通提醒。
- 更新 `next_reminder_at`，避免短时间重复提醒。
- 发送企业微信提醒。
- 不改变任务统计。

扫描鉴权：

- 已登录经理可以手动触发。
- 配置系统密钥后，可通过 `x-purchase-flow-scanner-secret` Header 调用。

## 14. 任务统计需求

任务统计由服务端维护，前端不应自行计算或写入。

进行中任务口径：

| 统计角色 | 条件 |
| --- | --- |
| `Sales` | 自己负责，`state in Draft, WaitingSalesReview` |
| `Buyer` | 自己负责，`state in Assigned, Purchasing` |
| `Manager` | 所有任务，`state in Assigned, Purchasing, WaitingSalesReview` |

完成任务口径：

```text
state in Quoted, Closed
```

本周完成任务口径：

```text
state in Quoted, Closed
completed_at >= 本周一 00:00:00
```

统计详情要求：

- 每个详情列表最多保留 50 条。
- 按 `updated_at desc` 排序。
- 详情字段包括询价 ID、编号、产品、品牌、优先级、状态、采购员、外贸员、截止时间、完成时间和更新时间。

刷新触发点：

| 触发点 | 是否刷新统计 |
| --- | --- |
| 询价项创建 | 是 |
| 自动分配采购员 | 是 |
| 采购员接单 | 是 |
| 状态流转 | 是 |
| 超时重分配 | 是 |
| 客户报价提交 | 是 |
| 经理审批完成 | 是 |
| 供应商报价缺字段提醒 | 否 |
| 历史类似报价查询 | 否 |
| 供应商报价创建/更新/删除 | 建议刷新，当前仍需封装业务接口 |

## 15. 企业微信通知需求

通知场景：

- 新询价分配给采购员。
- 超时重分配给新采购员。
- 采购中供应商报价缺字段提醒。

配置项：

| 环境变量 | 含义 |
| --- | --- |
| `WECHAT_WORK_WEBHOOK_URL` | 企业微信群机器人 Webhook |
| `PUBLIC_PURCHASE_FLOW_WEB_URL` | 独立采购流程前端 URL |
| `PUBLIC_PURCHASE_APP_URL` | 采购 App URL 兼容回退 |
| `PUBLIC_APP_URL` | Directus App URL 兼容回退 |
| `ACCEPT_TOKEN_TTL_HOURS` | 接单 Token 有效小时数，默认 24 |
| `PURCHASE_FLOW_SCANNER_SECRET` | 定时扫描接口密钥 |
| `PURCHASE_FLOW_SCAN_LIMIT` | 单次扫描数量，默认 50 |

用户字段要求：

```text
directus_users.wechat_work_userid
```

企业微信 @ 人使用企业微信通讯录里的 `userid`，不是邮箱、手机号或姓名。

## 16. 前端页面需求

前端至少需要支持：

- 登录/角色识别。
- 我的任务列表。
- 询价项列表。
- 询价项详情。
- 创建询价项。
- 客户管理。
- 供应商管理。
- 供应商报价管理。
- 沟通记录展示。
- 状态流转操作。
- 接单页面。
- 客户报价提交。
- 经理审批页面。
- 历史类似报价推荐展示。
- 任务统计展示。

列表筛选规则：

```text
采购员任务：buyer_owner_id = 当前用户，state in Assigned, Purchasing
外贸员任务：sales_owner_id = 当前用户，state in Draft, WaitingSalesReview
经理任务：state in Assigned, Purchasing, WaitingSalesReview
```
