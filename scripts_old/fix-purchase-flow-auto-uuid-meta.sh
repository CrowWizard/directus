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

ensure_no_errors() {
  local response="$1"
  local label="$2"

  if jq -e '.errors' >/dev/null 2>&1 <<<"${response}"; then
    echo "操作失败：${label}"
    echo "响应内容：${response}"
    exit 1
  fi
}

patch_auto_uuid_meta() {
  local collection="$1"
  local response
  local body

  body='{
    "meta": {
      "hidden": true,
      "readonly": true,
      "interface": "input",
      "special": ["uuid"],
      "note": "自动生成 UUIDv4 主键；数据库层建议同步设置 DEFAULT gen_random_uuid()。"
    }
  }'

  response=$(api PATCH "/fields/${collection}/id" "${body}")
  ensure_no_errors "${response}" "更新 ${collection}.id 自动 UUID 元数据"
  echo "已更新：${collection}.id"
}

patch_auto_uuid_meta "purchase_orders"
patch_auto_uuid_meta "purchase_recommendations"
patch_auto_uuid_meta "quotations"
patch_auto_uuid_meta "purchaser_assignment_rules"

echo "业务表 id 字段 Directus 自动 UUID 元数据修复完成。"
echo "如果使用 PostgreSQL，请确认数据库已执行：ALTER TABLE <table> ALTER COLUMN id SET DEFAULT gen_random_uuid();"
