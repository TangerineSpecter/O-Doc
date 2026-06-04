#!/bin/bash

set -e

cd "$(dirname "$0")"

echo "🍊 正在启动 O-Doc 开发环境..."

DEV_ENV_FILE="${ODOC_DEV_ENV_FILE:-deploy/.env}"
LEGACY_DEV_ENV_FILE="deploy/.env.deploy"
USE_POSTGRES="${ODOC_DEV_USE_POSTGRES:-true}"
COMPOSE_PROJECT_NAME="${ODOC_COMPOSE_PROJECT:-deploy}"
PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"

generate_secret() {
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 50
}

read_env_value() {
    local key="$1"
    if [ -f "$DEV_ENV_FILE" ]; then
        awk -F= -v target="$key" '$1 == target {sub(/^[^=]*=/, ""); print; exit}' "$DEV_ENV_FILE"
    fi
}

write_env_value() {
    local key="$1"
    local value="$2"

    mkdir -p "$(dirname "$DEV_ENV_FILE")"

    if [ ! -f "$DEV_ENV_FILE" ]; then
        touch "$DEV_ENV_FILE"
    fi

    if grep -q "^${key}=" "$DEV_ENV_FILE"; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$DEV_ENV_FILE"
        rm -f "${DEV_ENV_FILE}.bak"
    else
        printf "%s=%s\n" "$key" "$value" >>"$DEV_ENV_FILE"
    fi
}

ensure_env_file_location() {
    if [ -f "$DEV_ENV_FILE" ]; then
        return
    fi

    if [ -f "$LEGACY_DEV_ENV_FILE" ] && [ "$DEV_ENV_FILE" != "$LEGACY_DEV_ENV_FILE" ]; then
        mv "$LEGACY_DEV_ENV_FILE" "$DEV_ENV_FILE"
        echo "⚠️  已将旧配置文件迁移为 $DEV_ENV_FILE"
    fi
}

ensure_env_defaults() {
    [ -n "$(read_env_value IMAGE_NAME)" ] || write_env_value IMAGE_NAME "ghcr.io/tangerinespecter/o-doc:latest"
    [ -n "$(read_env_value CONTAINER_NAME)" ] || write_env_value CONTAINER_NAME "o-doc"
    [ -n "$(read_env_value HOST_PORT)" ] || write_env_value HOST_PORT "11800"
    [ -n "$(read_env_value DJANGO_DEBUG)" ] || write_env_value DJANGO_DEBUG "true"
    [ -n "$(read_env_value DJANGO_SECRET_KEY)" ] || write_env_value DJANGO_SECRET_KEY "$(generate_secret)"
    [ -n "$(read_env_value DJANGO_ALLOWED_HOSTS)" ] || write_env_value DJANGO_ALLOWED_HOSTS "127.0.0.1,localhost,*"
    [ -n "$(read_env_value ADMIN_EMAIL)" ] || write_env_value ADMIN_EMAIL "admin@example.com"
    [ -n "$(read_env_value POSTGRES_CONTAINER_NAME)" ] || write_env_value POSTGRES_CONTAINER_NAME "o-doc-postgres"
    [ -n "$(read_env_value POSTGRES_IMAGE)" ] || write_env_value POSTGRES_IMAGE "m.daocloud.io/docker.io/postgres:16-alpine"
    [ -n "$(read_env_value POSTGRES_DB)" ] || write_env_value POSTGRES_DB "odoc"
    [ -n "$(read_env_value POSTGRES_USER)" ] || write_env_value POSTGRES_USER "odoc"
    [ -n "$(read_env_value POSTGRES_PASSWORD)" ] || write_env_value POSTGRES_PASSWORD "$(generate_secret)"
    [ -n "$(read_env_value POSTGRES_BIND_ADDRESS)" ] || write_env_value POSTGRES_BIND_ADDRESS "0.0.0.0"
    if [ -z "$(read_env_value POSTGRES_HOST_PORT)" ] || [ "$(read_env_value POSTGRES_HOST_PORT)" = "5432" ]; then
        write_env_value POSTGRES_HOST_PORT "15432"
    fi
}

export_postgres_env() {
    export DJANGO_DB_ENGINE=postgresql
    export POSTGRES_DB="$(read_env_value POSTGRES_DB)"
    export POSTGRES_USER="$(read_env_value POSTGRES_USER)"
    export POSTGRES_PASSWORD="$(read_env_value POSTGRES_PASSWORD)"
    export POSTGRES_HOST="${ODOC_DEV_POSTGRES_HOST:-127.0.0.1}"
    export POSTGRES_PORT="$(read_env_value POSTGRES_HOST_PORT)"
    export DJANGO_DEBUG=true
    export DJANGO_SECRET_KEY="$(read_env_value DJANGO_SECRET_KEY)"
    export DJANGO_ALLOWED_HOSTS="$(read_env_value DJANGO_ALLOWED_HOSTS)"
    export ADMIN_EMAIL="$(read_env_value ADMIN_EMAIL)"
}

wait_postgres_ready() {
    python <<'PY'
import os
import sys
import time

import psycopg

deadline = time.time() + int(os.getenv("POSTGRES_WAIT_TIMEOUT", "60"))
last_error = None

while time.time() < deadline:
    try:
        conn = psycopg.connect(
            host=os.getenv("POSTGRES_HOST", "127.0.0.1"),
            port=os.getenv("POSTGRES_PORT", "5432"),
            dbname=os.getenv("POSTGRES_DB", "odoc"),
            user=os.getenv("POSTGRES_USER", "odoc"),
            password=os.getenv("POSTGRES_PASSWORD", ""),
            connect_timeout=3,
        )
        conn.close()
        sys.exit(0)
    except Exception as exc:
        last_error = exc
        time.sleep(2)

print(f"PostgreSQL 未能在超时时间内就绪: {last_error}", file=sys.stderr)
sys.exit(1)
PY
}

is_tcp_port_open() {
    local host="$1"
    local port="$2"
    python - "$host" "$port" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.settimeout(1)
    sys.exit(0 if sock.connect_ex((host, port)) == 0 else 1)
PY
}

# 检查依赖
if ! command -v python &> /dev/null; then
    echo "❌ Python 未安装"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi

# 安装后端依赖
if ! python -c "import django, psycopg" &> /dev/null; then
    echo "📦 正在安装后端依赖..."
    python -m pip install -i "$PIP_INDEX_URL" -r requirements.txt
fi

# 安装前端依赖
if [ ! -d "frontend_react/node_modules" ]; then
    echo "📦 正在安装前端依赖..."
    cd frontend_react && npm install && cd ..
fi

if [ "$USE_POSTGRES" != "false" ] && [ "$USE_POSTGRES" != "0" ]; then
    if ! docker compose version >/dev/null 2>&1; then
        echo "❌ 开发环境默认使用 PostgreSQL，需要 Docker Compose。"
        echo "   如果只想临时使用 SQLite，可执行: ODOC_DEV_USE_POSTGRES=false ./dev.sh"
        exit 1
    fi

    ensure_env_file_location
    ensure_env_defaults
    export_postgres_env

    echo "🐘 启动/复用 PostgreSQL (${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB})..."
    if is_tcp_port_open "$POSTGRES_HOST" "$POSTGRES_PORT"; then
        echo "   检测到 ${POSTGRES_HOST}:${POSTGRES_PORT} 已有数据库服务，直接复用。"
    else
        docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$DEV_ENV_FILE" -f compose.prod.yml up -d db
    fi
    wait_postgres_ready
else
    echo "⚠️  当前开发环境使用 SQLite，不会读取 PostgreSQL 数据。"
fi

echo "🧱 执行数据库迁移和初始化..."
python manage.py migrate
python init_admin.py
python init_categories.py

# 后台启动后端
echo "🚀 启动后端服务 (http://localhost:11800)..."
python manage.py runserver 11800 &
BACKEND_PID=$!

# 等待后端启动
sleep 2

# 启动前端
echo "⚡ 启动前端开发服务器 (http://localhost:5173)..."
cd frontend_react && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ O-Doc 开发环境已启动!"
echo "   后端: http://localhost:11800"
echo "   前端: http://localhost:5173"
if [ "$USE_POSTGRES" != "false" ] && [ "$USE_POSTGRES" != "0" ]; then
    echo "   PostgreSQL: ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB} (user: ${POSTGRES_USER})"
    echo "   数据库密码: ${DEV_ENV_FILE} 中的 POSTGRES_PASSWORD"
fi
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 等待子进程
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '已停止所有服务'" INT TERM
wait
