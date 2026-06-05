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
  curl -sS -X "$1" "${BASE_URL}$2" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$3"
}

post_item() {
  local collection="$1"
  local body="$2"
  local label="$3"
  local response
  response=$(api POST "/items/${collection}" "${body}" || true)

  if jq -e '.errors' >/dev/null 2>&1 <<<"${response}"; then
    local code
    code=$(jq -r '.errors[0].extensions.code // empty' <<<"${response}" 2>/dev/null || true)

    if [ "${code}" = "RECORD_NOT_UNIQUE" ] || [ "${code}" = "VALUE_NOT_UNIQUE" ]; then
      echo "已存在，跳过：${label}"
      return 0
    fi

    echo "创建失败：${label}"
    echo "响应内容：${response}"
    exit 1
  fi

  echo "已创建：${label}"
}

post_item priority_rules '{"priority":"Low","assignment_timeout_minutes":240,"reminder_interval_minutes":120,"approval_threshold":10000}' "低优先级规则"
post_item priority_rules '{"priority":"Normal","assignment_timeout_minutes":120,"reminder_interval_minutes":60,"approval_threshold":10000}' "普通优先级规则"
post_item priority_rules '{"priority":"High","assignment_timeout_minutes":60,"reminder_interval_minutes":30,"approval_threshold":10000}' "高优先级规则"
post_item priority_rules '{"priority":"Urgent","assignment_timeout_minutes":30,"reminder_interval_minutes":10,"approval_threshold":10000}' "紧急优先级规则"

echo "优先级规则初始化完成。"
echo "采购员画像 buyer_profiles 和自动分配规则 assignment_rules 需要根据实际用户 ID 补充。"
