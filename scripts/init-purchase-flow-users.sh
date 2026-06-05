#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8055}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"

SALES_ROLE_NAME="${SALES_ROLE_NAME:-外贸员}"
BUYER_ROLE_NAME="${BUYER_ROLE_NAME:-采购员}"
MANAGER_ROLE_NAME="${MANAGER_ROLE_NAME:-经理}"

SALES_EMAIL="${SALES_EMAIL:-sales@example.com}"
SALES_PASSWORD="${SALES_PASSWORD:-12345678}"
SALES_FIRST_NAME="${SALES_FIRST_NAME:-外贸}"
SALES_LAST_NAME="${SALES_LAST_NAME:-A}"
SALES_WECHAT_WORK_USERID="${SALES_WECHAT_WORK_USERID:-}"

BUYER1_EMAIL="${BUYER1_EMAIL:-buyer1@example.com}"
BUYER1_PASSWORD="${BUYER1_PASSWORD:-12345678}"
BUYER1_FIRST_NAME="${BUYER1_FIRST_NAME:-采购}"
BUYER1_LAST_NAME="${BUYER1_LAST_NAME:-B}"
BUYER1_WECHAT_WORK_USERID="${BUYER1_WECHAT_WORK_USERID:-}"
BUYER1_TAGS="${BUYER1_TAGS:-electronics,connector}"
BUYER1_BRANDS="${BUYER1_BRANDS:-Omron,Siemens}"
BUYER1_SCORE="${BUYER1_SCORE:-90}"

BUYER2_EMAIL="${BUYER2_EMAIL:-buyer2@example.com}"
BUYER2_PASSWORD="${BUYER2_PASSWORD:-12345678}"
BUYER2_FIRST_NAME="${BUYER2_FIRST_NAME:-采购}"
BUYER2_LAST_NAME="${BUYER2_LAST_NAME:-C}"
BUYER2_WECHAT_WORK_USERID="${BUYER2_WECHAT_WORK_USERID:-}"
BUYER2_TAGS="${BUYER2_TAGS:-hardware,mechanical}"
BUYER2_BRANDS="${BUYER2_BRANDS:-ABB,Schneider}"
BUYER2_SCORE="${BUYER2_SCORE:-85}"

MANAGER_EMAIL="${MANAGER_EMAIL:-manager@example.com}"
MANAGER_PASSWORD="${MANAGER_PASSWORD:-12345678}"
MANAGER_FIRST_NAME="${MANAGER_FIRST_NAME:-经理}"
MANAGER_LAST_NAME="${MANAGER_LAST_NAME:-M}"
MANAGER_WECHAT_WORK_USERID="${MANAGER_WECHAT_WORK_USERID:-}"

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

get_role_id() {
  local role_name="$1"
  local response
  response=$(api_get /roles "$(jq -cn --arg name "${role_name}" '{name:{_eq:$name}}')")
  ensure_no_errors "${response}" "查询角色 ${role_name}"
  jq -r '.data[0].id // empty' <<<"${response}"
}

get_user_id() {
  local email="$1"
  local response
  response=$(api_get /users "$(jq -cn --arg email "${email}" '{email:{_eq:$email}}')")
  ensure_no_errors "${response}" "查询用户 ${email}"
  jq -r '.data[0].id // empty' <<<"${response}"
}

build_user_payload() {
  local email="$1"
  local password="$2"
  local first_name="$3"
  local last_name="$4"
  local role_id="$5"
  local wechat_work_userid="$6"

  jq -cn \
    --arg email "${email}" \
    --arg password "${password}" \
    --arg first_name "${first_name}" \
    --arg last_name "${last_name}" \
    --arg role "${role_id}" \
    --arg wechat_work_userid "${wechat_work_userid}" \
    '{email:$email,password:$password,first_name:$first_name,last_name:$last_name,role:$role,status:"active"} + if $wechat_work_userid == "" then {} else {wechat_work_userid:$wechat_work_userid} end'
}

create_or_update_user() {
  local label="$1"
  local email="$2"
  local password="$3"
  local first_name="$4"
  local last_name="$5"
  local role_id="$6"
  local wechat_work_userid="$7"
  local payload
  local response
  local user_id

  payload=$(build_user_payload "${email}" "${password}" "${first_name}" "${last_name}" "${role_id}" "${wechat_work_userid}")
  user_id=$(get_user_id "${email}")

  if [ -n "${user_id}" ]; then
    response=$(api PATCH "/users/${user_id}" "${payload}")
    ensure_no_errors "${response}" "更新${label}用户 ${email}"
    echo "已更新${label}用户：${email} (${user_id})" >&2
    printf '%s' "${user_id}"
    return 0
  fi

  response=$(api POST /users "${payload}")
  ensure_no_errors "${response}" "创建${label}用户 ${email}"
  user_id=$(jq -r '.data.id' <<<"${response}")
  echo "已创建${label}用户：${email} (${user_id})" >&2
  printf '%s' "${user_id}"
}

get_buyer_profile_id() {
  local buyer_id="$1"
  local response
  response=$(api_get /items/buyer_profiles "$(jq -cn --arg buyer_id "${buyer_id}" '{buyer_id:{_eq:$buyer_id}}')")
  ensure_no_errors "${response}" "查询采购员画像 ${buyer_id}"
  jq -r '.data[0].id // empty' <<<"${response}"
}

create_or_update_buyer_profile() {
  local buyer_id="$1"
  local tags="$2"
  local brands="$3"
  local score="$4"
  local profile_id
  local payload
  local response

  payload=$(jq -cn \
    --arg buyer_id "${buyer_id}" \
    --arg tags "${tags}" \
    --arg brands "${brands}" \
    --argjson score "${score}" \
    '{buyer_id:$buyer_id,tags:$tags,brands:$brands,score:$score,active_task_count:0,completed_task_count:0,is_available:true}')

  profile_id=$(get_buyer_profile_id "${buyer_id}")

  if [ -n "${profile_id}" ]; then
    response=$(api PATCH "/items/buyer_profiles/${profile_id}" "${payload}")
    ensure_no_errors "${response}" "更新采购员画像 ${buyer_id}"
    echo "已更新采购员画像：${buyer_id}"
    return 0
  fi

  response=$(api POST /items/buyer_profiles "${payload}")
  ensure_no_errors "${response}" "创建采购员画像 ${buyer_id}"
  echo "已创建采购员画像：${buyer_id}"
}

SALES_ROLE_ID=$(get_role_id "${SALES_ROLE_NAME}")
BUYER_ROLE_ID=$(get_role_id "${BUYER_ROLE_NAME}")
MANAGER_ROLE_ID=$(get_role_id "${MANAGER_ROLE_NAME}")

if [ -z "${SALES_ROLE_ID}" ] || [ -z "${BUYER_ROLE_ID}" ] || [ -z "${MANAGER_ROLE_ID}" ]; then
  echo "未找到外贸员、采购员或经理角色。请先执行 scripts/init-purchase-flow-permissions.sh。"
  exit 1
fi

echo "开始初始化外贸询价采购用户..."

SALES_USER_ID=$(create_or_update_user 外贸员 "${SALES_EMAIL}" "${SALES_PASSWORD}" "${SALES_FIRST_NAME}" "${SALES_LAST_NAME}" "${SALES_ROLE_ID}" "${SALES_WECHAT_WORK_USERID}")
BUYER1_USER_ID=$(create_or_update_user 采购员1 "${BUYER1_EMAIL}" "${BUYER1_PASSWORD}" "${BUYER1_FIRST_NAME}" "${BUYER1_LAST_NAME}" "${BUYER_ROLE_ID}" "${BUYER1_WECHAT_WORK_USERID}")
BUYER2_USER_ID=$(create_or_update_user 采购员2 "${BUYER2_EMAIL}" "${BUYER2_PASSWORD}" "${BUYER2_FIRST_NAME}" "${BUYER2_LAST_NAME}" "${BUYER_ROLE_ID}" "${BUYER2_WECHAT_WORK_USERID}")
MANAGER_USER_ID=$(create_or_update_user 经理 "${MANAGER_EMAIL}" "${MANAGER_PASSWORD}" "${MANAGER_FIRST_NAME}" "${MANAGER_LAST_NAME}" "${MANAGER_ROLE_ID}" "${MANAGER_WECHAT_WORK_USERID}")

create_or_update_buyer_profile "${BUYER1_USER_ID}" "${BUYER1_TAGS}" "${BUYER1_BRANDS}" "${BUYER1_SCORE}"
create_or_update_buyer_profile "${BUYER2_USER_ID}" "${BUYER2_TAGS}" "${BUYER2_BRANDS}" "${BUYER2_SCORE}"

echo "用户初始化完成。"
echo "外贸员：${SALES_EMAIL} / ${SALES_PASSWORD} / ${SALES_USER_ID}"
echo "采购员1：${BUYER1_EMAIL} / ${BUYER1_PASSWORD} / ${BUYER1_USER_ID}"
echo "采购员2：${BUYER2_EMAIL} / ${BUYER2_PASSWORD} / ${BUYER2_USER_ID}"
echo "经理：${MANAGER_EMAIL} / ${MANAGER_PASSWORD} / ${MANAGER_USER_ID}"
