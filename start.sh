#!/bin/sh

set -e

DB_PATH="${DJANGO_DB_PATH:-/app/db.sqlite3}"
MEDIA_DIR="${DJANGO_MEDIA_ROOT:-/app/media}"
CHROMA_DIR="${ODOC_CHROMA_PATH:-/app/chroma_data}"
STATIC_ROOT_DIR="${DJANGO_STATIC_ROOT:-/app/staticfiles}"
APP_PORT="${PORT:-11800}"

mkdir -p "$(dirname "$DB_PATH")" "$MEDIA_DIR" "$CHROMA_DIR" "$STATIC_ROOT_DIR"

if [ "${DJANGO_DB_ENGINE:-sqlite}" = "postgresql" ] || [ "${DJANGO_DB_ENGINE:-sqlite}" = "postgres" ] || [ "${DATABASE_URL#postgres://}" != "$DATABASE_URL" ] || [ "${DATABASE_URL#postgresql://}" != "$DATABASE_URL" ]; then
  echo "等待 PostgreSQL 数据库就绪..."
  python <<'PY'
import os
import sys
import time

import psycopg

database_url = os.getenv("DATABASE_URL")
host = os.getenv("POSTGRES_HOST", "db")
port = os.getenv("POSTGRES_PORT", "5432")
dbname = os.getenv("POSTGRES_DB", "odoc")
user = os.getenv("POSTGRES_USER", "odoc")
password = os.getenv("POSTGRES_PASSWORD", "")

deadline = time.time() + int(os.getenv("POSTGRES_WAIT_TIMEOUT", "60"))
last_error = None

while time.time() < deadline:
    try:
        if database_url:
            conn = psycopg.connect(database_url, connect_timeout=3)
        else:
            conn = psycopg.connect(
                host=host,
                port=port,
                dbname=dbname,
                user=user,
                password=password,
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
fi

# 执行数据库迁移
# 这一步会根据你的 models.py 文件创建或更新数据库中的表
echo "开始进行数据库更新..."
python manage.py migrate

# 收集静态文件到 STATIC_ROOT 目录
echo "开始收集静态文件..."
python manage.py collectstatic --noinput

# === 初始化管理员账号 ===
python init_admin.py
python init_categories.py

# 启动 Gunicorn 服务器
# exec 命令会用后面的命令替换掉当前的 shell 进程
# 这样做是 Docker 推荐的最佳实践，可以正确地处理信号
# --bind 0.0.0.0:11800 表示监听所有网络接口的11800端口
# o_doc.wsgi 是你的项目的 WSGI 应用程序入口
echo "开始启动服务..."
exec gunicorn --bind "0.0.0.0:${APP_PORT}" o_doc.wsgi:application
