#!/bin/bash

# 定义项目根目录
PROJECT_ROOT=$(dirname "$(realpath "$0")")
FRONTEND_DIR="$PROJECT_ROOT/frontend_react"

# 若 dist 文件夹存在则删除
if [ -d "$FRONTEND_DIR/dist" ]; then
    rm -rf "$FRONTEND_DIR/dist"
    echo "已删除 dist 文件夹"
fi

# 执行 build 重新构建
echo "开始执行构建..."
cd "$FRONTEND_DIR" && npm run build

# 检查构建是否成功
if [ $? -ne 0 ]; then
    echo "构建失败，请检查错误信息"
    exit 1
fi

# 定义目标文件夹路径
TEMPLATES_DIR="$PROJECT_ROOT/templates"
STATIC_DIR="$PROJECT_ROOT/static"

# 清理 static 以及 templates 文件夹下的文件
if [ -d "$TEMPLATES_DIR" ]; then
    rm -rf "$TEMPLATES_DIR"/*
    echo "已清理 $TEMPLATES_DIR 文件夹下的文件"
fi

if [ -d "$STATIC_DIR" ]; then
    rm -rf "$STATIC_DIR"/*
    echo "已清理 $STATIC_DIR 文件夹下的文件"
fi

# 创建目标文件夹（如果不存在）
mkdir -p "$TEMPLATES_DIR"
mkdir -p "$STATIC_DIR"

# 将 index.html 复制到 templates 文件夹下
if [ -f "$FRONTEND_DIR/dist/index.html" ]; then
    cp "$FRONTEND_DIR/dist/index.html" "$TEMPLATES_DIR"
    echo "已将 index.html 复制到 $TEMPLATES_DIR"
fi

# 将 assets 文件夹复制到 static 文件夹下
if [ -d "$FRONTEND_DIR/dist/assets" ]; then
    cp -r "$FRONTEND_DIR/dist/assets" "$STATIC_DIR"
    echo "已将 assets 文件夹复制到 $STATIC_DIR"
fi

# 将 favicon.svg 复制到 static 文件夹下
if [ -f "$FRONTEND_DIR/dist/favicon.svg" ]; then
    cp "$FRONTEND_DIR/dist/favicon.svg" "$STATIC_DIR"
    echo "已将 favicon.svg 复制到 $STATIC_DIR"
fi

echo "文件复制完成，更新操作已完成"
