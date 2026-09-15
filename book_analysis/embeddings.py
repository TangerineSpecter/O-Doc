"""Small, cancellable book embedding requests; memo/article paths stay unchanged."""
import asyncio
import math
import queue
import threading
import time
import uuid

import httpx

from utils.ai_observer import check_ai_control, emit_ai_event
from utils.rag_client import RagClient, RagSyncError

INDEX_TIMEOUT = 180
QUERY_TIMEOUT = 30


def embedding_config(model):
    # Local Ollama commonly has no key. httpx/h11 rejects the trailing space
    # in "Bearer " before sending a request; requests (memo's path) tolerates it.
    key = (model.provider.api_key or '').strip()
    headers = {'Content-Type': 'application/json'}
    if key:
        if any(ord(char) < 33 or ord(char) > 126 for char in key):
            raise RagSyncError('向量模型 API 密钥含无效字符，请检查模型配置')
        headers['Authorization'] = f'Bearer {key}'
    return {'url': model.provider.base_url.strip().rstrip('/') + '/embeddings', 'model': model.name, 'headers': headers}


def validate_vectors(data, count):
    entries = data.get('data') if isinstance(data, dict) else None
    if not isinstance(entries, list) or len(entries) != count:
        raise RagSyncError('向量数量异常')
    indexed = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise RagSyncError('向量格式异常')
        index, vector = entry.get('index'), entry.get('embedding')
        if type(index) is not int or index in indexed or not 0 <= index < count:
            raise RagSyncError('向量索引异常')
        if not isinstance(vector, list) or not vector or any(type(v) not in (int, float) or not math.isfinite(v) for v in vector):
            raise RagSyncError('向量数值异常')
        indexed[index] = vector
    if len({len(v) for v in indexed.values()}) != 1:
        raise RagSyncError('向量维度不一致')
    return [indexed[i] for i in range(count)]


def _network(config, text, seconds, inbox, cancelled):
    async def receive():
        async with httpx.AsyncClient(timeout=httpx.Timeout(seconds, connect=min(10, seconds))) as client:
            response = await client.post(config['url'], json={'model': config['model'], 'input': text.replace('\n', ' ')}, headers=config['headers'])
            if response.status_code >= 400:
                # Provider bodies can echo keys; never persist them in diagnostics.
                raise RagSyncError(f'向量接口返回 HTTP {response.status_code}')
            return validate_vectors(response.json(), 1)[0]

    async def run():
        task = asyncio.create_task(receive())
        async def watch():
            while not cancelled.is_set():
                await asyncio.sleep(.1)
            task.cancel()
        watcher = asyncio.create_task(watch())
        try:
            return await asyncio.wait_for(task, seconds)
        finally:
            watcher.cancel()
            await asyncio.gather(watcher, return_exceptions=True)
    try:
        inbox.put(('done', asyncio.run(run())))
    except BaseException as exc:
        inbox.put(('error', exc))


def embed_texts(texts, *, purpose='index', model=None):
    model = model or RagClient.get_embedding_model()
    if not model:
        raise RagSyncError('未配置默认向量模型')
    seconds = INDEX_TIMEOUT if purpose == 'index' else QUERY_TIMEOUT
    config = embedding_config(model)
    result = []
    # Match the proven memo string-input path, not 16 long documents at once.
    for text in texts:
        check_ai_control()
        metadata = {'request_id': uuid.uuid4().hex, 'provider_name': model.provider.name, 'model_name': model.name, 'model_role': 'embedding', 'phase': 'index' if purpose == 'index' else 'retrieve'}
        started = time.monotonic()
        emit_ai_event('model_request_started', '正在请求向量模型（单段输入）', **metadata, chars=len(text), vectors=1, timeout_seconds=seconds, deadline_seconds=seconds, sdk_retries=0)
        inbox, cancelled = queue.Queue(), threading.Event()
        thread = threading.Thread(target=_network, args=(config, text, seconds, inbox, cancelled), daemon=True, name='book-embedding-network')
        thread.start()
        network_error = ''
        try:
            while True:
                check_ai_control()
                remaining = seconds - (time.monotonic() - started)
                if remaining <= 0:
                    raise TimeoutError(f'向量请求达到 {seconds} 秒硬时限')
                try:
                    kind, value = inbox.get(timeout=min(.25, remaining))
                except queue.Empty:
                    continue
                if kind == 'error':
                    network_error = type(value).__name__
                    if isinstance(value, RagSyncError):
                        raise value
                    if isinstance(value, (TimeoutError, httpx.TimeoutException)):
                        raise TimeoutError(f'向量请求超时（硬时限 {seconds} 秒）') from None
                    if isinstance(value, httpx.LocalProtocolError):
                        raise RagSyncError('向量请求本地协议错误：请检查接口地址及认证配置；不是模型计算超时') from None
                    raise RagSyncError(f'向量请求失败：{type(value).__name__}') from None
                result.append(value)
                break
            emit_ai_event('model_response', '向量模型已返回，格式检查通过', **metadata, duration_ms=(time.monotonic() - started) * 1000, vectors=1)
        except Exception as exc:
            emit_ai_event('model_request_failed', '向量模型请求失败或已停止', 'warning', **metadata, error_type=network_error or type(exc).__name__, duration_ms=(time.monotonic() - started) * 1000)
            raise
        finally:
            cancelled.set()
            thread.join(timeout=2)
    if len({len(v) for v in result}) > 1:
        raise RagSyncError('向量维度不一致')
    return result
