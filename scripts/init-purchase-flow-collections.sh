#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8055}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"

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

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  if [ -z "${body}" ]; then
    curl -sS -X "${method}" "${BASE_URL}${path}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json"
    return 0
  fi

  curl -sS -X "${method}" "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${body}"
}

ensure_no_errors() {
  local response="$1"
  local label="$2"

  if jq -e '.errors' >/dev/null 2>&1 <<<"${response}"; then
    local code
    code=$(jq -r '.errors[0].extensions.code // empty' <<<"${response}" 2>/dev/null || true)

    if [ "${code}" = "RECORD_NOT_UNIQUE" ] || [ "${code}" = "VALUE_NOT_UNIQUE" ]; then
      echo "已存在，跳过：${label}"
      return 0
    fi

    echo "操作失败：${label}"
    echo "响应内容：${response}"
    exit 1
  fi

  echo "已完成：${label}"
}

create_collection() {
  local collection="$1"
  local icon="$2"
  local note="$3"
  local display_template="$4"

  local body
  body=$(jq -n \
    --arg collection "${collection}" \
    --arg icon "${icon}" \
    --arg note "${note}" \
    --arg display_template "${display_template}" \
    '{collection:$collection,meta:{collection:$collection,icon:$icon,note:$note,display_template:$display_template},schema:{name:$collection},fields:[{field:"id",type:"uuid",meta:{hidden:true,readonly:true,interface:"system-uuid",special:["uuid"],note:"系统自动生成的主键。"},schema:{is_primary_key:true,length:36,has_auto_increment:false,is_nullable:false}}]}')

  ensure_no_errors "$(api POST /collections "${body}" || true)" "Collection ${collection}"
}

create_field() {
  local collection="$1"
  local field="$2"
  local type="$3"
  local interface="$4"
  local note="$5"
  local required="${6:-false}"
  local width="${7:-half}"
  local special="${8:-null}"
  local options="${9:-null}"
  local nullable=true

  if [ "${required}" = "true" ]; then
    nullable=false
  fi

  local body
  body=$(jq -n \
    --arg field "${field}" \
    --arg type "${type}" \
    --arg interface "${interface}" \
    --arg note "${note}" \
    --argjson required "${required}" \
    --arg width "${width}" \
    --argjson special "${special}" \
    --argjson options "${options}" \
    --argjson nullable "${nullable}" \
    '{field:$field,type:$type,meta:{interface:$interface,note:$note,required:$required,width:$width,special:$special,options:$options},schema:{is_nullable:$nullable}}')

  ensure_no_errors "$(api POST "/fields/${collection}" "${body}" || true)" "Field ${collection}.${field}"
}

select_options() {
  jq -cn '{choices: ($ARGS.positional | map({text:., value:.}))}' --args "$@"
}

echo "开始从零创建外贸询价采购报价数据模型..."

create_collection customers groups 客户 "{{customer_code}} - {{customer_name}}"
create_collection customer_contacts contact_phone 客户联系人 "{{name}} / {{position}}"
create_collection suppliers local_shipping 供应商 "{{supplier_code}} - {{supplier_name}}"
create_collection supplier_contacts contact_mail 供应商联系人 "{{name}} / {{position}}"
create_collection inquiry_items assignment 询价项 "{{inquiry_no}} - {{product_name}}"
create_collection supplier_quotes request_quote 供应商报价 "{{supplier_id.supplier_name}} - {{price}} {{currency}}"
create_collection customer_quotes price_check 客户报价 "{{inquiry_item_id.inquiry_no}} - {{price}} {{currency}}"
create_collection conversations forum 沟通会话 "{{inquiry_item_id.inquiry_no}} - {{created_at}}"
create_collection attachments attach_file 附件 "{{file_name}}"
create_collection buyer_profiles manage_accounts 采购员画像 "{{buyer_id.first_name}} {{buyer_id.last_name}}"
create_collection priority_rules timer 优先级超时规则 "{{priority}}"
create_collection assignment_rules rule 自动分配规则 "{{tag}} / {{brand}}"
create_collection assignment_accept_tokens key 采购接单令牌 "{{inquiry_item_id.inquiry_no}}"
create_collection manager_approvals approval 经理审批 "{{inquiry_item_id.inquiry_no}} - {{status}}"
create_collection user_task_summaries checklist 用户任务统计 "{{user_id.email}}"

create_field directus_users wechat_work_userid string input "企业微信 userid，用于向指定成员发送提醒。" false half

create_field customers customer_code string input 客户编码 true half
create_field customers customer_name string input 客户名称 true half
create_field customers country string input 国家 false half
create_field customers address text input-multiline 地址 false full
create_field customers website string input 网站 false half
create_field customers remark text input-multiline 备注 false full
create_field customers status string select-dropdown 状态 true half null "$(select_options Active Inactive)"

create_field customer_contacts customer_id uuid select-dropdown-m2o 客户 true half
create_field customer_contacts name string input 姓名 true half
create_field customer_contacts position string input 职位 false half
create_field customer_contacts phone string input 电话 false half
create_field customer_contacts email string input 邮箱 false half
create_field customer_contacts wechat string input 微信 false half
create_field customer_contacts remark text input-multiline 备注 false full

create_field suppliers supplier_code string input 供应商编码 true half
create_field suppliers supplier_name string input 供应商名称 true half
create_field suppliers supplier_type string input 类型 false half
create_field suppliers buyer_id uuid select-dropdown-m2o 采购负责人 false half
create_field suppliers country string input 国家 false half
create_field suppliers tax_rate decimal input 税率 false half
create_field suppliers payment_term string input 付款方式 false half
create_field suppliers website string input 网站 false half
create_field suppliers remark text input-multiline 备注 false full
create_field suppliers status string select-dropdown 状态 true half null "$(select_options Active Inactive)"

create_field supplier_contacts supplier_id uuid select-dropdown-m2o 供应商 true half
create_field supplier_contacts name string input 姓名 true half
create_field supplier_contacts position string input 职位 false half
create_field supplier_contacts phone string input 电话 false half
create_field supplier_contacts email string input 邮箱 false half
create_field supplier_contacts wechat string input 微信 false half
create_field supplier_contacts remark text input-multiline 备注 false full

create_field inquiry_items inquiry_no string input 询价编号 true half
create_field inquiry_items customer_id uuid select-dropdown-m2o 客户 true half
create_field inquiry_items project_name string input 项目名称 false half
create_field inquiry_items product_name string input 产品名称 true half
create_field inquiry_items brand string input 品牌 false half
create_field inquiry_items model string input 型号 false half
create_field inquiry_items specification text input-multiline 规格参数 false full
create_field inquiry_items quantity integer input 数量 true half
create_field inquiry_items unit string input 单位 false half
create_field inquiry_items target_price decimal input "目标价格(TP)" false half
create_field inquiry_items priority string select-dropdown 优先级 true half null "$(select_options Low Normal High Urgent)"
create_field inquiry_items sales_owner_id uuid select-dropdown-m2o 外贸员 true half
create_field inquiry_items buyer_owner_id uuid select-dropdown-m2o 采购员 false half
create_field inquiry_items state string select-dropdown 当前状态 true half null "$(select_options Draft Assigned Purchasing WaitingSalesReview Quoted Closed)"
create_field inquiry_items remark text input-multiline 备注 false full
create_field inquiry_items attachment_ids json list-o2m 附件 false full "[\"cast-json\"]"
create_field inquiry_items tags csv tags 标签 false full "[\"csv\"]"
create_field inquiry_items accepted_at timestamp datetime "采购员点击链接开始处理的时间。" false half
create_field inquiry_items assignment_deadline timestamp datetime "未开始处理前的分配超时时间。" false half
create_field inquiry_items next_reminder_at timestamp datetime "下一次定时提醒时间。" false half
create_field inquiry_items completed_at timestamp datetime 完成时间 false half
create_field inquiry_items created_at timestamp datetime 创建时间 false half "[\"date-created\"]"
create_field inquiry_items updated_at timestamp datetime 更新时间 false half "[\"date-updated\"]"

create_field supplier_quotes inquiry_item_id uuid select-dropdown-m2o 询价项 true half
create_field supplier_quotes supplier_id uuid select-dropdown-m2o 供应商 true half
create_field supplier_quotes price decimal input 采购价格 true half
create_field supplier_quotes currency string input 币种 true half
create_field supplier_quotes lead_time string input 货期 true half
create_field supplier_quotes inquiry_price decimal input 询价价格 true half
create_field supplier_quotes inquiry_coef decimal input 询价系数 false half
create_field supplier_quotes remark text input-multiline 备注 false full
create_field supplier_quotes attachment_ids json list-o2m 附件 false full "[\"cast-json\"]"
create_field supplier_quotes quoted_by uuid select-dropdown-m2o 报价人 true half
create_field supplier_quotes quoted_at timestamp datetime 报价时间 true half
create_field supplier_quotes is_recommended boolean boolean 推荐报价 false half

create_field customer_quotes inquiry_item_id uuid select-dropdown-m2o 询价项 true half
create_field customer_quotes customer_id uuid select-dropdown-m2o 客户 true half
create_field customer_quotes price decimal input 销售价格 true half
create_field customer_quotes currency string input 币种 true half
create_field customer_quotes lead_time string input 货期 true half
create_field customer_quotes remark text input-multiline 备注 false full
create_field customer_quotes attachment_ids json list-o2m 附件 false full "[\"cast-json\"]"
create_field customer_quotes quoted_by uuid select-dropdown-m2o 报价人 true half
create_field customer_quotes quoted_at timestamp datetime 报价时间 true half
create_field customer_quotes approval_status string select-dropdown 审批状态 false half null "$(select_options NotRequired Pending Approved Rejected)"

create_field conversations inquiry_item_id uuid select-dropdown-m2o 报价项 true half
create_field conversations actor_id uuid select-dropdown-m2o 操作人 true half
create_field conversations content text input-rich-text-html 内容 true full
create_field conversations metadata json input-code 扩展数据 false full "[\"cast-json\"]"
create_field conversations created_at timestamp datetime 创建时间 false half "[\"date-created\"]"

create_field attachments file_name string input 文件名 true half
create_field attachments file_url string input 文件地址 true full
create_field attachments file_size integer input 文件大小 false half
create_field attachments mime_type string input 文件类型 false half
create_field attachments uploaded_by uuid select-dropdown-m2o 上传人 false half
create_field attachments uploaded_at timestamp datetime 上传时间 false half "[\"date-created\"]"

create_field buyer_profiles buyer_id uuid select-dropdown-m2o 采购员 true half
create_field buyer_profiles tags csv tags 采购标签 false full "[\"csv\"]"
create_field buyer_profiles brands csv tags 熟悉品牌 false full "[\"csv\"]"
create_field buyer_profiles score decimal input 评分 false half
create_field buyer_profiles active_task_count integer input 进行中任务数 false half
create_field buyer_profiles completed_task_count integer input 已完成任务数 false half
create_field buyer_profiles is_available boolean boolean 是否可分配 false half

create_field priority_rules priority string select-dropdown 优先级 true half null "$(select_options Low Normal High Urgent)"
create_field priority_rules assignment_timeout_minutes integer input 分配超时分钟 true half
create_field priority_rules reminder_interval_minutes integer input 定时提醒分钟 true half
create_field priority_rules approval_threshold decimal input 经理审批金额阈值 false half

create_field assignment_rules tag string input 标签 false half
create_field assignment_rules brand string input 品牌 false half
create_field assignment_rules buyer_id uuid select-dropdown-m2o 采购员 true half
create_field assignment_rules score decimal input 规则评分 false half
create_field assignment_rules enabled boolean boolean 启用 false half

create_field assignment_accept_tokens inquiry_item_id uuid select-dropdown-m2o 询价项 true half
create_field assignment_accept_tokens buyer_id uuid select-dropdown-m2o 被分配采购员 true half
create_field assignment_accept_tokens token_hash string input "接单 Token 哈希" true full
create_field assignment_accept_tokens expires_at timestamp datetime 过期时间 true half
create_field assignment_accept_tokens used_at timestamp datetime 使用时间 false half
create_field assignment_accept_tokens created_at timestamp datetime 创建时间 false half "[\"date-created\"]"

create_field manager_approvals inquiry_item_id uuid select-dropdown-m2o 询价项 true half
create_field manager_approvals customer_quote_id uuid select-dropdown-m2o 客户报价 false half
create_field manager_approvals requested_by uuid select-dropdown-m2o 发起人 true half
create_field manager_approvals approved_by uuid select-dropdown-m2o 审批人 false half
create_field manager_approvals status string select-dropdown 审批状态 true half null "$(select_options Pending Approved Rejected)"
create_field manager_approvals reason text input-multiline 审批原因 false full
create_field manager_approvals created_at timestamp datetime 创建时间 false half "[\"date-created\"]"
create_field manager_approvals approved_at timestamp datetime 审批时间 false half

create_field user_task_summaries user_id uuid select-dropdown-m2o 用户 true half
create_field user_task_summaries role_scope string select-dropdown 统计角色 true half null "$(select_options Sales Buyer Manager)"
create_field user_task_summaries active_task_count integer input 进行中任务数 false half
create_field user_task_summaries total_completed_task_count integer input 累计完成任务数 false half
create_field user_task_summaries weekly_completed_task_count integer input 本周完成任务数 false half
create_field user_task_summaries active_task_details json input-code 进行中任务详情 false full "[\"cast-json\"]"
create_field user_task_summaries weekly_completed_task_details json input-code 本周完成任务详情 false full "[\"cast-json\"]"
create_field user_task_summaries refreshed_at timestamp datetime 刷新时间 false half

echo "数据模型创建完成。"
