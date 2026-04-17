#!/bin/bash

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE="$PROJECT_ROOT/compose.prod.yml"
ENV_EXAMPLE_FILE="$PROJECT_ROOT/.env.deploy.example"
ENV_FILE="$PROJECT_ROOT/.env.deploy"
RUNTIME_ROOT="$PROJECT_ROOT/deploy/runtime"

ensure_prerequisites() {
    if ! command -v docker >/dev/null 2>&1; then
        echo "未检测到 docker，请先安装 Docker。"
        exit 1
    fi

    if ! docker compose version >/dev/null 2>&1; then
        echo "未检测到 docker compose，请先安装 Docker Compose。"
        exit 1
    fi
}

ensure_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
        echo "已生成 $ENV_FILE，请先按文档修改里面的配置后再重新执行。"
        exit 0
    fi
}

ensure_runtime_dirs() {
    mkdir -p \
        "$RUNTIME_ROOT/db" \
        "$RUNTIME_ROOT/media" \
        "$RUNTIME_ROOT/chroma_data"
}

compose_cmd() {
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

install_or_update() {
    ensure_prerequisites
    ensure_env_file
    ensure_runtime_dirs

    echo "开始拉取最新镜像..."
    compose_cmd pull

    echo "开始启动或更新服务..."
    compose_cmd up -d

    echo "当前服务状态："
    compose_cmd ps
}

show_logs() {
    ensure_prerequisites
    ensure_env_file
    compose_cmd logs -f app
}

show_status() {
    ensure_prerequisites
    ensure_env_file
    compose_cmd ps
}

stop_service() {
    ensure_prerequisites
    ensure_env_file
    compose_cmd down
}

show_menu() {
    cat <<'EOF'
请选择操作：
1. 安装 / 首次部署
2. 更新到最新镜像
3. 查看运行状态
4. 查看日志
5. 停止服务
0. 退出
EOF
}

run_menu() {
    while true; do
        show_menu
        printf "请输入选项编号: "
        read -r choice

        case "$choice" in
            1)
                install_or_update
                ;;
            2)
                install_or_update
                ;;
            3)
                show_status
                ;;
            4)
                show_logs
                ;;
            5)
                stop_service
                ;;
            0)
                exit 0
                ;;
            *)
                echo "无效选项，请重新输入。"
                ;;
        esac
    done
}

case "${1:-menu}" in
    install)
        install_or_update
        ;;
    update)
        install_or_update
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    down)
        stop_service
        ;;
    menu)
        run_menu
        ;;
    *)
        echo "用法: $0 [install|update|status|logs|down]"
        exit 1
        ;;
esac

