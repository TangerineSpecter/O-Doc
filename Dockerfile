# 1. 基础镜像
FROM m.daocloud.io/docker.io/python:3.11-slim

# 2. 设置环境变量（推荐使用新版格式）
ENV PYTHONUNBUFFERED=1
ENV MYSQL_DATABASE=db_todo_list
ENV MYSQL_USER=orange
ENV MYSQL_PASSWORD=JwvQD2of0Uj1dgNtPfPJ
ENV MYSQL_HOST=localhost
ENV MYSQL_PORT=3306

# 3. 设置工作目录
WORKDIR /app

# 4. 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    default-libmysqlclient-dev \
    pkg-config \
    netcat-openbsd \
    && apt-get clean && rm -rf /var/lib/apt/lists/*  # 清理缓存减小镜像体积

# 5. 复制依赖文件
COPY requirements.txt .

# 6. 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 7. 复制项目代码
COPY . .

# 8. 暴露端口
EXPOSE 12088

# 9. 执行启动命令：先执行数据库迁移，再启动 Gunicorn
CMD ["./start.sh"]