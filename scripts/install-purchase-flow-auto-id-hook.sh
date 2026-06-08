#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXTENSIONS_PATH="${EXTENSIONS_PATH:-${REPO_ROOT}/extensions}"
SOURCE_DIR="${REPO_ROOT}/extensions/purchase-flow-auto-id"
TARGET_DIR="${EXTENSIONS_PATH}/purchase-flow-auto-id"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-http://localhost:8055}"
ACCEPT_TOKEN_TTL_HOURS="${ACCEPT_TOKEN_TTL_HOURS:-24}"

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

echo "已安装 Hook：${TARGET_DIR}"
echo "来源目录：${SOURCE_DIR}"
echo "重启 Directus 后生效。"
echo "请确保 Directus 环境变量 PUBLIC_APP_URL=${PUBLIC_APP_URL} 和 ACCEPT_TOKEN_TTL_HOURS=${ACCEPT_TOKEN_TTL_HOURS} 可被服务进程读取。"
