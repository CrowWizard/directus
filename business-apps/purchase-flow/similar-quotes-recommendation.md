# 历史类似报价模糊推荐逻辑

更新时间：2026-06-11

## 功能定位

历史类似报价模糊推荐用于在当前询价项详情页中，帮助采购员或外贸员快速参考过去相似询价项的供应商报价。

该功能不是网页端自行计算，而是由服务端 `purchase-flow-actions` Endpoint 统一查询、评分和排序。网页端只负责展示推荐结果，并在用户确认后把历史报价内容带入当前供应商报价表单。

## 服务端接口

接口路径：

```text
GET /purchase-flow-actions/inquiries/:id/similar-quotes
```

其中 `:id` 是当前询价项 `inquiry_items.id`。

调用示例：

```bash
curl -i 'http://localhost:8055/purchase-flow-actions/inquiries/询价项ID/similar-quotes?limit=10' \
  -H 'Authorization: Bearer <access_token>'
```

支持查询参数：

| 参数 | 说明 | 默认值 | 范围 |
| ---- | ---- | ------ | ---- |
| `limit` | 返回推荐结果数量 | `10` | `1` 到 `50` |
| `candidate_limit` | 参与评分的历史候选报价数量 | `200` | `20` 到 `500` |

## 权限规则

服务端会先校验当前登录用户是否有权查看当前询价项。

当前规则：

| 角色 | 权限 |
| ---- | ---- |
| `Manager` | 可以查看任意询价项的历史类似报价 |
| `Sales` | 只能查看自己负责的询价项 |
| `Buyer` | 只能查看自己负责的询价项 |

如果没有权限，服务端返回 `403`。

如果没有登录，服务端返回 `401`。

如果询价项不存在，服务端返回 `404`。

## 查询范围

服务端先读取当前询价项字段：

```text
id
inquiry_no
product_name
brand
model
tags
sales_owner_id
buyer_owner_id
state
```

然后从历史供应商报价中查询候选数据：

```text
supplier_quotes
left join inquiry_items
left join suppliers
```

候选报价过滤规则：

```text
排除当前询价项
历史询价项 state 必须是 Quoted 或 Closed
supplier_quotes.price 不为空
按 supplier_quotes.quoted_at 倒序取最近候选
```

默认最多取最近 `200` 条候选报价参与评分。可以通过 `candidate_limit` 调整，但最大不超过 `500`。

## 相似度评分规则

每条历史报价会根据当前询价项和历史询价项的相似程度计算 `score`。

当前评分规则：

| 参数 | 规则 | 分数 |
| ---- | ---- | ---: |
| `brand` | 当前询价项品牌和历史询价项品牌完全一致 | `+500` |
| `model` | 当前询价项型号和历史询价项型号完全一致 | `+400` |
| `product_name` | 产品名称分词后关键词命中 | 每个 `+80`，最多 `+200` |
| `tags` | 当前询价项标签和历史询价项标签有交集 | 每个 `+50`，最多 `+150` |
| `is_recommended` | 历史供应商报价曾被标记为推荐报价 | `+80` |
| `quoted_at` / `completed_at` | 历史报价时间越近分越高 | 最多 `+100` |

时间评分规则：

| 历史报价时间 | 分数 |
| ------------ | ---: |
| 30 天内 | `+100` |
| 90 天内 | `+70` |
| 180 天内 | `+40` |
| 365 天内 | `+20` |
| 超过 365 天 | `+0` |

## 字段匹配细节

### `brand`

`brand` 使用标准化后的完全匹配：

```text
去掉首尾空格
转成小写
非空且完全相等
```

示例：

```text
Omron == omron
Siemens != Siemens AG
```

### `model`

`model` 也使用标准化后的完全匹配。

示例：

```text
ABC-123 == abc-123
ABC-123 != ABC-123A
```

### `product_name`

`product_name` 会先做简单分词：

```text
转小写
按非字母和非数字字符切分
过滤长度小于 2 的词
```

然后计算当前产品名称和历史产品名称的共同关键词数量。

每命中一个关键词加 `80` 分，最多加 `200` 分。

### `tags`

`tags` 支持数组或逗号分隔字符串。

处理规则：

```text
转小写
按逗号拆分
去掉空值
计算交集
```

每个交集标签加 `50` 分，最多加 `150` 分。

### `is_recommended`

如果历史供应商报价被采购员标记过：

```text
supplier_quotes.is_recommended = true
```

则额外加 `80` 分。

### 时间新鲜度

优先使用：

```text
supplier_quotes.quoted_at
```

如果没有，则使用：

```text
inquiry_items.completed_at
```

越新的历史报价越靠前。

## 排序规则

服务端会先过滤掉 `score <= 0` 的候选报价。

然后排序：

```text
1. score 从高到低
2. score 相同时，quoted_at 或 completed_at 越新越靠前
```

最后按 `limit` 返回指定数量。

## 返回字段

接口返回数组，每条推荐包含：

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

返回示例：

```json
{
  "data": [
    {
      "inquiry_item_id": "历史询价项ID",
      "inquiry_no": "INQ-20260601-0001",
      "product_name": "Connector ABC",
      "brand": "Omron",
      "model": "ABC-123",
      "supplier_quote_id": "历史供应商报价ID",
      "supplier_id": "供应商ID",
      "supplier_name": "某某供应商",
      "price": 100,
      "currency": "USD",
      "lead_time": "7天",
      "inquiry_price": 95,
      "inquiry_coef": 1.05,
      "remark": "历史报价备注",
      "quoted_at": "2026-06-01T10:00:00.000Z",
      "completed_at": "2026-06-02T10:00:00.000Z",
      "is_recommended": true,
      "score": 1280,
      "matched_reasons": [
        "品牌一致",
        "型号一致",
        "产品名称相似",
        "标签匹配：connector",
        "历史推荐报价",
        "报价时间较近"
      ]
    }
  ]
}
```

## 网页端使用方式

网页端 `business-apps/purchase-flow/web` 不需要实现相似度算法。

建议在询价项详情页中：

1. 进入详情页后调用 `similar-quotes` 接口。
2. 展示推荐报价列表。
3. 展示 `score` 和 `matched_reasons`，让用户知道为什么推荐。
4. 展示历史供应商、价格、币种、货期、报价时间和备注。
5. 提供“一键带入”按钮。
6. 用户点击“一键带入”后，将历史报价字段填入当前供应商报价表单。
7. 用户仍需手动确认并提交，避免系统自动采用历史价格。

建议一键带入字段：

```text
supplier_id
price
currency
lead_time
inquiry_price
inquiry_coef
remark
```

不建议自动带入：

```text
quoted_by
quoted_at
is_recommended
```

这些字段应由当前用户和当前业务动作重新生成。

## 设计边界

当前是规则评分，不是 AI 语义检索。

优点：

```text
可解释
可控
查询快
不依赖外部服务
便于调试
```

限制：

```text
不能理解复杂语义
型号必须完全一致才加分
产品名称只做简单关键词匹配
品牌别名不会自动归一
供应商质量、成交结果、利润率暂未参与评分
```

后续可优化方向：

```text
增加品牌别名表
增加型号模糊匹配
增加供应商命中率或成交率评分
增加最近成交价权重
增加客户所属国家或行业维度
增加向量检索或 AI 语义匹配
```

## 代码位置

当前实现位于：

```text
extensions/purchase-flow-actions/dist/index.js
```

核心函数：

```text
getSimilarQuotes
getInquiryForSimilarQuotes
getSimilarQuoteCandidates
scoreSimilarQuote
calculateProductNameScore
getTagMatches
calculateRecencyScore
```
