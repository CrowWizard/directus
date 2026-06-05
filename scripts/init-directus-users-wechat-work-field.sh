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
  echo "缺少 jq，请先安装 jq，例如：sudo apt install -y jq"
  exit 1
fi

login_payload=$(jq -n \
  --arg email "${ADMIN_EMAIL}" \
  --arg password "${ADMIN_PASSWORD}" \
  '{ email: $email, password: $password }')

echo "登录 Directus: ${BASE_URL}"

login_response=$(curl -sS -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "${login_payload}")

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
  else
    curl -sS -X "${method}" "${BASE_URL}${path}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${body}"
  fi
}

field_exists() {
  local response
  response=$(api GET "/fields/directus_users/wechat_work_userid" || true)

  if jq -e '.data.field == "wechat_work_userid"' >/dev/null 2>&1 <<<"${response}"; then
    return 0
  fi

  return 1
}

if field_exists; then
  echo "字段已存在，跳过：directus_users.wechat_work_userid"
  exit 0
fi

body='{
  "field": "wechat_work_userid",
  "type": "string",
  "meta": {
    "interface": "input",
    "width": "half",
    "note": "企业微信 userid，用于群机器人通知时 @ 指定人。"
  },
  "schema": {
    "is_nullable": true
  }
}'

response=$(api POST "/fields/directus_users" "${body}")

if jq -e '.errors' >/dev/null 2>&1 <<<"${response}"; then
  code=$(jq -r '.errors[0].extensions.code // empty' <<<"${response}")

  if [ "${code}" = "RECORD_NOT_UNIQUE" ] || [ "${code}" = "VALUE_NOT_UNIQUE" ]; then
    echo "字段已存在，跳过：directus_users.wechat_work_userid"
    exit 0
  fi

  echo "创建字段失败：directus_users.wechat_work_userid"
  echo "响应内容：${response}"
  exit 1
fi

echo "已创建字段：directus_users.wechat_work_userid"
