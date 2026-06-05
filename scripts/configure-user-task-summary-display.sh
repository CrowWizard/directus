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

patch_field_sort() {
  local field="$1"
  local sort="$2"
  local width="${3:-half}"
  local hidden="${4:-false}"
  local body

  body=$(jq -cn \
    --argjson sort "${sort}" \
    --arg width "${width}" \
    --argjson hidden "${hidden}" \
    '{meta:{sort:$sort,width:$width,hidden:$hidden}}')

  api_patch "/fields/user_task_summaries/${field}" "${body}" "user_task_summaries.${field}"
}

api_patch "/collections/user_task_summaries" \
  '{"meta":{"display_template":"{{user_id.email}} / {{user_id.first_name}} {{user_id.last_name}} / {{role_scope}}","note":"用户任务统计"}}' \
  "用户任务统计显示模板"

patch_field_sort id 1 half true
patch_field_sort user_id 2 half false
patch_field_sort role_scope 3 half false
patch_field_sort active_task_count 4 half false
patch_field_sort total_completed_task_count 5 half false
patch_field_sort weekly_completed_task_count 6 half false
patch_field_sort refreshed_at 7 half false
patch_field_sort active_task_details 8 full false
patch_field_sort weekly_completed_task_details 9 full false

echo "用户任务统计列表显示配置完成。"
