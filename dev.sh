#!/bin/bash

set -e

cd "$(dirname "$0")"

echo "🍊 正在启动 O-Doc 开发环境..."

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
if ! python -c "import django" &> /dev/null; then
    echo "📦 正在安装后端依赖..."
    pip install -r requirements.txt
fi

# 安装前端依赖
if [ ! -d "frontend_react/node_modules" ]; then
    echo "📦 正在安装前端依赖..."
    cd frontend_react && npm install && cd ..
fi

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
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 等待子进程
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '已停止所有服务'" INT TERM
wait