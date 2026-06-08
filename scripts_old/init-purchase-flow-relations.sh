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

  curl -sS -X "${method}" "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    ${body:+-d "${body}"}
}

ensure_no_errors() {
  local response="$1"
  local label="$2"

  if jq -e '.errors' >/dev/null 2>&1 <<<"${response}"; then
    local message
    message=$(jq -r '.errors[0].message // empty' <<<"${response}" 2>/dev/null || true)

    if grep -q "already has an associated relationship" <<<"${message}"; then
      echo "关系已存在，跳过：${label}"
      return 0
    fi

    echo "操作失败：${label}"
    echo "响应内容：${response}"
    exit 1
  fi

  echo "已创建关系：${label}"
}

create_relation() {
  local collection="$1"
  local field="$2"
  local related_collection="$3"
  local one_field="${4:-}"
  local on_delete="${5:-SET NULL}"
  local label="${collection}.${field} -> ${related_collection}"

  local body
  body=$(jq -n \
    --arg collection "${collection}" \
    --arg field "${field}" \
    --arg related_collection "${related_collection}" \
    --arg one_field "${one_field}" \
    --arg on_delete "${on_delete}" \
    '{collection:$collection,field:$field,related_collection:$related_collection,meta:{many_collection:$collection,many_field:$field,one_collection:$related_collection,one_field:(if $one_field == "" then null else $one_field end)},schema:{on_delete:$on_delete}}')

  ensure_no_errors "$(api POST /relations "${body}" || true)" "${label}"
}

echo "开始创建新采购报价模型关系..."

create_relation customer_contacts customer_id customers contacts CASCADE
create_relation suppliers buyer_id directus_users owned_suppliers "SET NULL"
create_relation supplier_contacts supplier_id suppliers contacts CASCADE

create_relation inquiry_items customer_id customers inquiry_items "SET NULL"
create_relation inquiry_items sales_owner_id directus_users sales_inquiries "SET NULL"
create_relation inquiry_items buyer_owner_id directus_users buyer_inquiries "SET NULL"

create_relation supplier_quotes inquiry_item_id inquiry_items supplier_quotes CASCADE
create_relation supplier_quotes supplier_id suppliers quotes "SET NULL"
create_relation supplier_quotes quoted_by directus_users supplier_quotes "SET NULL"

create_relation customer_quotes inquiry_item_id inquiry_items customer_quotes CASCADE
create_relation customer_quotes customer_id customers customer_quotes "SET NULL"
create_relation customer_quotes quoted_by directus_users customer_quotes "SET NULL"

create_relation conversations inquiry_item_id inquiry_items conversations CASCADE
create_relation conversations actor_id directus_users conversations "SET NULL"

create_relation attachments uploaded_by directus_users uploaded_attachments "SET NULL"

create_relation buyer_profiles buyer_id directus_users buyer_profile CASCADE
create_relation assignment_rules buyer_id directus_users assignment_rules CASCADE

create_relation assignment_accept_tokens inquiry_item_id inquiry_items accept_tokens CASCADE
create_relation assignment_accept_tokens buyer_id directus_users assignment_accept_tokens CASCADE

create_relation manager_approvals inquiry_item_id inquiry_items manager_approvals CASCADE
create_relation manager_approvals customer_quote_id customer_quotes approvals "SET NULL"
create_relation manager_approvals requested_by directus_users requested_approvals "SET NULL"
create_relation manager_approvals approved_by directus_users approved_approvals "SET NULL"

echo "关系创建完成。"
