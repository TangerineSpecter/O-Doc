#!/bin/sh

# 执行数据库迁移
# 这一步会根据你的 models.py 文件创建或更新数据库中的表
echo "开始进行数据库更新..."
python manage.py migrate

# 收集静态文件到 STATIC_ROOT 目录
echo "开始收集静态文件..."
python manage.py collectstatic --noinput

# 启动 Gunicorn 服务器
# exec 命令会用后面的命令替换掉当前的 shell 进程
# 这样做是 Docker 推荐的最佳实践，可以正确地处理信号
# --bind 0.0.0.0:12088 表示监听所有网络接口的 12088 端口
# o_doc.wsgi 是你的项目的 WSGI 应用程序入口
echo "开始启动服务..."
exec gunicorn --bind 0.0.0.0:11808 o_doc.wsgi:application