#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8055}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
LANGUAGE="${LANGUAGE:-zh-CN}"

if ! command -v curl >/dev/null 2>&1; then
  echo "缺少 curl，请先安装 curl。"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "缺少 jq，请先安装 jq。"
  exit 1
fi

login_response=$(curl -sS -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg email "${ADMIN_EMAIL}" --arg password "${ADMIN_PASSWORD}" '{email:$email,password:$password}')")

TOKEN=$(jq -r '.data.access_token // empty' <<<"${login_response}")

if [ -z "${TOKEN}" ]; then
  echo "登录失败，请检查 BASE_URL / ADMIN_EMAIL / ADMIN_PASSWORD。"
  echo "响应内容：${login_response}"
  exit 1
fi

api_patch() {
  local path="$1"
  local body="$2"
  local label="$3"
  local response

  response=$(curl -sS -X PATCH "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${body}")

  if jq -e '.errors' >/dev/null 2>&1 <<<"${response}"; then
    echo "更新失败：${label}"
    echo "响应内容：${response}"
    exit 1
  fi

  echo "已更新：${label}"
}

translation_json() {
  local translation="$1"
  jq -cn --arg language "${LANGUAGE}" --arg translation "${translation}" '[{language:$language,translation:$translation}]'
}

patch_collection() {
  local collection="$1"
  local translation="$2"
  local body

  body=$(jq -cn --argjson translations "$(translation_json "${translation}")" '{meta:{translations:$translations}}')
  api_patch "/collections/${collection}" "${body}" "Collection ${collection} -> ${translation}"
}

patch_field() {
  local collection="$1"
  local field="$2"
  local translation="$3"
  local body

  body=$(jq -cn --argjson translations "$(translation_json "${translation}")" '{meta:{translations:$translations}}')
  api_patch "/fields/${collection}/${field}" "${body}" "Field ${collection}.${field} -> ${translation}"
}

echo "开始写入中文显示名，语言：${LANGUAGE}..."

patch_collection customers 客户
patch_collection customer_contacts 客户联系人
patch_collection suppliers 供应商
patch_collection supplier_contacts 供应商联系人
patch_collection inquiry_items 询价项
patch_collection supplier_quotes 供应商报价
patch_collection customer_quotes 客户报价
patch_collection conversations 沟通会话
patch_collection attachments 附件
patch_collection buyer_profiles 采购员画像
patch_collection priority_rules 优先级规则
patch_collection assignment_rules 自动分配规则
patch_collection assignment_accept_tokens 接单令牌
patch_collection manager_approvals 经理审批
patch_collection user_task_summaries 用户任务统计
patch_collection purchase_tags 采购Tag

patch_field customers customer_code 客户编码
patch_field customers customer_name 客户名称
patch_field customers country 国家
patch_field customers address 地址
patch_field customers website 网站
patch_field customers remark 备注
patch_field customers status 状态

patch_field customer_contacts customer_id 客户
patch_field customer_contacts name 姓名
patch_field customer_contacts position 职位
patch_field customer_contacts phone 电话
patch_field customer_contacts email 邮箱
patch_field customer_contacts wechat 微信
patch_field customer_contacts remark 备注

patch_field suppliers supplier_code 供应商编码
patch_field suppliers supplier_name 供应商名称
patch_field suppliers supplier_type 类型
patch_field suppliers buyer_id 采购负责人
patch_field suppliers country 国家
patch_field suppliers tax_rate 税率
patch_field suppliers payment_term 付款方式
patch_field suppliers website 网站
patch_field suppliers remark 备注
patch_field suppliers status 状态

patch_field supplier_contacts supplier_id 供应商
patch_field supplier_contacts name 姓名
patch_field supplier_contacts position 职位
patch_field supplier_contacts phone 电话
patch_field supplier_contacts email 邮箱
patch_field supplier_contacts wechat 微信
patch_field supplier_contacts remark 备注

patch_field inquiry_items inquiry_no 询价编号
patch_field inquiry_items customer_id 客户
patch_field inquiry_items project_name 项目名称
patch_field inquiry_items product_name 产品名称
patch_field inquiry_items brand 品牌
patch_field inquiry_items model 型号
patch_field inquiry_items specification 规格参数
patch_field inquiry_items quantity 数量
patch_field inquiry_items unit 单位
patch_field inquiry_items target_price 目标价格
patch_field inquiry_items priority 优先级
patch_field inquiry_items sales_owner_id 外贸员
patch_field inquiry_items buyer_owner_id 采购员
patch_field inquiry_items state 当前状态
patch_field inquiry_items remark 备注
patch_field inquiry_items attachment_ids 附件
patch_field inquiry_items tags 标签
patch_field inquiry_items accepted_at 开始处理时间
patch_field inquiry_items assignment_deadline 分配超时时间
patch_field inquiry_items next_reminder_at 下次提醒时间
patch_field inquiry_items completed_at 完成时间
patch_field inquiry_items created_at 创建时间
patch_field inquiry_items updated_at 更新时间

patch_field supplier_quotes inquiry_item_id 询价项
patch_field supplier_quotes supplier_id 供应商
patch_field supplier_quotes price 采购价格
patch_field supplier_quotes currency 币种
patch_field supplier_quotes lead_time 货期
patch_field supplier_quotes inquiry_price 询价价格
patch_field supplier_quotes inquiry_coef 询价系数
patch_field supplier_quotes remark 备注
patch_field supplier_quotes attachment_ids 附件
patch_field supplier_quotes quoted_by 报价人
patch_field supplier_quotes quoted_at 报价时间
patch_field supplier_quotes is_recommended 推荐报价

patch_field customer_quotes inquiry_item_id 询价项
patch_field customer_quotes customer_id 客户
patch_field customer_quotes price 销售价格
patch_field customer_quotes currency 币种
patch_field customer_quotes lead_time 货期
patch_field customer_quotes remark 备注
patch_field customer_quotes attachment_ids 附件
patch_field customer_quotes quoted_by 报价人
patch_field customer_quotes quoted_at 报价时间
patch_field customer_quotes approval_status 审批状态

patch_field conversations inquiry_item_id 报价项
patch_field conversations actor_id 操作人
patch_field conversations content 内容
patch_field conversations metadata 扩展数据
patch_field conversations created_at 创建时间

patch_field attachments file_name 文件名
patch_field attachments file_url 文件地址
patch_field attachments file_size 文件大小
patch_field attachments mime_type 文件类型
patch_field attachments uploaded_by 上传人
patch_field attachments uploaded_at 上传时间

patch_field buyer_profiles buyer_id 采购员
patch_field buyer_profiles tags 采购标签
patch_field buyer_profiles brands 熟悉品牌
patch_field buyer_profiles score 评分
patch_field buyer_profiles active_task_count 进行中任务数
patch_field buyer_profiles completed_task_count 已完成任务数
patch_field buyer_profiles is_available 是否可分配

patch_field priority_rules priority 优先级
patch_field priority_rules assignment_timeout_minutes 分配超时分钟
patch_field priority_rules reminder_interval_minutes 定时提醒分钟
patch_field priority_rules approval_threshold 经理审批金额阈值

patch_field assignment_rules tag 标签
patch_field assignment_rules brand 品牌
patch_field assignment_rules buyer_id 采购员
patch_field assignment_rules score 规则评分
patch_field assignment_rules enabled 启用

patch_field assignment_accept_tokens inquiry_item_id 询价项
patch_field assignment_accept_tokens buyer_id 被分配采购员
patch_field assignment_accept_tokens token_hash 接单令牌哈希
patch_field assignment_accept_tokens expires_at 过期时间
patch_field assignment_accept_tokens used_at 使用时间
patch_field assignment_accept_tokens created_at 创建时间

patch_field manager_approvals inquiry_item_id 询价项
patch_field manager_approvals customer_quote_id 客户报价
patch_field manager_approvals requested_by 发起人
patch_field manager_approvals approved_by 审批人
patch_field manager_approvals status 审批状态
patch_field manager_approvals reason 审批原因
patch_field manager_approvals created_at 创建时间
patch_field manager_approvals approved_at 审批时间

patch_field user_task_summaries user_id 用户
patch_field user_task_summaries role_scope 统计角色
patch_field user_task_summaries active_task_count 进行中任务数
patch_field user_task_summaries total_completed_task_count 累计完成任务数
patch_field user_task_summaries weekly_completed_task_count 本周完成任务数
patch_field user_task_summaries active_task_details 进行中任务详情
patch_field user_task_summaries weekly_completed_task_details 本周完成任务详情
patch_field user_task_summaries refreshed_at 刷新时间

patch_field purchase_tags tag_name Tag名称
patch_field purchase_tags enabled 启用
patch_field purchase_tags created_at 创建时间
patch_field purchase_tags updated_at 更新时间

echo "中文显示名写入完成。"
echo "请在 Directus 用户设置里确认界面语言为中文或 ${LANGUAGE}。"
