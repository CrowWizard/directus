#!/usr/bin/env bash
# 2026-06-08 采购询价流程增量迁移。
# 幂等补齐用户任务统计模型、关系、权限、中文显示和列表显示配置。
# 适用于已执行过旧版 init-purchase-flow.sh 的环境，可重复执行。

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8055}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
LANGUAGE="${LANGUAGE:-zh-CN}"

SALES_ROLE_NAME="${SALES_ROLE_NAME:-外贸员}"
BUYER_ROLE_NAME="${BUYER_ROLE_NAME:-采购员}"
MANAGER_ROLE_NAME="${MANAGER_ROLE_NAME:-经理}"

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

api_get() {
  local path="$1"
  local filter="$2"

  curl -sS -G "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    --data-urlencode "filter=${filter}"
}

ensure_no_errors() {
  local response="$1"
  local label="$2"

  if jq -e '.errors' >/dev/null 2>&1 <<<"${response}"; then
    local code
    code=$(jq -r '.errors[0].extensions.code // empty' <<<"${response}" 2>/dev/null || true)
    local message
    message=$(jq -r '.errors[0].message // empty' <<<"${response}" 2>/dev/null || true)

    if [ "${code}" = "RECORD_NOT_UNIQUE" ] || [ "${code}" = "VALUE_NOT_UNIQUE" ]; then
      echo "已存在，跳过：${label}"
      return 0
    fi

    if grep -q "already has an associated relationship" <<<"${message}"; then
      echo "关系已存在，跳过：${label}"
      return 0
    fi

    echo "操作失败：${label}"
    echo "响应内容：${response}"
    exit 1
  fi
}

collection_exists() {
  local collection="$1"
  local response
  response=$(api GET "/collections/${collection}" || true)
  jq -e '.data.schema != null' >/dev/null 2>&1 <<<"${response}"
}

field_exists() {
  local collection="$1"
  local field="$2"
  local response
  response=$(api GET "/fields/${collection}/${field}" || true)
  ! jq -e '.errors' >/dev/null 2>&1 <<<"${response}"
}

create_collection() {
  local collection="$1"

  if collection_exists "${collection}"; then
    echo "集合已存在，跳过：${collection}"
    return 0
  fi

  local body
  body=$(jq -n \
    --arg collection "${collection}" \
    --arg language "${LANGUAGE}" \
    '{collection:$collection,meta:{collection:$collection,icon:"checklist",note:"用户任务统计",display_template:"{{user_id.email}} / {{user_id.first_name}} {{user_id.last_name}} / {{role_scope}}",translations:[{language:$language,translation:"用户任务统计"}]},schema:{name:$collection},fields:[{field:"id",type:"uuid",meta:{hidden:true,readonly:true,interface:"system-uuid",special:["uuid"],note:"系统自动生成的主键。"},schema:{is_primary_key:true,length:36,has_auto_increment:false,is_nullable:false}}]}')

  ensure_no_errors "$(api POST /collections "${body}" || true)" "创建集合 ${collection}"
  echo "已创建集合：${collection}"
}

select_options() {
  jq -cn '{choices: ($ARGS.positional | map({text:., value:.}))}' --args "$@"
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

  if field_exists "${collection}" "${field}"; then
    echo "字段已存在，跳过：${collection}.${field}"
    return 0
  fi

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
    --arg language "${LANGUAGE}" \
    '{field:$field,type:$type,meta:{interface:$interface,note:$note,required:$required,width:$width,special:$special,options:$options,translations:[{language:$language,translation:$note}]},schema:{is_nullable:$nullable}}')

  ensure_no_errors "$(api POST "/fields/${collection}" "${body}" || true)" "创建字段 ${collection}.${field}"
  echo "已创建字段：${collection}.${field}"
}

create_relation() {
  local collection="$1"
  local field="$2"
  local related_collection="$3"
  local one_field="$4"
  local on_delete="${5:-CASCADE}"
  local body

  body=$(jq -n \
    --arg collection "${collection}" \
    --arg field "${field}" \
    --arg related_collection "${related_collection}" \
    --arg one_field "${one_field}" \
    --arg on_delete "${on_delete}" \
    '{collection:$collection,field:$field,related_collection:$related_collection,meta:{many_collection:$collection,many_field:$field,one_collection:$related_collection,one_field:$one_field},schema:{on_delete:$on_delete}}')

  ensure_no_errors "$(api POST /relations "${body}" || true)" "创建关系 ${collection}.${field}"
  echo "已确认关系：${collection}.${field}"
}

patch_collection() {
  local collection="$1"
  local body

  body=$(jq -cn \
    --arg language "${LANGUAGE}" \
    '{meta:{display_template:"{{user_id.email}} / {{user_id.first_name}} {{user_id.last_name}} / {{role_scope}}",note:"用户任务统计",translations:[{language:$language,translation:"用户任务统计"}]}}')

  ensure_no_errors "$(api PATCH "/collections/${collection}" "${body}")" "更新集合显示 ${collection}"
  echo "已更新集合显示：${collection}"
}

patch_field_meta() {
  local field="$1"
  local sort="$2"
  local width="${3:-half}"
  local hidden="${4:-false}"
  local translation="$5"
  local body

  body=$(jq -cn \
    --argjson sort "${sort}" \
    --arg width "${width}" \
    --argjson hidden "${hidden}" \
    --arg language "${LANGUAGE}" \
    --arg translation "${translation}" \
    '{meta:{sort:$sort,width:$width,hidden:$hidden,translations:[{language:$language,translation:$translation}]}}')

  ensure_no_errors "$(api PATCH "/fields/user_task_summaries/${field}" "${body}")" "更新字段显示 user_task_summaries.${field}"
  echo "已更新字段显示：user_task_summaries.${field}"
}

get_role_id() {
  local name="$1"
  local response
  response=$(api_get /roles "$(jq -cn --arg name "${name}" '{name:{_eq:$name}}')")
  ensure_no_errors "${response}" "查询角色 ${name}"
  jq -r '.data[0].id // empty' <<<"${response}"
}

get_policy_id_by_role() {
  local role_id="$1"
  local fallback_name="$2"
  local response
  local policy_id

  if [ -n "${role_id}" ]; then
    response=$(api_get /access "$(jq -cn --arg role "${role_id}" '{role:{_eq:$role}}')")
    ensure_no_errors "${response}" "查询角色策略 ${role_id}"
    policy_id=$(jq -r '.data[0].policy // empty' <<<"${response}")

    if [ -n "${policy_id}" ]; then
      printf '%s' "${policy_id}"
      return 0
    fi
  fi

  response=$(api_get /policies "$(jq -cn --arg name "${fallback_name}" '{name:{_eq:$name}}')")
  ensure_no_errors "${response}" "查询策略 ${fallback_name}"
  jq -r '.data[0].id // empty' <<<"${response}"
}

permission_exists() {
  local policy_id="$1"
  local collection="$2"
  local action="$3"
  local response
  response=$(api_get /permissions "$(jq -cn --arg policy "${policy_id}" --arg collection "${collection}" --arg action "${action}" '{policy:{_eq:$policy},collection:{_eq:$collection},action:{_eq:$action}}')")
  ensure_no_errors "${response}" "查询权限 ${collection}.${action}"
  [ "$(jq '.data | length' <<<"${response}")" -gt 0 ]
}

create_permission() {
  local policy_id="$1"
  local collection="$2"
  local action="$3"

  if [ -z "${policy_id}" ]; then
    echo "未找到 policy，跳过权限：${collection}.${action}"
    return 0
  fi

  if permission_exists "${policy_id}" "${collection}" "${action}"; then
    echo "权限已存在，跳过：${collection}.${action}"
    return 0
  fi

  local validation="{}"

  if [ "${action}" = "read" ] || [ "${action}" = "delete" ]; then
    validation="null"
  fi

  local body
  body=$(jq -cn \
    --arg policy "${policy_id}" \
    --arg collection "${collection}" \
    --arg action "${action}" \
    --argjson validation "${validation}" \
    '{policy:$policy,collection:$collection,action:$action,permissions:{},validation:$validation,fields:["*"]}')

  ensure_no_errors "$(api POST /permissions "${body}")" "创建权限 ${collection}.${action}"
  echo "已创建权限：${collection}.${action}"
}

grant_all_actions() {
  local policy_id="$1"
  local collection="$2"

  create_permission "${policy_id}" "${collection}" create
  create_permission "${policy_id}" "${collection}" read
  create_permission "${policy_id}" "${collection}" update
  create_permission "${policy_id}" "${collection}" delete
}

echo "开始执行 20260608 采购询价流程增量迁移..."

create_collection user_task_summaries

create_field user_task_summaries user_id uuid select-dropdown-m2o 用户 true half
create_field user_task_summaries role_scope string select-dropdown 统计角色 true half null "$(select_options Sales Buyer Manager)"
create_field user_task_summaries active_task_count integer input 进行中任务数 false half
create_field user_task_summaries total_completed_task_count integer input 累计完成任务数 false half
create_field user_task_summaries weekly_completed_task_count integer input 本周完成任务数 false half
create_field user_task_summaries active_task_details json input-code 进行中任务详情 false full '["cast-json"]'
create_field user_task_summaries weekly_completed_task_details json input-code 本周完成任务详情 false full '["cast-json"]'
create_field user_task_summaries refreshed_at timestamp datetime 刷新时间 false half

create_relation user_task_summaries user_id directus_users task_summaries CASCADE

patch_collection user_task_summaries
patch_field_meta id 1 half true ID
patch_field_meta user_id 2 half false 用户
patch_field_meta role_scope 3 half false 统计角色
patch_field_meta active_task_count 4 half false 进行中任务数
patch_field_meta total_completed_task_count 5 half false 累计完成任务数
patch_field_meta weekly_completed_task_count 6 half false 本周完成任务数
patch_field_meta refreshed_at 7 half false 刷新时间
patch_field_meta active_task_details 8 full false 进行中任务详情
patch_field_meta weekly_completed_task_details 9 full false 本周完成任务详情

SALES_ROLE_ID=$(get_role_id "${SALES_ROLE_NAME}")
BUYER_ROLE_ID=$(get_role_id "${BUYER_ROLE_NAME}")
MANAGER_ROLE_ID=$(get_role_id "${MANAGER_ROLE_NAME}")

SALES_POLICY_ID=$(get_policy_id_by_role "${SALES_ROLE_ID}" "外贸询价采购 - 外贸员")
BUYER_POLICY_ID=$(get_policy_id_by_role "${BUYER_ROLE_ID}" "外贸询价采购 - 采购员")
MANAGER_POLICY_ID=$(get_policy_id_by_role "${MANAGER_ROLE_ID}" "外贸询价采购 - 经理")

for collection in user_task_summaries; do
  grant_all_actions "${SALES_POLICY_ID}" "${collection}"
  grant_all_actions "${BUYER_POLICY_ID}" "${collection}"
  grant_all_actions "${MANAGER_POLICY_ID}" "${collection}"
done

# 旧权限脚本里采购员未包含客户报价和客户联系人，这里一并补齐，避免独立前端详情页读不到关联信息。
for collection in customer_quotes customer_contacts; do
  grant_all_actions "${BUYER_POLICY_ID}" "${collection}"
done

echo "20260608 采购询价流程增量迁移完成。"
echo "建议后续执行：scripts/rebuild-user-task-summaries.sh 重算统计数据。"
