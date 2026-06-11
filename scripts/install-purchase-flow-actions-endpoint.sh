#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXTENSIONS_PATH="${EXTENSIONS_PATH:-${REPO_ROOT}/extensions}"
SOURCE_DIR="${REPO_ROOT}/extensions/purchase-flow-actions"
TARGET_DIR="${EXTENSIONS_PATH}/purchase-flow-actions"

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
echo "访问路径：/purchase-flow-actions/communicate-and-transition"
echo "访问路径：/purchase-flow-actions/communicate"
echo "访问路径：/purchase-flow-actions/complete-supplier-quote"
echo "访问路径：/purchase-flow-actions/mark-viewed-as-accepted"
echo "访问路径：/purchase-flow-actions/update-inquiry"
echo "访问路径：/purchase-flow-actions/select-final-quote"
echo "访问路径：/purchase-flow-actions/approve-customer-quote"
echo "访问路径：/purchase-flow-actions/close-inquiry"
echo "重启 Directus 后生效。"
