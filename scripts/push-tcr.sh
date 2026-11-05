#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV_FILE="$PROJECT_ROOT/.env.tcr.local"
TCR_REGISTRY="${TCR_REGISTRY:-ccr.ccs.tencentyun.com}"
TCR_IMAGE="${TCR_IMAGE:-ccr.ccs.tencentyun.com/tangerine_specter/o-doc:latest}"
TCR_PLATFORM="${TCR_PLATFORM:-linux/amd64}"
TCR_EXTRA_TAGS="${TCR_EXTRA_TAGS:-}"
TCR_BUILD_VERSION="${TCR_BUILD_VERSION:-unknown}"
TCR_BUILD_COMMIT="${TCR_BUILD_COMMIT:-unknown}"

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
    if [ -n "${CI:-}" ]; then
        echo "TCR_USERNAME 未配置，请在 GitHub Secrets 中添加 TCR_USERNAME。"
        exit 1
    fi

    printf "请输入腾讯云 TCR 用户名: "
    read -r TCR_USERNAME
fi

if [ -z "${TCR_PASSWORD:-}" ]; then
    if [ -n "${CI:-}" ]; then
        echo "TCR_PASSWORD 未配置，请在 GitHub Secrets 中添加 TCR_PASSWORD。"
        exit 1
    fi

    TCR_PASSWORD="$(read_secret "请输入腾讯云 TCR 密码: ")"
fi

if [ -z "${TCR_USERNAME:-}" ] || [ -z "${TCR_PASSWORD:-}" ]; then
    echo "TCR_USERNAME 和 TCR_PASSWORD 不能为空。"
    exit 1
fi

if [ -z "${CI:-}" ] && [ ! -f "$LOCAL_ENV_FILE" ]; then
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

LOCAL_IMAGE="${TCR_LOCAL_IMAGE:-o-doc:local-ready}"
build_tags=(-t "$LOCAL_IMAGE" -t "$TCR_IMAGE")
if [ -n "$TCR_EXTRA_TAGS" ]; then
    IFS=',' read -r -a extra_tags <<<"$TCR_EXTRA_TAGS"
    for tag in "${extra_tags[@]}"; do
        if [ -n "$tag" ]; then
            build_tags+=(-t "$tag")
        fi
    done
fi

echo "构建本地镜像：$LOCAL_IMAGE ($TCR_PLATFORM)"
if [ -n "$TCR_EXTRA_TAGS" ]; then
    echo "附加镜像标签：$TCR_EXTRA_TAGS"
fi
docker buildx build \
    --platform "$TCR_PLATFORM" \
    --build-arg "ODOC_BUILD_VERSION=$TCR_BUILD_VERSION" \
    --build-arg "ODOC_BUILD_COMMIT=$TCR_BUILD_COMMIT" \
    "${build_tags[@]}" \
    --load "$PROJECT_ROOT"

docker image inspect "$LOCAL_IMAGE" >/dev/null
echo "本地镜像已就绪：${LOCAL_IMAGE}；可在同一 Docker daemon 上手动升级。"
if [ -n "${TCR_BUILD_WEBHOOK_URL:-}" ]; then
    if ! TCR_LOCAL_IMAGE="$LOCAL_IMAGE" python3 "$PROJECT_ROOT/scripts/notify-local-image.py"; then
        echo "本地镜像就绪通知失败；继续推送云端。" >&2
    fi
fi

echo "登录腾讯云 TCR：$TCR_REGISTRY"
printf "%s" "$TCR_PASSWORD" | docker login "$TCR_REGISTRY" --username "$TCR_USERNAME" --password-stdin
echo "推送镜像：$TCR_IMAGE"
docker push "$TCR_IMAGE"
if [ -n "$TCR_EXTRA_TAGS" ]; then
    for tag in "${extra_tags[@]}"; do
        if [ -n "$tag" ]; then
            docker push "$tag"
        fi
    done
fi

echo "腾讯云 TCR 镜像推送完成：$TCR_IMAGE"
