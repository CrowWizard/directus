#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/init-purchase-flow-collections.sh"
"${SCRIPT_DIR}/init-purchase-flow-relations.sh"
"${SCRIPT_DIR}/init-purchase-flow-permissions.sh"
"${SCRIPT_DIR}/init-purchase-flow-assignment-rules.sh"
"${SCRIPT_DIR}/install-purchase-flow-auto-id-hook.sh"
"${SCRIPT_DIR}/install-purchase-flow-accept-endpoint.sh"

if [ -n "${WECHAT_WORK_WEBHOOK_URL:-${WEWORK_WEBHOOK_URL:-}}" ]; then
  "${SCRIPT_DIR}/init-purchase-flow-flows.sh"
else
  echo "未配置 WECHAT_WORK_WEBHOOK_URL，已跳过企业微信 Flow 初始化。"
fi

echo "外贸询价采购报价系统配置初始化完成。"
