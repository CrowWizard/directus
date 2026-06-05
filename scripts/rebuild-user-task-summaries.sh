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

api_get() {
  local path="$1"
  shift

  curl -sS -G "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

ensure_no_errors() {
  local response="$1"
  local label="$2"

  if [ -z "${response}" ]; then
    return 0
  fi

  if jq -e '.errors' >/dev/null 2>&1 <<<"${response}"; then
    echo "操作失败：${label}"
    echo "响应内容：${response}"
    exit 1
  fi
}

week_start_iso() {
  date -u -d "$(date -u +%Y-%m-%d) -$(( ($(date -u +%u) + 6) % 7 )) days" +%Y-%m-%dT00:00:00Z
}

get_users() {
  api_get /users --data-urlencode 'fields=id,email,role.name' --data-urlencode 'limit=-1'
}

get_tasks() {
  local filter="$1"
  api_get /items/inquiry_items \
    --data-urlencode 'fields=id,inquiry_no,product_name,brand,priority,state,buyer_owner_id,sales_owner_id,assignment_deadline,completed_at,updated_at' \
    --data-urlencode 'sort=-updated_at' \
    --data-urlencode 'limit=50' \
    --data-urlencode "filter=${filter}"
}

normalize_tasks() {
  jq '[.data[] | {id,inquiry_no,product_name,brand,priority,state,buyer_owner_id,sales_owner_id,assignment_deadline,completed_at,updated_at}]'
}

upsert_summary() {
  local user_id="$1"
  local role_scope="$2"
  local active_tasks="$3"
  local total_completed_tasks="$4"
  local weekly_completed_tasks="$5"
  local existing_id
  local response
  local body

  existing_id=$(api_get /items/user_task_summaries \
    --data-urlencode 'fields=id' \
    --data-urlencode "filter=$(jq -cn --arg user_id "${user_id}" --arg role_scope "${role_scope}" '{user_id:{_eq:$user_id},role_scope:{_eq:$role_scope}}')" \
    | jq -r '.data[0].id // empty')

  body=$(jq -cn \
    --arg user_id "${user_id}" \
    --arg role_scope "${role_scope}" \
    --argjson active_tasks "${active_tasks}" \
    --argjson total_completed_tasks "${total_completed_tasks}" \
    --argjson weekly_completed_tasks "${weekly_completed_tasks}" \
    '{user_id:$user_id,role_scope:$role_scope,active_task_count:($active_tasks|length),total_completed_task_count:($total_completed_tasks|length),weekly_completed_task_count:($weekly_completed_tasks|length),active_task_details:$active_tasks,weekly_completed_task_details:$weekly_completed_tasks,refreshed_at:now|todate}')

  if [ -n "${existing_id}" ]; then
    response=$(api PATCH "/items/user_task_summaries/${existing_id}" "${body}")
    ensure_no_errors "${response}" "更新统计 ${user_id}/${role_scope}"
    echo "已更新统计：${user_id}/${role_scope}"
    return 0
  fi

  response=$(api POST /items/user_task_summaries "${body}")
  ensure_no_errors "${response}" "创建统计 ${user_id}/${role_scope}"
  echo "已创建统计：${user_id}/${role_scope}"
}

clear_wrong_summaries() {
  local ids
  ids=$(api_get /items/user_task_summaries --data-urlencode 'fields=id' --data-urlencode 'limit=-1' | jq -r '.data[].id')

  for id in ${ids}; do
    response=$(api DELETE "/items/user_task_summaries/${id}")
    ensure_no_errors "${response}" "删除旧统计 ${id}"
  done
}

build_filter() {
  local user_id="$1"
  local role_scope="$2"
  local mode="$3"
  local week_start="$4"

  jq -cn \
    --arg user_id "${user_id}" \
    --arg role_scope "${role_scope}" \
    --arg mode "${mode}" \
    --arg week_start "${week_start}" '
      def owner:
        if $role_scope == "Sales" then {sales_owner_id:{_eq:$user_id}}
        elif $role_scope == "Buyer" then {buyer_owner_id:{_eq:$user_id}}
        else {} end;
      def states:
        if $mode == "active" then
          if $role_scope == "Sales" then {state:{_in:["Draft","WaitingSalesReview"]}}
          elif $role_scope == "Buyer" then {state:{_in:["Assigned","Purchasing"]}}
          else {state:{_in:["Assigned","Purchasing","WaitingSalesReview"]}} end
        elif $mode == "weekly_completed" then {state:{_in:["Quoted","Closed"]},completed_at:{_gte:$week_start}}
        else {state:{_in:["Quoted","Closed"]}} end;
      owner + states'
}

clear_wrong_summaries

users_response=$(get_users)
ensure_no_errors "${users_response}" "读取用户"
week_start=$(week_start_iso)

echo "开始按正确规则重算用户任务统计..."

jq -c '.data[]' <<<"${users_response}" | while read -r user; do
  user_id=$(jq -r '.id' <<<"${user}")
  email=$(jq -r '.email' <<<"${user}")
  role_name=$(jq -r '.role.name // empty' <<<"${user}")
  role_scope=""

  case "${role_name}" in
    外贸员) role_scope=Sales ;;
    采购员) role_scope=Buyer ;;
    经理) role_scope=Manager ;;
    *) continue ;;
  esac

  active_filter=$(build_filter "${user_id}" "${role_scope}" active "${week_start}")
  completed_filter=$(build_filter "${user_id}" "${role_scope}" completed "${week_start}")
  weekly_filter=$(build_filter "${user_id}" "${role_scope}" weekly_completed "${week_start}")

  active_tasks=$(get_tasks "${active_filter}" | normalize_tasks)
  completed_tasks=$(get_tasks "${completed_filter}" | normalize_tasks)
  weekly_tasks=$(get_tasks "${weekly_filter}" | normalize_tasks)

  upsert_summary "${user_id}" "${role_scope}" "${active_tasks}" "${completed_tasks}" "${weekly_tasks}"
  echo "${email} -> ${role_scope} 统计完成"
done

echo "用户任务统计重算完成。"
