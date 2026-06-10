# 采购流程业务数据清理方式

本文只记录清理方式，不会自动执行删除。执行前请先确认目标环境和备份情况。

## 推荐清理范围

用于重新测试完整业务流程时，推荐只清理业务流水和派生统计，保留用户、角色、权限、客户、供应商和分配规则。

需要清理的集合：

- `manager_approvals`
- `customer_quotes`
- `supplier_quotes`
- `conversations`
- `assignment_accept_tokens`
- `attachments`
- `user_task_summaries`
- `inquiry_items`

建议保留的集合：

- `customers`
- `customer_contacts`
- `suppliers`
- `supplier_contacts`
- `buyer_profiles`
- `priority_rules`
- `assignment_rules`
- `directus_users`
- `directus_roles`
- `directus_permissions`
- `directus_collections`
- `directus_fields`
- `directus_relations`

## SQL 清理顺序

按依赖关系从子表到主表删除，避免外键或关系约束问题。

```sql
DELETE FROM manager_approvals;
DELETE FROM customer_quotes;
DELETE FROM supplier_quotes;
DELETE FROM conversations;
DELETE FROM assignment_accept_tokens;
DELETE FROM attachments;
DELETE FROM user_task_summaries;
DELETE FROM inquiry_items;
```

## 连客户和供应商主数据一起清理

只有在需要完全重建测试主数据时才执行下面语句。

```sql
DELETE FROM customer_contacts;
DELETE FROM supplier_contacts;
DELETE FROM customers;
DELETE FROM suppliers;
```

## 清理后重新初始化建议

如果保留客户、供应商、用户和配置，清理后可以直接重新登录独立采购前端创建询价项测试。

如果连客户和供应商也清理了，需要重新执行主数据初始化：

```bash
BASE_URL=http://localhost:8055 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=123456 scripts/init-purchase-flow-master-data.sh
```

如果用户、角色、权限或集合结构也被清理，需要按完整初始化顺序恢复：

```bash
BASE_URL=http://localhost:8055 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=123456 scripts/init-purchase-flow-collections.sh
BASE_URL=http://localhost:8055 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=123456 scripts/init-purchase-flow-relations.sh
BASE_URL=http://localhost:8055 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=123456 scripts/init-purchase-flow-permissions.sh
BASE_URL=http://localhost:8055 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=123456 scripts/init-purchase-flow-users.sh
BASE_URL=http://localhost:8055 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=123456 scripts/init-purchase-flow-master-data.sh
BASE_URL=http://localhost:8055 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=123456 scripts/init-purchase-flow-assignment-rules.sh
BASE_URL=http://localhost:8055 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=123456 scripts/init-purchase-flow-task-summary.sh
```

## 注意事项

- 执行前确认连接的是测试数据库，不是生产数据库。
- 删除 `inquiry_items` 前应先删除依赖它的报价、审批、沟通和接单 token。
- `user_task_summaries` 是派生统计，清理后会在后端业务动作中重新刷新。
- `buyer_profiles.active_task_count` 和 `completed_task_count` 可能保留旧值；如果需要完全重置测试状态，可把对应字段更新为 `0`。

```sql
UPDATE buyer_profiles
SET active_task_count = 0,
    completed_task_count = 0;
```
