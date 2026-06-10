#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXTENSIONS_PATH="${EXTENSIONS_PATH:-${REPO_ROOT}/extensions}"
SOURCE_DIR="${REPO_ROOT}/extensions/purchase-flow-scanner"
TARGET_DIR="${EXTENSIONS_PATH}/purchase-flow-scanner"

if [ ! -f "${SOURCE_DIR}/package.json" ] || [ ! -f "${SOURCE_DIR}/dist/index.js" ]; then
  echo "扩展源码不存在：${SOURCE_DIR}"
  exit 1
fi

mkdir -p "${TARGET_DIR}"

if [ "$(cd "${SOURCE_DIR}" && pwd)" != "$(cd "${TARGET_DIR}" && pwd)" ]; then
  rm -rf "${TARGET_DIR}/dist"
  cp "${SOURCE_DIR}/package.json" "${TARGET_DIR}/package.json"
  cp -R "${SOURCE_DIR}/dist" "${TARGET_DIR}/dist"
fi

echo "已安装 Endpoint：${TARGET_DIR}"
echo "来源目录：${SOURCE_DIR}"
echo "访问路径：/purchase-flow-scanner/run"
echo "访问路径：/purchase-flow-scanner/scan-assignment-timeouts"
echo "访问路径：/purchase-flow-scanner/scan-supplier-quote-reminders"
echo "重启 Directus 后生效。"
echo "如需无登录定时触发，请配置 PURCHASE_FLOW_SCANNER_SECRET 并通过 x-purchase-flow-scanner-secret Header 调用。"
