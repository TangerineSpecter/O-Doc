# 1. 基础镜像
FROM m.daocloud.io/docker.io/python:3.11-slim

# 2. 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PORT=11800

# 3. 设置工作目录
WORKDIR /app

# 4. 安装系统依赖
# RUN apt-get update && apt-get install -y --no-install-recommends \
    # build-essential \
    # pkg-config \
    # curl \
    # gnupg \
    # && apt-get clean && rm -rf /var/lib/apt/lists/*  # 清理缓存减小镜像体积

# 5. 安装 Node.js 环境（用于构建前端）
# RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
# RUN apt-get install -y nodejs
# RUN npm install -g npm@latest

# 6. 复制依赖文件
COPY requirements.txt .

# 7. 安装 Python 依赖
RUN pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir -r requirements.txt

# 8. 复制项目代码
COPY . .

# 9. 暴露端口
EXPOSE 11800

# 10. 执行启动命令：先执行数据库迁移，再启动 Gunicorn
CMD ["./start.sh"]