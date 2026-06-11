# 采购分配逻辑

本文档记录当前外贸询价采购流程中的采购员分配、接单、超时重分配和提醒逻辑。

## 核心实现位置

- `extensions/purchase-flow-auto-id/dist/index.js`：询价项创建或更新后自动分配采购员、生成接单 Token、发送企业微信通知。
- `extensions/purchase-flow-accept/dist/index.js`：采购员点击接单链接后开始处理询价项。
- `extensions/purchase-flow-scanner/dist/index.js`：扫描超时未接单询价项并重新分配，扫描采购中报价缺字段并提醒。
- `business-apps/purchase-flow/web/src/api/purchase-flow.ts`：前端任务和询价项列表按角色查询。

## 创建询价项后的首次分配

创建 `inquiry_items` 时，`purchase-flow-auto-id` Hook 会先补齐业务主键和询价编号，然后在 `items.create` action 中执行 `prepareInquiryAssignment()`。

首次分配入口逻辑为：

```js
const buyerId = inquiry.buyer_owner_id || (await assignBuyer(database, inquiry));
```

含义如下：

- 如果创建询价项时已经填写 `buyer_owner_id`，系统尊重手动指定的采购员。
- 如果 `buyer_owner_id` 为空，系统才执行自动分配。
- 如果没有找到可用采购员，系统只记录日志，不写入采购员、不生成接单链接。

分配成功后会更新 `inquiry_items`：

- 没有 `buyer_owner_id` 时写入分配出的采购员。
- 状态为空或 `Draft` 时改为 `Assigned`。
- 没有 `assignment_deadline` 时，按优先级规则生成接单截止时间。
- 没有 `next_reminder_at` 时，按优先级规则生成下一次提醒时间。
- 刷新采购员任务数和用户任务统计。

## 自动分配候选人

自动分配只从 `buyer_profiles` 中选择候选采购员：

```js
database('buyer_profiles')
  .select('buyer_id', 'tags', 'brands', 'score', 'active_task_count', 'completed_task_count')
  .where({ is_available: true })
```

候选条件如下：

- `buyer_profiles` 中存在采购员画像记录。
- `is_available = true`。
- 当前代码没有按 Directus 用户角色再次过滤，因此需要保证 `buyer_profiles.buyer_id` 指向真实采购员用户。

`assignment_rules` 表目前仅完成数据模型初始化，当前自动分配代码未使用该表。

## 自动分配评分规则

系统会对每个候选采购员计算 `rank`，按分数从高到低排序后取第一名。

当前评分规则如下：

| 规则 | 分值 |
| --- | ---: |
| 采购员当前进行中任务数为 0，且采购员 `tags` 与询价项 `tags` 有交集 | +1000 |
| 询价项 `brand` 命中采购员画像 `brands` | +500 |
| 历史已完成询价中，同品牌曾由该采购员处理 | +300 |
| 采购员画像 `score` | +score |
| 当前进行中任务数 | `active_task_count * -10` |

排序规则如下：

1. `rank` 高的优先。
2. `rank` 相同，`active_task_count` 少的优先。
3. 仍相同，`score` 高的优先。

因此当前分配权重最高的是“空闲且标签匹配”，其次是品牌熟悉度，再其次是历史同品牌经验。

## 优先级规则

接单截止时间和提醒时间来自 `priority_rules`。

读取规则时使用：

```js
priority_rules.priority = inquiry.priority || 'Normal'
```

使用字段：

- `assignment_timeout_minutes`：接单超时时长。
- `reminder_interval_minutes`：提醒间隔。

如果没有命中规则，代码默认值为：

- 接单超时：120 分钟。
- 提醒间隔：60 分钟。

初始化脚本中的默认规则如下：

| 优先级 | 接单超时 | 提醒间隔 |
| --- | ---: | ---: |
| Low | 240 分钟 | 120 分钟 |
| Normal | 120 分钟 | 60 分钟 |
| High | 60 分钟 | 30 分钟 |
| Urgent | 30 分钟 | 10 分钟 |

## 接单 Token 和通知

分配成功后，系统会为询价项和采购员生成 `assignment_accept_tokens` 记录。

Token 规则如下：

- 原始 Token 使用随机值生成。
- 数据库只保存 `sha256(token)`。
- 默认有效期为 `ACCEPT_TOKEN_TTL_HOURS || 24` 小时。
- 如果同一个询价项和同一个采购员已经有未使用且未过期 Token，不重复生成。

接单链接格式如下：

```text
{PUBLIC_PURCHASE_FLOW_WEB_URL}/purchase-flow-accept/accept?token=xxx
```

通知规则如下：

- 配置 `WECHAT_WORK_WEBHOOK_URL` 时，发送企业微信 markdown 通知。
- 未配置 `WECHAT_WORK_WEBHOOK_URL` 时，只在日志输出接单链接。
- 如果 `directus_users.wechat_work_userid` 有值，会在企业微信消息中 `@` 对应采购员。

通知内容包含：

- 询价编号。
- 产品。
- 品牌。
- 优先级。
- 接单链接。

## 采购员接单

接单 Endpoint 由 `purchase-flow-accept` 提供：

- `/purchase-flow-accept/accept`
- `/purchase-flow-accept/accept-json`

接单校验如下：

- 请求必须带 Token。
- 用户必须已登录。
- Token hash 必须存在。
- Token 未过期。
- Token 绑定的 `buyer_id` 必须等于当前登录用户。
- 询价项当前 `buyer_owner_id` 必须等于当前登录用户。

接单成功后更新：

- `inquiry_items.accepted_at = now`
- `inquiry_items.state = 'Purchasing'`
- `assignment_accept_tokens.used_at = now`

当前主要状态流转为：

```text
Draft -> Assigned -> Purchasing
```

## 超时未接单重分配

`purchase-flow-scanner` 的 `scanAssignmentTimeouts()` 负责超时重分配。

扫描条件如下：

- `state = 'Assigned'`
- `accepted_at IS NULL`
- `assignment_deadline IS NOT NULL`
- `assignment_deadline <= now`

也就是说，该扫描只处理“已经分配但采购员未接单”的询价项。

重分配逻辑如下：

- 读取原采购员 `previousBuyerId`。
- 执行 `assignBuyer(database, inquiry, previousBuyerId)`。
- 优先排除原采购员重新选择。
- 如果排除原采购员后没有候选人，会退回到包含原采购员重新选择。
- 如果仍然没有候选人，跳过并记录原因“没有可用采购员”。

重分配事务内会执行：

- 将当前未使用的接单 Token 标记为 `used_at = now`，使旧链接失效。
- 更新 `buyer_owner_id = nextBuyerId`。
- 状态保持或重置为 `Assigned`。
- 清空 `accepted_at`。
- 重新计算 `assignment_deadline`。
- 重新计算 `next_reminder_at`。
- 写入一条 `conversations` 记录。
- 创建新的接单 Token。
- 发送企业微信通知“采购询价已超时重新分配”。

重分配沟通记录的 `metadata.action` 为：

```text
assignment_timeout_reassign
```

## Purchasing 阶段提醒

`scanSupplierQuoteReminders()` 负责采购处理阶段的报价字段缺失提醒。

扫描条件如下：

- `state = 'Purchasing'`
- `buyer_owner_id IS NOT NULL`
- `next_reminder_at IS NULL` 或 `next_reminder_at <= now`

当前该阶段不会重新分配采购员，只提醒当前采购员补齐供应商报价字段。

如果供应商报价字段缺失，系统会：

- 按优先级规则更新 `next_reminder_at`。
- 写入 `conversations` 提醒记录。
- 发送企业微信通知当前采购员。

如果供应商报价字段完整，则跳过提醒。

## 前端表现

前端不执行自动分配，只负责传值、展示和按角色查询。

新增询价项页面：

- 可以填写 `buyer_owner_id` 手动指定采购员。
- 留空时由后端 Hook 自动分配。
- 创建 payload 默认提交 `state = 'Draft'`，后端 Hook 会推进到 `Assigned`。

我的任务页面查询规则：

- 采购员：`buyer_owner_id = 当前用户`，且 `state in ['Assigned', 'Purchasing']`。
- 外贸员：`sales_owner_id = 当前用户`，且 `state in ['Draft', 'WaitingSalesReview']`。
- 经理：`state in ['Assigned', 'Purchasing', 'WaitingSalesReview']`。

我的任务页面分组规则：

- 采购员：`Assigned` 显示为“待接单”。
- 采购员：`Purchasing` 且已有客户报价时显示为“待补报价”。
- 采购员：其他采购相关任务显示为“采购中”。
- 经理：有待审批客户报价时显示为“待审批”。
- 经理：`assignment_deadline` 超时时显示为“超时未处理”。
- 经理：其他进行中任务显示为“进行中风险项”。

## 当前限制和后续扩展点

- `assignment_rules` 当前未参与实际分配。如需配置化分配规则，需要在 `assignBuyer()` 中接入该表。
- 手动指定 `buyer_owner_id` 会跳过自动评分，但仍会生成接单截止时间、提醒时间和接单 Token。
- 超时重分配只处理 `Assigned` 未接单，不处理 `Purchasing` 中采购员报价慢的情况。
- `Purchasing` 阶段当前只提醒供应商报价缺字段，不会按处理时长自动转派。
- `expected_quote_at` 字段已作为询价项期望报价时间补充到前端和迁移脚本，但当前还未接入扫描提醒逻辑。
- 如果后续要以 `expected_quote_at` 作为企业微信通知依据，建议在 `purchase-flow-scanner` 中新增独立扫描规则，避免和接单超时 `assignment_deadline` 混用。
