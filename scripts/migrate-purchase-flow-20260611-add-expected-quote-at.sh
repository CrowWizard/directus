#!/usr/bin/env bash
# 2026-06-11 采购询价流程增量迁移。
# 幂等补齐询价项期望报价时间字段，用于后续企业微信通知依据。

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8055}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
LANGUAGE="${LANGUAGE:-zh-CN}"

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
}

field_exists() {
  local collection="$1"
  local field="$2"
  local response
  response=$(api GET "/fields/${collection}/${field}" || true)
  ! jq -e '.errors' >/dev/null 2>&1 <<<"${response}"
}

create_expected_quote_at_field() {
  if field_exists inquiry_items expected_quote_at; then
    echo "字段已存在，跳过：inquiry_items.expected_quote_at"
    return 0
  fi

  local body
  body=$(jq -n \
    --arg language "${LANGUAGE}" \
    '{field:"expected_quote_at",type:"timestamp",meta:{interface:"datetime",note:"期望报价时间，用于后续企业微信通知依据。",required:false,width:"half",translations:[{language:$language,translation:"期望报价时间"}]},schema:{is_nullable:true}}')

  ensure_no_errors "$(api POST /fields/inquiry_items "${body}" || true)" "创建字段 inquiry_items.expected_quote_at"
  echo "已创建字段：inquiry_items.expected_quote_at"
}

patch_expected_quote_at_display() {
  local body
  body=$(jq -cn \
    --arg language "${LANGUAGE}" \
    '{meta:{interface:"datetime",width:"half",translations:[{language:$language,translation:"期望报价时间"}],note:"期望报价时间，用于后续企业微信通知依据。"}}')

  ensure_no_errors "$(api PATCH /fields/inquiry_items/expected_quote_at "${body}")" "更新字段显示 inquiry_items.expected_quote_at"
  echo "已更新字段显示：inquiry_items.expected_quote_at"
}

echo "开始执行 20260611 采购询价流程增量迁移..."

create_expected_quote_at_field
patch_expected_quote_at_display

echo "20260611 采购询价流程增量迁移完成。"
