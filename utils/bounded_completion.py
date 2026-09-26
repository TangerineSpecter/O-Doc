"""Cancellable, wall-clock-bounded completions with metadata-only progress.

The network loop owns no ORM/context callbacks. Its queue is drained by the
synchronous task owner so cancellation checks and execution writes stay on the
correct database connection. Cancelling asyncio also closes the HTTP stream.
"""
import asyncio
import math
import queue
import threading
import time
import uuid

from openai import APIConnectionError, APIError, APIStatusError, AsyncOpenAI, AuthenticationError

from .ai_observer import check_ai_control, emit_ai_event

DEADLINE_SECONDS = 120
MAX_OUTPUT_CHARS = 80000


class AIRequestTimeout(TimeoutError):
    pass


class AIOutputTruncated(RuntimeError):
    pass


class AIStreamIncomplete(RuntimeError):
    pass


class AIBoundedRequestError(RuntimeError):
    """Provider bodies may echo book text/credentials; never log them."""

    def __init__(self, status_code: int | None = None):
        self.status_code = status_code
        super().__init__(f'模型接口返回 HTTP {status_code}，请检查模型、参数或服务状态' if status_code else '模型连接失败，请检查接口地址及服务状态')


async def _receive(config: dict, parameters: dict, seconds: float, inbox: queue.Queue) -> str:
    started = time.monotonic()
    parts, count, finish, last_progress = [], 0, '', 0.0
    async with AsyncOpenAI(api_key=config['api_key'], base_url=config['base_url'], timeout=seconds, max_retries=0) as client:
        stream = await client.chat.completions.create(**parameters)
        try:
            async for chunk in stream:
                usage = getattr(chunk, 'usage', None)
                if usage:
                    inbox.put(('event', ('model_usage', '模型返回用量统计', {'prompt_tokens': usage.prompt_tokens, 'completion_tokens': usage.completion_tokens})))
                for choice in chunk.choices:
                    content = getattr(choice.delta, 'content', None)
                    if isinstance(content, str) and content:
                        parts.append(content)
                        count += len(content)
                        elapsed = time.monotonic() - started
                        if len(parts) == 1 or elapsed - last_progress >= 2:
                            inbox.put(('event', ('model_first_output' if len(parts) == 1 else 'model_progress', '收到首个输出，继续接收' if len(parts) == 1 else '正在接收模型输出', {'chars': count, 'duration_ms': elapsed * 1000})))
                            last_progress = elapsed
                        if count > MAX_OUTPUT_CHARS:
                            raise AIOutputTruncated('模型输出超过安全预算，请缩小正文范围')
                    if isinstance(choice.finish_reason, str):
                        finish = choice.finish_reason
        finally:
            await stream.close()
    if finish == 'length':
        raise AIOutputTruncated('模型输出达到 token 上限，未发布本次结果')
    if finish != 'stop':
        raise AIStreamIncomplete('模型输出未正常结束，未发布本次结果')
    inbox.put(('event', ('model_response', '模型已完整返回，准备检查输出', {'chars': count, 'finish_reason': finish, 'duration_ms': (time.monotonic() - started) * 1000})))
    return ''.join(parts)


def _network(config: dict, parameters: dict, seconds: float, inbox: queue.Queue, cancelled: threading.Event):
    async def run():
        task = asyncio.create_task(_receive(config, parameters, seconds, inbox))

        async def watch_cancel():
            while not cancelled.is_set():
                await asyncio.sleep(.1)
            task.cancel()

        watcher = asyncio.create_task(watch_cancel())
        try:
            return await asyncio.wait_for(task, seconds)
        finally:
            watcher.cancel()
            await asyncio.gather(watcher, return_exceptions=True)

    try:
        inbox.put(('done', asyncio.run(run())))
    except BaseException as exc:
        # Transfer failures, including asyncio cancellation, without swallowing
        # them or exposing provider response bodies to execution logs.
        inbox.put(('error', exc))


def _drive(config: dict, parameters: dict, expires: float, metadata: dict) -> str:
    seconds = expires - time.monotonic()
    if seconds <= 0:
        raise AIRequestTimeout('模型调用达到 120 秒硬时限')
    inbox, cancelled = queue.Queue(), threading.Event()
    thread = threading.Thread(target=_network, args=(config, parameters, seconds, inbox, cancelled), daemon=True, name='bounded-ai-network')
    thread.start()
    try:
        while True:
            check_ai_control()
            remaining = expires - time.monotonic()
            if remaining <= 0:
                raise AIRequestTimeout('模型调用达到 120 秒硬时限，已取消连接')
            try:
                kind, value = inbox.get(timeout=min(.25, remaining))
            except queue.Empty:
                continue
            if kind == 'done':
                return value
            if kind == 'error':
                if isinstance(value, (TimeoutError, asyncio.CancelledError)):
                    raise AIRequestTimeout('模型调用达到硬时限或连接已取消') from value
                raise value
            event, title, details = value
            emit_ai_event(event, title, **metadata, **details)
    finally:
        cancelled.set()
        thread.join(timeout=2)


def _json_unsupported(exc: Exception) -> bool:
    if not isinstance(exc, APIStatusError) or exc.status_code not in (400, 422):
        return False
    message = str(exc.body).lower()
    return ('response_format' in message or 'json_object' in message) and any(word in message for word in ('unsupported', 'not support', 'unknown', 'unrecognized', 'not permitted', '不支持'))


def complete(config: dict, prompt: str, *, json_output: bool, max_tokens: int, extra_body: dict) -> str:
    deadline = time.monotonic() + DEADLINE_SECONDS
    network_retries, request_attempt = 0, 0
    use_json = json_output
    while True:
        check_ai_control()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise AIRequestTimeout('模型调用达到 120 秒硬时限')
        request_attempt += 1
        metadata = {key: config.get(key, '') for key in ('provider_name', 'model_name', 'model_role')}
        thinking_disabled = extra_body.get('enable_thinking') is False or extra_body.get('thinking', {}).get('type') == 'disabled'
        metadata.update(request_id=uuid.uuid4().hex, request_attempt=request_attempt, streaming=1, timeout_seconds=math.ceil(remaining), deadline_seconds=DEADLINE_SECONDS, sdk_retries=0, max_tokens=max_tokens, json_mode='json_object' if use_json else 'prompt' if json_output else 'text', thinking_mode='disabled' if thinking_disabled else 'provider_default')
        parameters = {'model': config['model_name'], 'messages': [{'role': 'user', 'content': prompt}], 'stream': True, 'max_tokens': max_tokens, 'temperature': .2}
        if config.get('provider_type') in ('OpenAi', 'DeepSeek', 'MiniMax'):
            parameters['stream_options'] = {'include_usage': True}
        if extra_body:
            parameters['extra_body'] = extra_body
        if use_json:
            parameters['response_format'] = {'type': 'json_object'}
        emit_ai_event('model_request_started', '正在请求模型，等待首个输出', **metadata)
        try:
            return _drive(config, parameters, deadline, metadata)
        except Exception as exc:
            from system_logs.capture import capture
            capture('大模型请求尝试失败', module='ai', exc=exc, attempt=request_attempt,
                    model_request_id=metadata['request_id'], provider_name=config.get('provider_name', ''),
                    model_name=config.get('model_name', ''), sdk_retries=0)
            error_type = 'output_limit' if isinstance(exc, AIOutputTruncated) else 'timeout' if isinstance(exc, (TimeoutError, APIConnectionError)) and 'Timeout' in type(exc).__name__ else type(exc).__name__
            emit_ai_event('model_request_failed', '本次模型请求未完成', 'warning' if _json_unsupported(exc) else 'error', **metadata, error_type=error_type)
            if use_json and _json_unsupported(exc):
                use_json = False
                emit_ai_event('model_compatibility', '接口明确不支持 JSON 模式，回退提示词约束', 'warning', **metadata)
                continue
            retryable = isinstance(exc, APIConnectionError) and 'Timeout' not in type(exc).__name__ or isinstance(exc, APIStatusError) and exc.status_code in (408, 409, 429) or isinstance(exc, APIStatusError) and exc.status_code >= 500
            if retryable and network_retries == 0 and deadline - time.monotonic() > 1:
                network_retries += 1
                emit_ai_event('model_transport_retry', '连接或服务暂时失败，明确重试一次（共享硬时限）', 'warning', **metadata)
                continue
            if isinstance(exc, APIError) and not isinstance(exc, AuthenticationError):
                if 'Timeout' in type(exc).__name__:
                    raise AIRequestTimeout('模型连接或读取超时，已停止本次调用') from None
                raise AIBoundedRequestError(getattr(exc, 'status_code', None)) from None
            raise
