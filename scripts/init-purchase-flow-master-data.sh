#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8055}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"

BUYER1_EMAIL="${BUYER1_EMAIL:-buyer1@example.com}"
BUYER2_EMAIL="${BUYER2_EMAIL:-buyer2@example.com}"

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

get_user_id_by_email() {
  local email="$1"
  local response
  response=$(api_get /users "$(jq -cn --arg email "${email}" '{email:{_eq:$email}}')")
  ensure_no_errors "${response}" "查询用户 ${email}"
  jq -r '.data[0].id // empty' <<<"${response}"
}

get_item_id() {
  local collection="$1"
  local field="$2"
  local value="$3"
  local response
  response=$(api_get "/items/${collection}" "$(jq -cn --arg field "${field}" --arg value "${value}" '{($field):{_eq:$value}}')")
  ensure_no_errors "${response}" "查询 ${collection}.${field}=${value}"
  jq -r '.data[0].id // empty' <<<"${response}"
}

create_or_update_item() {
  local collection="$1"
  local lookup_field="$2"
  local lookup_value="$3"
  local payload="$4"
  local label="$5"
  local item_id
  local response

  item_id=$(get_item_id "${collection}" "${lookup_field}" "${lookup_value}")

  if [ -n "${item_id}" ]; then
    response=$(api PATCH "/items/${collection}/${item_id}" "${payload}")
    ensure_no_errors "${response}" "更新 ${label}"
    echo "已更新：${label} (${item_id})" >&2
    printf '%s' "${item_id}"
    return 0
  fi

  response=$(api POST "/items/${collection}" "${payload}")
  ensure_no_errors "${response}" "创建 ${label}"
  item_id=$(jq -r '.data.id' <<<"${response}")
  echo "已创建：${label} (${item_id})" >&2
  printf '%s' "${item_id}"
}

create_customer() {
  local code="$1"
  local name="$2"
  local country="$3"
  local address="$4"
  local website="$5"
  local payload

  payload=$(jq -cn \
    --arg customer_code "${code}" \
    --arg customer_name "${name}" \
    --arg country "${country}" \
    --arg address "${address}" \
    --arg website "${website}" \
    '{customer_code:$customer_code,customer_name:$customer_name,country:$country,address:$address,website:$website,status:"Active",remark:"初始化测试客户"}')

  create_or_update_item customers customer_code "${code}" "${payload}" "客户 ${code}"
}

create_customer_contact() {
  local customer_id="$1"
  local name="$2"
  local position="$3"
  local phone="$4"
  local email="$5"
  local wechat="$6"
  local payload

  payload=$(jq -cn \
    --arg customer_id "${customer_id}" \
    --arg name "${name}" \
    --arg position "${position}" \
    --arg phone "${phone}" \
    --arg email "${email}" \
    --arg wechat "${wechat}" \
    '{customer_id:$customer_id,name:$name,position:$position,phone:$phone,email:$email,wechat:$wechat,remark:"初始化测试联系人"}')

  create_or_update_item customer_contacts email "${email}" "${payload}" "客户联系人 ${email}" >/dev/null
}

create_supplier() {
  local code="$1"
  local name="$2"
  local supplier_type="$3"
  local buyer_id="$4"
  local country="$5"
  local tax_rate="$6"
  local payment_term="$7"
  local website="$8"
  local payload

  payload=$(jq -cn \
    --arg supplier_code "${code}" \
    --arg supplier_name "${name}" \
    --arg supplier_type "${supplier_type}" \
    --arg buyer_id "${buyer_id}" \
    --arg country "${country}" \
    --argjson tax_rate "${tax_rate}" \
    --arg payment_term "${payment_term}" \
    --arg website "${website}" \
    '{supplier_code:$supplier_code,supplier_name:$supplier_name,supplier_type:$supplier_type,country:$country,tax_rate:$tax_rate,payment_term:$payment_term,website:$website,status:"Active",remark:"初始化测试供应商"} + if $buyer_id == "" then {} else {buyer_id:$buyer_id} end')

  create_or_update_item suppliers supplier_code "${code}" "${payload}" "供应商 ${code}"
}

create_supplier_contact() {
  local supplier_id="$1"
  local name="$2"
  local position="$3"
  local phone="$4"
  local email="$5"
  local wechat="$6"
  local payload

  payload=$(jq -cn \
    --arg supplier_id "${supplier_id}" \
    --arg name "${name}" \
    --arg position "${position}" \
    --arg phone "${phone}" \
    --arg email "${email}" \
    --arg wechat "${wechat}" \
    '{supplier_id:$supplier_id,name:$name,position:$position,phone:$phone,email:$email,wechat:$wechat,remark:"初始化测试联系人"}')

  create_or_update_item supplier_contacts email "${email}" "${payload}" "供应商联系人 ${email}" >/dev/null
}

echo "开始初始化客户和供应商主数据..."

BUYER1_ID=$(get_user_id_by_email "${BUYER1_EMAIL}")
BUYER2_ID=$(get_user_id_by_email "${BUYER2_EMAIL}")

if [ -z "${BUYER1_ID}" ] || [ -z "${BUYER2_ID}" ]; then
  echo "未找到采购员用户。请先执行 scripts/init-purchase-flow-users.sh，或传入 BUYER1_EMAIL / BUYER2_EMAIL。"
  exit 1
fi

CUSTOMER1_ID=$(create_customer CUST-001 "Acme Industrial Ltd" China Shanghai "https://customer-a.example.com")
CUSTOMER2_ID=$(create_customer CUST-002 "Global Trading GmbH" Germany Berlin "https://customer-b.example.com")

create_customer_contact "${CUSTOMER1_ID}" "Alice Chen" "Purchasing Manager" "+86-21-10000001" "alice.chen@customer-a.example.com" "alice_customer_a"
create_customer_contact "${CUSTOMER2_ID}" "Mark Weber" "Project Manager" "+49-30-10000002" "mark.weber@customer-b.example.com" "mark_customer_b"

SUPPLIER1_ID=$(create_supplier SUP-001 "Shenzhen Electronics Supply Co" electronics "${BUYER1_ID}" China 13 "Net 30" "https://supplier-1.example.com")
SUPPLIER2_ID=$(create_supplier SUP-002 "Shanghai Connector Factory" connector "${BUYER1_ID}" China 13 "Prepaid 30%, balance before shipment" "https://supplier-2.example.com")
SUPPLIER3_ID=$(create_supplier SUP-003 "Suzhou Mechanical Parts Co" mechanical "${BUYER2_ID}" China 13 "Net 45" "https://supplier-3.example.com")

create_supplier_contact "${SUPPLIER1_ID}" "Leo Wang" "Sales" "+86-755-10000001" "leo.wang@supplier-1.example.com" "leo_supplier_1"
create_supplier_contact "${SUPPLIER2_ID}" "Nina Li" "Account Manager" "+86-21-10000002" "nina.li@supplier-2.example.com" "nina_supplier_2"
create_supplier_contact "${SUPPLIER3_ID}" "Kevin Zhou" "Sales Manager" "+86-512-10000003" "kevin.zhou@supplier-3.example.com" "kevin_supplier_3"

echo "客户和供应商主数据初始化完成。"
echo "客户1：${CUSTOMER1_ID}"
echo "客户2：${CUSTOMER2_ID}"
echo "供应商1：${SUPPLIER1_ID}"
echo "供应商2：${SUPPLIER2_ID}"
echo "供应商3：${SUPPLIER3_ID}"
