#!/bin/bash

set -e

DEPLOY_DIR="${ODOC_DEPLOY_DIR:-$HOME/o-doc}"
COMPOSE_FILE="$DEPLOY_DIR/compose.prod.yml"
ENV_FILE="$DEPLOY_DIR/.env.deploy"
RUNTIME_DIR="$DEPLOY_DIR/runtime"

OFFICIAL_IMAGE="ghcr.io/tangerinespecter/o-doc:latest"
TCR_IMAGE="ccr.ccs.tencentyun.com/tangerine_specter/o-doc:latest"
DEFAULT_IMAGE="${ODOC_IMAGE_NAME:-$OFFICIAL_IMAGE}"
DEFAULT_CONTAINER_NAME="o-doc"
DEFAULT_HOST_PORT="11800"
DEFAULT_ADMIN_EMAIL="admin@example.com"
DEFAULT_ALLOWED_HOSTS="*"
DEFAULT_POSTGRES_CONTAINER_NAME="o-doc-postgres"
DEFAULT_POSTGRES_IMAGE="m.daocloud.io/docker.io/postgres:16-alpine"
DEFAULT_POSTGRES_DB="odoc"
DEFAULT_POSTGRES_USER="odoc"
DEFAULT_POSTGRES_BIND_ADDRESS="0.0.0.0"
DEFAULT_POSTGRES_HOST_PORT="15432"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
WHITE='\033[1;37m'
NC='\033[0m'

print_divider() {
    printf "${GREEN}========================================${NC}\n"
}

print_banner() {
    print_divider
    printf "${GREEN}   ____        ____   ____   ______    ${NC}\n"
    printf "${GREEN}  / __ \\\\      / __ \\\\ / __ \\\\ / ____/    ${NC}\n"
    printf "${GREEN} / / / /_____/ / / // / / // /         ${NC}\n"
    printf "${GREEN}/ /_/ /_____/ /_/ // /_/ // /___       ${NC}\n"
    printf "${GREEN}\\\\____/      \\\\____/ \\\\____/ \\\\____/       ${NC}\n"
    print_divider
    printf "${WHITE} 📚 A modern document platform powered by Django + React ${NC}\n"
    printf "${CYAN} 🌻 Architecture: %s${NC}\n" "$(uname -m)"
    printf "${CYAN} 🔥 Deploy Path : %s${NC}\n" "$DEPLOY_DIR"
    printf "${CYAN} 🐱 GitHub Repo : %s${NC}\n" "https://github.com/TangerineSpecter/O-Doc"
    printf "${CYAN} 🐳 Image Source: %s${NC}\n" "$DEFAULT_IMAGE"
    printf "${CYAN} 🤖 Author: : %s${NC}\n\n" "丢失的橘子"
}

step() {
    printf "${GREEN}[ %s ]${NC} ${WHITE}%s${NC}\n" "$1" "$2"
}

success() {
    printf "${GREEN}%s${NC}\n" "$1"
}

warn() {
    printf "${YELLOW}%s${NC}\n" "$1"
}

error() {
    printf "${RED}%s${NC}\n" "$1"
}

show_install_intro() {
    printf "${CYAN}正在准备安装流程...${NC}\n"
    printf "${CYAN}脚本会自动生成配置、拉取镜像并启动服务。${NC}\n\n"
}

show_update_intro() {
    printf "${CYAN}正在准备更新流程...${NC}\n"
    printf "${CYAN}脚本会自动刷新配置、拉取新镜像并重启服务。${NC}\n\n"
}

show_uninstall_intro() {
    printf "${CYAN}正在准备卸载流程...${NC}\n"
    printf "${CYAN}脚本会停止并删除容器，可选保留本地数据。${NC}\n\n"
}

ensure_prerequisites() {
    if ! command -v docker >/dev/null 2>&1; then
        error "未检测到 docker，请先安装 Docker。"
        exit 1
    fi

    if ! docker compose version >/dev/null 2>&1; then
        error "未检测到 docker compose，请先安装 Docker Compose。"
        exit 1
    fi
}

generate_secret() {
    tr -dc 'A-Za-z0-9' </dev/urandom | head -c 50
}

read_env_value() {
    local key="$1"
    if [ -f "$ENV_FILE" ]; then
        awk -F= -v target="$key" '$1 == target {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
    fi
}

write_env_value() {
    local key="$1"
    local value="$2"
    local tmp_file

    tmp_file="$(mktemp)"

    if [ -f "$ENV_FILE" ]; then
        awk -F= -v target="$key" -v replacement="$value" '
            BEGIN { updated = 0 }
            $1 == target {
                print target "=" replacement
                updated = 1
                next
            }
            { print }
            END {
                if (!updated) {
                    print target "=" replacement
                }
            }
        ' "$ENV_FILE" >"$tmp_file"
    else
        printf "%s=%s\n" "$key" "$value" >"$tmp_file"
    fi

    mv "$tmp_file" "$ENV_FILE"
}

detect_ip() {
    if command -v hostname >/dev/null 2>&1; then
        hostname -I 2>/dev/null | awk '{print $1}'
    fi
}

ensure_directories() {
    mkdir -p \
        "$DEPLOY_DIR" \
        "$RUNTIME_DIR/postgres" \
        "$RUNTIME_DIR/media" \
        "$RUNTIME_DIR/chroma_data"
}

write_compose_file() {
    cat >"$COMPOSE_FILE" <<EOF
services:
  db:
    image: \${POSTGRES_IMAGE:-$DEFAULT_POSTGRES_IMAGE}
    container_name: \${POSTGRES_CONTAINER_NAME:-$DEFAULT_POSTGRES_CONTAINER_NAME}
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-$DEFAULT_POSTGRES_DB}
      POSTGRES_USER: \${POSTGRES_USER:-$DEFAULT_POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    ports:
      - "\${POSTGRES_BIND_ADDRESS:-$DEFAULT_POSTGRES_BIND_ADDRESS}:\${POSTGRES_HOST_PORT:-$DEFAULT_POSTGRES_HOST_PORT}:5432"
    volumes:
      - ./runtime/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \$\${POSTGRES_USER} -d \$\${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 20

  app:
    image: \${IMAGE_NAME:-$DEFAULT_IMAGE}
    container_name: \${CONTAINER_NAME:-$DEFAULT_CONTAINER_NAME}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "\${HOST_PORT:-$DEFAULT_HOST_PORT}:11800"
    environment:
      PORT: 11800
      ADMIN_EMAIL: \${ADMIN_EMAIL:-$DEFAULT_ADMIN_EMAIL}
      DJANGO_DEBUG: \${DJANGO_DEBUG:-false}
      DJANGO_SECRET_KEY: \${DJANGO_SECRET_KEY}
      DJANGO_ALLOWED_HOSTS: "\${DJANGO_ALLOWED_HOSTS:-$DEFAULT_ALLOWED_HOSTS}"
      DJANGO_DB_ENGINE: postgresql
      POSTGRES_DB: \${POSTGRES_DB:-$DEFAULT_POSTGRES_DB}
      POSTGRES_USER: \${POSTGRES_USER:-$DEFAULT_POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_HOST: db
      POSTGRES_PORT: 5432
      DJANGO_MEDIA_ROOT: /app/runtime/media
      DJANGO_STATIC_ROOT: /app/staticfiles
      ODOC_CHROMA_PATH: /app/runtime/chroma_data
    volumes:
      - ./runtime/media:/app/runtime/media
      - ./runtime/chroma_data:/app/runtime/chroma_data
EOF
}

create_env_file() {
    local secret_input
    local secret_value

    if [ -f "$ENV_FILE" ]; then
        return
    fi

    printf "请输入 DJANGO_SECRET_KEY（直接回车将自动生成）: "
    read -r secret_input

    if [ -n "$secret_input" ]; then
        secret_value="$secret_input"
    else
        secret_value="$(generate_secret)"
    fi

    cat >"$ENV_FILE" <<EOF
IMAGE_NAME=$DEFAULT_IMAGE
CONTAINER_NAME=$DEFAULT_CONTAINER_NAME
HOST_PORT=$DEFAULT_HOST_PORT
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=$secret_value
DJANGO_ALLOWED_HOSTS=$DEFAULT_ALLOWED_HOSTS
ADMIN_EMAIL=$DEFAULT_ADMIN_EMAIL
POSTGRES_CONTAINER_NAME=$DEFAULT_POSTGRES_CONTAINER_NAME
POSTGRES_IMAGE=$DEFAULT_POSTGRES_IMAGE
POSTGRES_DB=$DEFAULT_POSTGRES_DB
POSTGRES_USER=$DEFAULT_POSTGRES_USER
POSTGRES_PASSWORD=$(generate_secret)
POSTGRES_BIND_ADDRESS=$DEFAULT_POSTGRES_BIND_ADDRESS
POSTGRES_HOST_PORT=$DEFAULT_POSTGRES_HOST_PORT
EOF
}

ensure_env_defaults() {
    local existing_secret
    local secret_input
    local secret_value

    [ -f "$ENV_FILE" ] || return

    local current_image

    current_image="$(read_env_value IMAGE_NAME)"
    if [ -z "$current_image" ]; then
        write_env_value IMAGE_NAME "$DEFAULT_IMAGE"
    fi
    [ -n "$(read_env_value CONTAINER_NAME)" ] || write_env_value CONTAINER_NAME "$DEFAULT_CONTAINER_NAME"
    [ -n "$(read_env_value HOST_PORT)" ] || write_env_value HOST_PORT "$DEFAULT_HOST_PORT"
    [ -n "$(read_env_value DJANGO_DEBUG)" ] || write_env_value DJANGO_DEBUG "false"
    [ -n "$(read_env_value DJANGO_ALLOWED_HOSTS)" ] || write_env_value DJANGO_ALLOWED_HOSTS "$DEFAULT_ALLOWED_HOSTS"
    [ -n "$(read_env_value ADMIN_EMAIL)" ] || write_env_value ADMIN_EMAIL "$DEFAULT_ADMIN_EMAIL"
    [ -n "$(read_env_value POSTGRES_CONTAINER_NAME)" ] || write_env_value POSTGRES_CONTAINER_NAME "$DEFAULT_POSTGRES_CONTAINER_NAME"
    [ -n "$(read_env_value POSTGRES_IMAGE)" ] || write_env_value POSTGRES_IMAGE "$DEFAULT_POSTGRES_IMAGE"
    [ -n "$(read_env_value POSTGRES_DB)" ] || write_env_value POSTGRES_DB "$DEFAULT_POSTGRES_DB"
    [ -n "$(read_env_value POSTGRES_USER)" ] || write_env_value POSTGRES_USER "$DEFAULT_POSTGRES_USER"
    [ -n "$(read_env_value POSTGRES_PASSWORD)" ] || write_env_value POSTGRES_PASSWORD "$(generate_secret)"
    [ -n "$(read_env_value POSTGRES_BIND_ADDRESS)" ] || write_env_value POSTGRES_BIND_ADDRESS "$DEFAULT_POSTGRES_BIND_ADDRESS"
    [ -n "$(read_env_value POSTGRES_HOST_PORT)" ] || write_env_value POSTGRES_HOST_PORT "$DEFAULT_POSTGRES_HOST_PORT"

    existing_secret="$(read_env_value DJANGO_SECRET_KEY)"
    if [ -z "$existing_secret" ]; then
        printf "请输入 DJANGO_SECRET_KEY（直接回车将自动生成）: "
        read -r secret_input

        if [ -n "$secret_input" ]; then
            secret_value="$secret_input"
        else
            secret_value="$(generate_secret)"
        fi

        write_env_value DJANGO_SECRET_KEY "$secret_value"
    fi
}

compose_cmd() {
    (
        cd "$DEPLOY_DIR"
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
    )
}

print_summary() {
    local server_ip
    local container_name
    local django_secret_key
    local host_port
    local postgres_db
    local postgres_user
    local postgres_bind_address
    local postgres_host_port

    server_ip="$(detect_ip)"
    container_name="$(read_env_value CONTAINER_NAME)"
    django_secret_key="$(read_env_value DJANGO_SECRET_KEY)"
    host_port="$(read_env_value HOST_PORT)"
    postgres_db="$(read_env_value POSTGRES_DB)"
    postgres_user="$(read_env_value POSTGRES_USER)"
    postgres_bind_address="$(read_env_value POSTGRES_BIND_ADDRESS)"
    postgres_host_port="$(read_env_value POSTGRES_HOST_PORT)"

    [ -n "$container_name" ] || container_name="$DEFAULT_CONTAINER_NAME"
    [ -n "$host_port" ] || host_port="$DEFAULT_HOST_PORT"
    [ -n "$postgres_db" ] || postgres_db="$DEFAULT_POSTGRES_DB"
    [ -n "$postgres_user" ] || postgres_user="$DEFAULT_POSTGRES_USER"
    [ -n "$postgres_bind_address" ] || postgres_bind_address="$DEFAULT_POSTGRES_BIND_ADDRESS"
    [ -n "$postgres_host_port" ] || postgres_host_port="$DEFAULT_POSTGRES_HOST_PORT"

    printf "\n"
    print_divider
    success "O-Doc 已启动。"
    printf "${WHITE}服务名:${NC} %s\n" "$container_name"
    printf "${WHITE}DJANGO_SECRET_KEY:${NC} %s\n" "$django_secret_key"
    printf "${WHITE}本机访问地址:${NC} http://localhost:%s\n" "$host_port"
    printf "${WHITE}PostgreSQL:${NC} %s@%s:%s/%s\n" "$postgres_user" "$postgres_bind_address" "$postgres_host_port" "$postgres_db"

    if [ -n "$server_ip" ]; then
        printf "${WHITE}局域网访问地址:${NC} http://%s:%s\n" "$server_ip" "$host_port"
    fi

    printf "${WHITE}部署目录:${NC} %s\n" "$DEPLOY_DIR"
    print_divider
}

install_app() {
    ensure_prerequisites
    show_install_intro

    step "1/4" "准备部署目录"
    ensure_directories

    step "2/4" "生成部署配置"
    write_compose_file
    create_env_file
    ensure_env_defaults

    step "3/4" "拉取最新镜像"
    compose_cmd pull

    step "4/4" "启动 O-Doc"
    compose_cmd up -d

    print_summary
}

update_app() {
    ensure_prerequisites
    show_update_intro

    if [ ! -f "$COMPOSE_FILE" ] || [ ! -f "$ENV_FILE" ]; then
        warn "未检测到已安装的 O-Doc，将转为执行安装流程。"
        install_app
        return
    fi

    step "1/3" "刷新部署配置"
    write_compose_file
    ensure_env_defaults

    step "2/3" "拉取最新镜像"
    compose_cmd pull

    step "3/3" "更新并重启服务"
    compose_cmd up -d

    print_summary
}

uninstall_app() {
    ensure_prerequisites
    show_uninstall_intro

    if [ ! -f "$COMPOSE_FILE" ] || [ ! -f "$ENV_FILE" ]; then
        warn "未检测到已安装的 O-Doc。"
        exit 0
    fi

    warn "即将卸载 O-Doc。"
    warn "这会停止并删除容器，默认保留数据库和上传数据。"
    printf "确认卸载吗？[y/N]: "
    read -r confirm

    case "$confirm" in
        y|Y)
            compose_cmd down --remove-orphans
            success "O-Doc 容器已删除。"

            printf "是否同时删除本地数据目录 %s ？[y/N]: " "$RUNTIME_DIR"
            read -r remove_data
            case "$remove_data" in
                y|Y)
                    rm -rf "$RUNTIME_DIR"
                    success "本地数据目录已删除。"
                    ;;
                *)
                    warn "已保留本地数据目录。"
                    ;;
            esac
            ;;
        *)
            warn "已取消卸载。"
            ;;
    esac
}

show_status() {
    ensure_prerequisites

    if [ ! -f "$COMPOSE_FILE" ] || [ ! -f "$ENV_FILE" ]; then
        warn "未检测到已安装的 O-Doc。"
        exit 0
    fi

    compose_cmd ps
}

switch_image_source() {
    local source="${1:-}"
    local image=""

    ensure_directories
    write_compose_file
    [ -f "$ENV_FILE" ] || create_env_file
    ensure_env_defaults

    if [ -z "$source" ]; then
        cat <<EOF
请选择镜像源：
1. GitHub Container Registry（默认）
2. 腾讯云 TCR
3. 自定义镜像地址
EOF
        printf "请输入选项编号: "
        read -r source
    fi

    case "$source" in
        1|github|ghcr)
            image="$OFFICIAL_IMAGE"
            ;;
        2|tcr|tencent)
            image="$TCR_IMAGE"
            ;;
        3|custom)
            printf "请输入完整镜像地址: "
            read -r image
            ;;
        *)
            if printf "%s" "$source" | grep -q '/'; then
                image="$source"
            else
                error "无效镜像源选项。"
                exit 1
            fi
            ;;
    esac

    if [ -z "$image" ]; then
        error "镜像地址不能为空。"
        exit 1
    fi

    write_env_value IMAGE_NAME "$image"
    success "镜像源已切换为：$image"
}

show_menu() {
    print_banner
    cat <<'EOF'
请选择操作：
1. 安装
2. 更新
3. 卸载
4. 查看状态
5. 切换镜像源
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
                install_app
                ;;
            2)
                update_app
                ;;
            3)
                uninstall_app
                ;;
            4)
                show_status
                ;;
            5)
                switch_image_source
                ;;
            0)
                exit 0
                ;;
            *)
                error "无效选项，请重新输入。"
                ;;
        esac
        printf "\n"
    done
}

case "${1:-menu}" in
    install)
        install_app
        ;;
    update)
        update_app
        ;;
    uninstall)
        uninstall_app
        ;;
    status)
        show_status
        ;;
    source)
        switch_image_source "${2:-}"
        ;;
    menu)
        run_menu
        ;;
    *)
        echo "用法: $0 [install|update|uninstall|status|source]"
        exit 1
        ;;
esac
