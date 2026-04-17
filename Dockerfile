FROM m.daocloud.io/docker.io/node:22-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend_react/package.json ./
RUN npm install

COPY frontend_react/ ./
RUN npm run build


FROM m.daocloud.io/docker.io/python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PORT=11800
ENV DJANGO_DEBUG=false

WORKDIR /app

COPY requirements.txt ./
RUN pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir -r requirements.txt

COPY . .

COPY --from=frontend-builder /frontend/dist/index.html /app/templates/index.html
COPY --from=frontend-builder /frontend/dist/assets /app/static/assets
COPY --from=frontend-builder /frontend/dist/favicon.svg /app/static/favicon.svg

RUN chmod +x /app/start.sh

EXPOSE 11800

CMD ["./start.sh"]
