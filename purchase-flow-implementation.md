# 外贸询价采购报价流程落地记录

更新时间：2026-06-05

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

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 外贸员 | `sales@example.com` | `12345678` |
| 采购员 | `buyer1@example.com` | `12345678` |
| 采购员 | `buyer2@example.com` | `12345678` |
| 经理 | `manager@example.com` | `12345678` |

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

| 用户 | 姓名 | 角色 | 进行中 | 累计完成 | 本周完成 |
| --- | --- | --- | ---: | ---: | ---: |
| `buyer1@example.com` | 采购 B | Buyer | 2 | 0 | 0 |
| `buyer2@example.com` | 采购 C | Buyer | 1 | 0 | 0 |
| `manager@example.com` | 经理 M | Manager | 3 | 0 | 0 |
| `sales@example.com` | 外贸 A | Sales | 1 | 0 | 0 |

## 脚本清单

### 全量/基础初始化

- `scripts/init-purchase-flow.sh`
  - 总入口。
  - 执行集合、关系、权限、优先级规则、翻译、Hook、Endpoint、可选 Flow。
  - 已部署环境不建议随便重跑全量。

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
  - 功能：自动 UUID、自动分配、设置超时/提醒、生成 Token、企业微信通知、刷新任务统计。

- `scripts/install-purchase-flow-accept-endpoint.sh`
  - 安装 Endpoint。
  - 标准 Directus 扩展格式：`extensions/purchase-flow-accept/package.json` + `dist/index.js`。
  - 提供接单链接接口。

## Directus 扩展目录注意事项

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
ACCEPT_TOKEN_TTL_HOURS=24
WECHAT_WORK_WEBHOOK_URL=企业微信机器人Webhook
```

注意：

- `.env` 修改后必须重启 Directus。
- 曾经发现 Directus 进程没有读到 `.env`，建议启动时显式传环境变量，或确认服务进程实际 cwd 和 `.env` 位置。
- Directus 曾扫描 `/home/jswork/directus/extensions`，也曾使用 `/home/jswork/directus/dist/extensions`，因此扩展安装脚本曾同步安装到两个目录。

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
  "choices": [
    { "text": "High", "value": "High" }
  ]
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

测试 Endpoint 是否加载：

```bash
curl -i 'http://localhost:8055/purchase-flow-accept/accept?token=probe'
```

如果返回 `ROUTE_NOT_FOUND`，说明扩展没加载。

## 后续建议

1. 做一个真正的“我的任务”业务页面或 Directus Module。
2. 补超时自动重分配扫描逻辑。
3. 补供应商报价缺字段提醒逻辑。
4. 补历史类似报价模糊推荐。
5. 优化权限，不要所有角色都拥有过宽的集合级权限。
6. 将 `user_task_summaries` 的详情 JSON 替换成更好的可视化列表或自定义页面。
