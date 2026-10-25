ARG BASE_IMAGE=python:3.11-slim-bookworm
FROM ${BASE_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1
WORKDIR /opt/odoc-native
COPY requirements.lock .
RUN python -m pip install --no-cache-dir --only-binary=:all: -r requirements.lock
COPY supervisor.py source_child.py ./
LABEL org.odoc.quant.native.protocol="python-source-process-v1"
ENTRYPOINT ["python", "-I", "/opt/odoc-native/supervisor.py"]
