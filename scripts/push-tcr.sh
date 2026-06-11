#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV_FILE="$PROJECT_ROOT/.env.tcr.local"
TCR_REGISTRY="${TCR_REGISTRY:-ccr.ccs.tencentyun.com}"
TCR_IMAGE="${TCR_IMAGE:-ccr.ccs.tencentyun.com/tangerine_specter/o-doc:latest}"
TCR_PLATFORM="${TCR_PLATFORM:-linux/amd64}"

if [ -f "$LOCAL_ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$LOCAL_ENV_FILE"
    set +a
fi

read_secret() {
    local prompt="$1"
    local value
    read -r -s -p "$prompt" value
    printf "\n"
    printf "%s" "$value"
}

if [ -z "${TCR_USERNAME:-}" ]; then
    printf "请输入腾讯云 TCR 用户名: "
    read -r TCR_USERNAME
fi

if [ -z "${TCR_PASSWORD:-}" ]; then
    TCR_PASSWORD="$(read_secret "请输入腾讯云 TCR 密码: ")"
fi

if [ -z "${TCR_USERNAME:-}" ] || [ -z "${TCR_PASSWORD:-}" ]; then
    echo "TCR_USERNAME 和 TCR_PASSWORD 不能为空。"
    exit 1
fi

if [ ! -f "$LOCAL_ENV_FILE" ]; then
    printf "是否将 TCR 配置保存到本机 %s ？[y/N]: " "$LOCAL_ENV_FILE"
    read -r save_local
    case "$save_local" in
        y|Y)
            umask 077
            cat >"$LOCAL_ENV_FILE" <<EOF
TCR_REGISTRY=$TCR_REGISTRY
TCR_IMAGE=$TCR_IMAGE
TCR_PLATFORM=$TCR_PLATFORM
TCR_USERNAME=$TCR_USERNAME
TCR_PASSWORD=$TCR_PASSWORD
EOF
            echo "已保存本机 TCR 配置。"
            ;;
    esac
fi

echo "登录腾讯云 TCR：$TCR_REGISTRY"
printf "%s" "$TCR_PASSWORD" | docker login "$TCR_REGISTRY" --username "$TCR_USERNAME" --password-stdin

echo "构建并推送镜像：$TCR_IMAGE ($TCR_PLATFORM)"
docker buildx build --platform "$TCR_PLATFORM" -t "$TCR_IMAGE" --push "$PROJECT_ROOT"

echo "腾讯云 TCR 镜像推送完成：$TCR_IMAGE"
