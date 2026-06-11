#!/usr/bin/env bash
# 2026-06-11 采购询价流程增量迁移。
# 增加 Tag 管理集合，并收紧客户、供应商、员工和 Tag 的角色权限。

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

  if [ -z "${response}" ]; then
    return 0
  fi

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
}

collection_exists() {
  local collection="$1"
  local response
  response=$(api GET "/collections/${collection}" || true)
  ! jq -e '.errors' >/dev/null 2>&1 <<<"${response}"
}

collection_has_schema() {
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

  if collection_has_schema "${collection}"; then
    echo "集合和数据表已存在，跳过：${collection}"
    return 0
  fi

  if collection_exists "${collection}"; then
    echo "集合元数据已存在但缺少 schema：${collection}"
    echo "本脚本只通过 Directus API 迁移，不直接操作数据库。"
    echo "请先在 Directus 中删除异常的 ${collection} 元数据，或用官方 schema 工具修复后重试。"
    exit 1
  fi

  local body
  body=$(jq -n \
    --arg collection "${collection}" \
    --arg language "${LANGUAGE}" \
    '{collection:$collection,meta:{collection:$collection,icon:"sell",note:"采购流程 Tag 字典",display_template:"{{tag_name}}",translations:[{language:$language,translation:"采购 Tag"}]},schema:{name:$collection},fields:[{field:"id",type:"uuid",meta:{hidden:true,readonly:true,interface:"system-uuid",special:["uuid"],note:"系统自动生成的主键。"},schema:{is_primary_key:true,length:36,has_auto_increment:false,is_nullable:false}}]}')

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

delete_permission() {
  local permission_id="$1"
  local label="$2"

  if [ -z "${permission_id}" ]; then
    return 0
  fi

  ensure_no_errors "$(api DELETE "/permissions/${permission_id}" || true)" "删除权限 ${label}"
  echo "已删除权限：${label}"
}

delete_permission_if_exists() {
  local policy_id="$1"
  local collection="$2"
  local action="$3"
  local response

  if [ -z "${policy_id}" ]; then
    return 0
  fi

  response=$(api_get /permissions "$(jq -cn --arg policy "${policy_id}" --arg collection "${collection}" --arg action "${action}" '{policy:{_eq:$policy},collection:{_eq:$collection},action:{_eq:$action}}')")
  ensure_no_errors "${response}" "查询权限 ${collection}.${action}"

  jq -r '.data[].id' <<<"${response}" | while read -r permission_id; do
    delete_permission "${permission_id}" "${collection}.${action}"
  done
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
  local permissions="{}"
  local validation="null"
  local fields='["*"]'

  if [ -z "${policy_id}" ]; then
    echo "未找到 policy，跳过权限：${collection}.${action}"
    return 0
  fi

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

grant_read_only() {
  local policy_id="$1"
  local collection="$2"
  create_permission "${policy_id}" "${collection}" read '{}' null
}

grant_all_actions() {
  local policy_id="$1"
  local collection="$2"
  create_permission "${policy_id}" "${collection}" create '{}' '{}'
  create_permission "${policy_id}" "${collection}" read '{}' null
  create_permission "${policy_id}" "${collection}" update '{}' '{}'
  create_permission "${policy_id}" "${collection}" delete '{}' null
}

make_read_only() {
  local policy_id="$1"
  local collection="$2"

  delete_permission_if_exists "${policy_id}" "${collection}" create
  delete_permission_if_exists "${policy_id}" "${collection}" update
  delete_permission_if_exists "${policy_id}" "${collection}" delete
  grant_read_only "${policy_id}" "${collection}"
}

echo "开始执行 20260611 员工与 Tag 管理增量迁移..."

create_collection purchase_tags
create_field purchase_tags tag_name string input Tag名称 true half
create_field purchase_tags enabled boolean boolean 启用 false half
create_field purchase_tags created_at timestamp datetime 创建时间 false half '["date-created"]'
create_field purchase_tags updated_at timestamp datetime 更新时间 false half '["date-updated"]'

SALES_ROLE_ID=$(get_role_id "${SALES_ROLE_NAME}")
BUYER_ROLE_ID=$(get_role_id "${BUYER_ROLE_NAME}")
MANAGER_ROLE_ID=$(get_role_id "${MANAGER_ROLE_NAME}")

SALES_POLICY_ID=$(get_policy_id_by_role "${SALES_ROLE_ID}" "外贸询价采购 - 外贸员")
BUYER_POLICY_ID=$(get_policy_id_by_role "${BUYER_ROLE_ID}" "外贸询价采购 - 采购员")
MANAGER_POLICY_ID=$(get_policy_id_by_role "${MANAGER_ROLE_ID}" "外贸询价采购 - 经理")

for collection in customers customer_contacts suppliers supplier_contacts directus_users purchase_tags; do
  make_read_only "${SALES_POLICY_ID}" "${collection}"
  make_read_only "${BUYER_POLICY_ID}" "${collection}"
done

grant_all_actions "${MANAGER_POLICY_ID}" customers
grant_all_actions "${MANAGER_POLICY_ID}" customer_contacts
grant_all_actions "${MANAGER_POLICY_ID}" suppliers
grant_all_actions "${MANAGER_POLICY_ID}" supplier_contacts
grant_all_actions "${MANAGER_POLICY_ID}" directus_users
grant_read_only "${MANAGER_POLICY_ID}" directus_roles
grant_all_actions "${MANAGER_POLICY_ID}" purchase_tags
grant_all_actions "${MANAGER_POLICY_ID}" buyer_profiles

echo "20260611 员工与 Tag 管理增量迁移完成。"
