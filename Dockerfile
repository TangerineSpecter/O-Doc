FROM m.daocloud.io/docker.io/node:22-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend_react/package.json frontend_react/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY frontend_react/ ./
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build


FROM m.daocloud.io/docker.io/python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PORT=11800
ENV DJANGO_DEBUG=false

WORKDIR /app

COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

COPY . .

COPY --from=frontend-builder /frontend/dist/index.html /app/templates/index.html
COPY --from=frontend-builder /frontend/dist/ /app/static/
RUN rm -f /app/static/index.html && chmod +x /app/start.sh

ARG ODOC_BUILD_VERSION=unknown
ARG ODOC_BUILD_COMMIT=unknown
ENV ODOC_BUILD_VERSION=${ODOC_BUILD_VERSION}
ENV ODOC_BUILD_COMMIT=${ODOC_BUILD_COMMIT}
LABEL org.opencontainers.image.version=${ODOC_BUILD_VERSION}
LABEL org.opencontainers.image.revision=${ODOC_BUILD_COMMIT}

EXPOSE 11800

CMD ["./start.sh"]
