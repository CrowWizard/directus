#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8055}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
WECHAT_WORK_WEBHOOK_URL="${WECHAT_WORK_WEBHOOK_URL:-${WEWORK_WEBHOOK_URL:-}}"
PUBLIC_ADMIN_URL="${PUBLIC_ADMIN_URL:-${BASE_URL}/admin}"
APPROVAL_THRESHOLD="${APPROVAL_THRESHOLD:-10000}"

if ! command -v curl >/dev/null 2>&1; then
  echo "缺少 curl，请先安装 curl。"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "缺少 jq，请先安装 jq。"
  exit 1
fi

if [ -z "${WECHAT_WORK_WEBHOOK_URL}" ]; then
  echo "缺少 WECHAT_WORK_WEBHOOK_URL。"
  echo "示例：WECHAT_WORK_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx ./scripts/init-purchase-flow-flows.sh"
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

flow_exists() {
  local name="$1"
  local response
  response=$(api_get /flows "$(jq -cn --arg name "${name}" '{name:{_eq:$name}}')")
  ensure_no_errors "${response}" "查询 Flow ${name}"
  [ "$(jq '.data | length' <<<"${response}")" -gt 0 ]
}

create_flow() {
  local name="$1"
  local description="$2"
  local trigger="$3"
  local options="$4"

  if flow_exists "${name}"; then
    echo "Flow 已存在，跳过：${name}"
    return 0
  fi

  local body
  body=$(jq -cn \
    --arg name "${name}" \
    --arg description "${description}" \
    --arg trigger "${trigger}" \
    --argjson options "${options}" \
    '{name:$name,icon:"bolt",description:$description,status:"active",accountability:"activity",trigger:$trigger,options:$options}')

  local response
  response=$(api POST /flows "${body}")
  ensure_no_errors "${response}" "创建 Flow ${name}"
  jq -r '.data.id' <<<"${response}"
}

create_operation() {
  local flow_id="$1"
  local key="$2"
  local name="$3"
  local type="$4"
  local options="$5"
  local resolve="${6:-null}"

  local body
  body=$(jq -cn \
    --arg flow "${flow_id}" \
    --arg key "${key}" \
    --arg name "${name}" \
    --arg type "${type}" \
    --argjson options "${options}" \
    --argjson resolve "${resolve}" \
    '{flow:$flow,key:$key,name:$name,type:$type,options:$options,resolve:$resolve,position_x:1,position_y:1}')

  local response
  response=$(api POST /operations "${body}")
  ensure_no_errors "${response}" "创建 Operation ${name}"
  jq -r '.data.id' <<<"${response}"
}

patch_flow_operation() {
  local flow_id="$1"
  local operation_id="$2"
  ensure_no_errors "$(api PATCH "/flows/${flow_id}" "$(jq -cn --arg operation "${operation_id}" '{operation:$operation}')")" "设置 Flow 起点"
}

webhook_options() {
  local title="$1"
  local content="$2"
  jq -cn \
    --arg url "${WECHAT_WORK_WEBHOOK_URL}" \
    --arg title "${title}" \
    --arg content "${content}" \
    '{method:"POST",url:$url,headers:[{header:"Content-Type",value:"application/json"}],body:{msgtype:"markdown",markdown:{content:("**" + $title + "**\n" + $content)}}}'
}

create_webhook_flow() {
  local name="$1"
  local description="$2"
  local collection="$3"
  local scope="$4"
  local title="$5"
  local content="$6"

  local flow_id
  flow_id=$(create_flow "${name}" "${description}" event "$(jq -cn --arg collection "${collection}" --arg scope "${scope}" '{type:"action",scope:[$scope],collections:[$collection]}')")

  if [ -z "${flow_id}" ]; then
    return 0
  fi

  local operation_id
  operation_id=$(create_operation "${flow_id}" send_wechat 企业微信提醒 webhook "$(webhook_options "${title}" "${content}")")
  patch_flow_operation "${flow_id}" "${operation_id}"
  echo "已创建 Flow：${name}"
}

create_webhook_flow \
  "询价项创建后通知采购员" \
  "外贸员创建询价项后，系统按分配结果提醒采购员点击链接开始处理。" \
  inquiry_items \
  items.create \
  "新的采购询价待处理" \
  "询价编号：{{\$trigger.payload.inquiry_no}}\n产品：{{\$trigger.payload.product_name}}\n优先级：{{\$trigger.payload.priority}}\n请使用系统生成的接单链接开始处理；详情页：${PUBLIC_ADMIN_URL}/content/inquiry_items/{{\$trigger.key}}"

create_webhook_flow \
  "询价项更新后提醒对方" \
  "外贸员或采购员修改采购单、发起交互后通知对方继续处理。" \
  inquiry_items \
  items.update \
  "询价项状态已更新" \
  "询价编号：{{\$trigger.payload.inquiry_no}}\n当前状态：{{\$trigger.payload.state}}\n处理链接：${PUBLIC_ADMIN_URL}/content/inquiry_items/{{\$trigger.key}}"

create_webhook_flow \
  "供应商报价后通知外贸员" \
  "采购员填写采购价格、货期、询价价格、供应商后通知外贸员 review。" \
  supplier_quotes \
  items.create \
  "采购推荐已提交" \
  "采购价格：{{\$trigger.payload.price}} {{\$trigger.payload.currency}}\n货期：{{\$trigger.payload.lead_time}}\n询价项：${PUBLIC_ADMIN_URL}/content/inquiry_items/{{\$trigger.payload.inquiry_item_id}}"

create_webhook_flow \
  "客户报价后触发审批提醒" \
  "外贸员填写销售报价后，如果金额超过阈值，需要经理审批。" \
  customer_quotes \
  items.create \
  "客户报价已生成" \
  "销售价格：{{\$trigger.payload.price}} {{\$trigger.payload.currency}}\n经理审批阈值：${APPROVAL_THRESHOLD}\n报价链接：${PUBLIC_ADMIN_URL}/content/customer_quotes/{{\$trigger.key}}"

create_webhook_flow \
  "沟通会话创建后通知对方" \
  "外贸员与采购员围绕同一询价项反复交互时发送企业微信提醒。" \
  conversations \
  items.create \
  "新的沟通消息" \
  "内容：{{\$trigger.payload.content}}\n询价项：${PUBLIC_ADMIN_URL}/content/inquiry_items/{{\$trigger.payload.inquiry_item_id}}"

create_flow \
  "定时提醒未完成采购项" \
  "每 10 分钟扫描未完成询价项；未开始处理则提醒或人工触发重新分配。" \
  schedule \
  "$(jq -cn --arg cron '*/10 * * * *' '{cron:$cron}')" >/dev/null

create_flow \
  "定时检查供应商报价完整性" \
  "每 15 分钟扫描供应商报价，缺少采购价格、货期、询价价格或供应商时提醒采购员。" \
  schedule \
  "$(jq -cn --arg cron '*/15 * * * *' '{cron:$cron}')" >/dev/null

echo "流程创建完成。"
echo "注意：自动分配、超时重分配、模糊历史推荐需要在 Flow 脚本操作或自定义 Hook 中补充业务查询逻辑。当前脚本已建立触发点和企业微信提醒骨架。"
