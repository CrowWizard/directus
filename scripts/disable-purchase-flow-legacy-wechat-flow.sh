#!/usr/bin/env bash
# 禁用采购询价流程里会发送旧链接/无 token 链接的 Flow 通知。
# 当前企业微信接单通知由 purchase-flow-auto-id Hook 负责生成 token 链接。

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

ensure_json() {
  local response="$1"
  local label="$2"

  if ! jq empty >/dev/null 2>&1 <<<"${response}"; then
    echo "响应不是 JSON：${label}"
    echo "请检查 BASE_URL 是否为 Directus API 地址，当前 BASE_URL=${BASE_URL}"
    echo "响应内容前 500 字符："
    printf '%s' "${response}" | cut -c 1-500
    echo
    exit 1
  fi
}

ensure_json "${login_response}" "登录 Directus"

TOKEN=$(jq -r '.data.access_token // empty' <<<"${login_response}")

if [ -z "${TOKEN}" ]; then
  echo "登录失败，请检查 BASE_URL / ADMIN_EMAIL / ADMIN_PASSWORD。"
  echo "响应内容：${login_response}"
  exit 1
fi

api_get() {
  local path="$1"
  local filter="$2"

  curl -sS -G "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    --data-urlencode "filter=${filter}"
}

api_patch() {
  local path="$1"
  local body="$2"

  curl -sS -X PATCH "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${body}"
}

ensure_no_errors() {
  local response="$1"
  local label="$2"

  ensure_json "${response}" "${label}"

  if jq -e '.errors' >/dev/null 2>&1 <<<"${response}"; then
    echo "操作失败：${label}"
    echo "响应内容：${response}"
    exit 1
  fi
}

disable_flow() {
  local name="$1"
  local response
  local id

  response=$(api_get /flows "$(jq -cn --arg name "${name}" '{name:{_eq:$name}}')")
  ensure_no_errors "${response}" "查询 Flow ${name}"

  id=$(jq -r '.data[0].id // empty' <<<"${response}")

  if [ -z "${id}" ]; then
    echo "Flow 不存在，跳过：${name}"
    return 0
  fi

  response=$(api_patch "/flows/${id}" '{"status":"inactive"}')
  ensure_no_errors "${response}" "禁用 Flow ${name}"
  echo "已禁用 Flow：${name}"
}

disable_flow "询价项创建后通知采购员"

echo "旧采购接单 Flow 通知禁用完成。"
