#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8055}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"

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
    echo "操作失败：${label}"
    echo "响应内容：${response}"
    exit 1
  fi
}

ensure_role() {
  local name="$1"
  local response
  response=$(api_get /roles "$(jq -cn --arg name "${name}" '{name:{_eq:$name}}')")
  ensure_no_errors "${response}" "查询角色 ${name}"

  local id
  id=$(jq -r '.data[0].id // empty' <<<"${response}")

  if [ -n "${id}" ]; then
    printf '%s' "${id}"
    return 0
  fi

  response=$(api POST /roles "$(jq -cn --arg name "${name}" '{name:$name}')")
  ensure_no_errors "${response}" "创建角色 ${name}"
  jq -r '.data.id' <<<"${response}"
}

ensure_policy() {
  local name="$1"
  local response
  response=$(api_get /policies "$(jq -cn --arg name "${name}" '{name:{_eq:$name}}')")
  ensure_no_errors "${response}" "查询策略 ${name}"

  local id
  id=$(jq -r '.data[0].id // empty' <<<"${response}")

  if [ -n "${id}" ]; then
    printf '%s' "${id}"
    return 0
  fi

  response=$(api POST /policies "$(jq -cn --arg name "${name}" '{name:$name,app_access:true,admin_access:false}')")
  ensure_no_errors "${response}" "创建策略 ${name}"
  jq -r '.data.id' <<<"${response}"
}

ensure_access() {
  local role_id="$1"
  local policy_id="$2"
  local response
  response=$(api_get /access "$(jq -cn --arg role "${role_id}" --arg policy "${policy_id}" '{role:{_eq:$role},policy:{_eq:$policy}}')")
  ensure_no_errors "${response}" "查询访问绑定"

  if [ "$(jq '.data | length' <<<"${response}")" -gt 0 ]; then
    return 0
  fi

  response=$(api POST /access "$(jq -cn --arg role "${role_id}" --arg policy "${policy_id}" '{role:$role,policy:$policy}')")
  ensure_no_errors "${response}" "创建访问绑定"
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

get_permission_id() {
  local policy_id="$1"
  local collection="$2"
  local action="$3"
  local response
  response=$(api_get /permissions "$(jq -cn --arg policy "${policy_id}" --arg collection "${collection}" --arg action "${action}" '{policy:{_eq:$policy},collection:{_eq:$collection},action:{_eq:$action}}')")
  ensure_no_errors "${response}" "查询权限 ${collection}.${action}"
  jq -r '.data[0].id // empty' <<<"${response}"
}

create_permission() {
  local policy_id="$1"
  local collection="$2"
  local action="$3"
  local permissions="{}"
  local validation="null"
  local fields='["*"]'

  if [ "$#" -ge 4 ]; then
    permissions="$4"
  fi

  if [ "$#" -ge 5 ]; then
    validation="$5"
  fi

  if [ "$#" -ge 6 ]; then
    fields="$6"
  fi

  if permission_exists "${policy_id}" "${collection}" "${action}"; then
    echo "权限已存在，跳过：${collection}.${action}"
    return 0
  fi

  local body
  body=$(jq -cn \
    --arg policy "${policy_id}" \
    --arg collection "${collection}" \
    --arg action "${action}" \
    --arg permissions "${permissions}" \
    --arg validation "${validation}" \
    --arg fields "${fields}" \
    '{policy:$policy,collection:$collection,action:$action,permissions:($permissions|fromjson),validation:($validation|fromjson),fields:($fields|fromjson)}')

  ensure_no_errors "$(api POST /permissions "${body}")" "创建权限 ${collection}.${action}"
  echo "已创建权限：${collection}.${action}"
}

upsert_permission() {
  local policy_id="$1"
  local collection="$2"
  local action="$3"
  local permissions="{}"
  local validation="${5:-null}"
  local fields="${6:-[\"*\"]}"
  local permission_id

  if [ "$#" -ge 4 ]; then
    permissions="$4"
  fi

  permission_id=$(get_permission_id "${policy_id}" "${collection}" "${action}")

  local body
  body=$(jq -cn \
    --arg policy "${policy_id}" \
    --arg collection "${collection}" \
    --arg action "${action}" \
    --arg permissions "${permissions}" \
    --arg validation "${validation}" \
    --arg fields "${fields}" \
    '{policy:$policy,collection:$collection,action:$action,permissions:($permissions|fromjson),validation:($validation|fromjson),fields:($fields|fromjson)}')

  if [ -n "${permission_id}" ]; then
    ensure_no_errors "$(api PATCH "/permissions/${permission_id}" "${body}")" "更新权限 ${collection}.${action}"
    echo "已更新权限：${collection}.${action}"
    return 0
  fi

  ensure_no_errors "$(api POST /permissions "${body}")" "创建权限 ${collection}.${action}"
  echo "已创建权限：${collection}.${action}"
}

grant_all_actions() {
  local policy_id="$1"
  local collection="$2"

  create_permission "${policy_id}" "${collection}" create '{}' '{}'
  create_permission "${policy_id}" "${collection}" read '{}' null
  create_permission "${policy_id}" "${collection}" update '{}' '{}'
  create_permission "${policy_id}" "${collection}" delete '{}' null
}

grant_read_only() {
  local policy_id="$1"
  local collection="$2"

  create_permission "${policy_id}" "${collection}" read '{}' null
}

echo "开始创建角色和权限..."

SALES_ROLE_ID=$(ensure_role "${SALES_ROLE_NAME}")
BUYER_ROLE_ID=$(ensure_role "${BUYER_ROLE_NAME}")
MANAGER_ROLE_ID=$(ensure_role "${MANAGER_ROLE_NAME}")

SALES_POLICY_ID=$(ensure_policy "外贸询价采购 - 外贸员")
BUYER_POLICY_ID=$(ensure_policy "外贸询价采购 - 采购员")
MANAGER_POLICY_ID=$(ensure_policy "外贸询价采购 - 经理")

ensure_access "${SALES_ROLE_ID}" "${SALES_POLICY_ID}"
ensure_access "${BUYER_ROLE_ID}" "${BUYER_POLICY_ID}"
ensure_access "${MANAGER_ROLE_ID}" "${MANAGER_POLICY_ID}"

for collection in inquiry_items customer_quotes conversations attachments supplier_quotes priority_rules assignment_accept_tokens user_task_summaries; do
  grant_all_actions "${SALES_POLICY_ID}" "${collection}"
done

for collection in inquiry_items supplier_quotes conversations attachments buyer_profiles assignment_rules priority_rules assignment_accept_tokens user_task_summaries; do
  grant_all_actions "${BUYER_POLICY_ID}" "${collection}"
done

for collection in customers customer_contacts suppliers supplier_contacts inquiry_items supplier_quotes customer_quotes conversations attachments buyer_profiles priority_rules assignment_rules assignment_accept_tokens manager_approvals user_task_summaries purchase_tags; do
  grant_all_actions "${MANAGER_POLICY_ID}" "${collection}"
done

for collection in customers customer_contacts suppliers supplier_contacts purchase_tags; do
  grant_read_only "${SALES_POLICY_ID}" "${collection}"
  grant_read_only "${BUYER_POLICY_ID}" "${collection}"
done

grant_read_only "${SALES_POLICY_ID}" directus_users
grant_read_only "${BUYER_POLICY_ID}" directus_users
grant_all_actions "${MANAGER_POLICY_ID}" directus_users
grant_read_only "${MANAGER_POLICY_ID}" directus_roles

upsert_permission "${SALES_POLICY_ID}" directus_files create '{}' '{}' '["*"]'
upsert_permission "${SALES_POLICY_ID}" directus_files read '{}' null '["*"]'
upsert_permission "${BUYER_POLICY_ID}" directus_files create '{}' '{}' '["*"]'
upsert_permission "${BUYER_POLICY_ID}" directus_files read '{}' null '["*"]'
upsert_permission "${MANAGER_POLICY_ID}" directus_files create '{}' '{}' '["*"]'
upsert_permission "${MANAGER_POLICY_ID}" directus_files read '{}' null '["*"]'

grant_read_only "${SALES_POLICY_ID}" manager_approvals
grant_read_only "${BUYER_POLICY_ID}" manager_approvals

echo "权限配置完成。"
echo "外贸员角色：${SALES_ROLE_ID}"
echo "采购员角色：${BUYER_ROLE_ID}"
echo "经理角色：${MANAGER_ROLE_ID}"
