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
from httpx import AsyncClient as AsyncHTTPClient

from .ai_observer import check_ai_control, emit_ai_event
from .completion_options import temperature_options
from system_settings.token_usage.normalize import normalize

DEADLINE_SECONDS = 120


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
    parts, reasoning_parts, count, finish, last_progress = [], [], 0, '', 0.0
    saw_content = False
    # Own the supported httpx client explicitly. SDK 3's default httpx2 stack
    # left nested SSE generators pending at per-request event-loop shutdown.
    # Keeping the client in this scope also closes it if SDK setup fails.
    async with AsyncHTTPClient(timeout=seconds, follow_redirects=True) as http_client, AsyncOpenAI(
            api_key=config['api_key'], base_url=config['base_url'], timeout=seconds,
            max_retries=0, http_client=http_client) as client:
        stream = await client.chat.completions.create(**parameters)
        try:
            async for chunk in stream:
                usage = getattr(chunk, 'usage', None)
                if usage:
                    inbox.put(('usage', normalize(usage)))
                for choice in chunk.choices:
                    delta = choice.delta
                    content = getattr(delta, 'content', None)
                    reasoning = getattr(delta, 'reasoning_content', None)
                    if reasoning is None:
                        reasoning = getattr(delta, 'reasoning', None)
                    if isinstance(content, str) and content:
                        saw_content = True
                        parts.append(content)
                        inbox.put(('output', content))
                        count += len(content)
                        elapsed = time.monotonic() - started
                        if len(parts) == 1 or elapsed - last_progress >= 2:
                            inbox.put(('event', ('model_first_output' if len(parts) == 1 else 'model_progress', '收到首个输出，继续接收' if len(parts) == 1 else '正在接收模型输出', {'chars': count, 'duration_ms': elapsed * 1000})))
                            last_progress = elapsed
                    elif not saw_content and isinstance(reasoning, str) and reasoning:
                        # Some gateways put the JSON only in the reasoning channel and
                        # leave content empty. Keep it for parsing; do not treat it as
                        # published output or as a failure of the next provider.
                        reasoning_parts.append(reasoning)
                    if isinstance(choice.finish_reason, str):
                        finish = choice.finish_reason
        finally:
            await stream.close()
    text = ''.join(parts)
    if not text.strip():
        text = ''.join(reasoning_parts)
    if finish == 'length':
        raise AIOutputTruncated('模型接口返回输出长度限制，结果不完整，本次未采用')
    if finish != 'stop':
        raise AIStreamIncomplete('模型输出未正常结束，未发布本次结果')
    inbox.put(('event', ('model_response', '模型已完整返回，准备检查输出', {'chars': len(text), 'finish_reason': finish, 'duration_ms': (time.monotonic() - started) * 1000})))
    return text


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


def _drive(
    config: dict,
    parameters: dict,
    expires: float,
    metadata: dict,
    hard_deadline_seconds: float = DEADLINE_SECONDS,
) -> str:
    seconds = expires - time.monotonic()
    if seconds <= 0:
        raise AIRequestTimeout(f'模型调用达到 {math.ceil(hard_deadline_seconds)} 秒硬时限')
    from system_settings.token_usage.capture import Capture
    capture = Capture(config, attempt=metadata.get('request_attempt', 1))
    capture.set_request(parameters)
    status = 'interrupted'
    response_content = None
    failure = None
    output_parts = []
    inbox, cancelled = queue.Queue(), threading.Event()
    thread = threading.Thread(target=_network, args=(config, parameters, seconds, inbox, cancelled), daemon=True, name='bounded-ai-network')
    thread.start()
    try:
        while True:
            check_ai_control()
            remaining = expires - time.monotonic()
            if remaining <= 0:
                raise AIRequestTimeout(f'模型调用达到 {math.ceil(hard_deadline_seconds)} 秒硬时限，已取消连接')
            try:
                kind, value = inbox.get(timeout=min(.25, remaining))
            except queue.Empty:
                continue
            if kind == 'usage':
                capture.counts(value)
                emit_ai_event('model_usage', '模型返回用量统计', **metadata, prompt_tokens=value['input_tokens'], completion_tokens=value['output_tokens'])
                continue
            if kind == 'output':
                output_parts.append(value)
                continue
            if kind == 'done':
                status = 'success'
                response_content = value
                return value
            if kind == 'error':
                status = 'failed'
                failure = value
                if isinstance(value, (TimeoutError, asyncio.CancelledError)):
                    raise AIRequestTimeout(f'模型调用达到 {math.ceil(hard_deadline_seconds)} 秒硬时限或连接已取消') from value
                raise value
            event, title, details = value
            emit_ai_event(event, title, **metadata, **details)
    except BaseException as exc:
        failure = exc
        raise
    finally:
        cancelled.set()
        thread.join(timeout=2)
        while not inbox.empty():
            kind, value = inbox.get_nowait()
            if kind == 'usage':
                capture.counts(value)
            elif kind == 'output':
                output_parts.append(value)
        capture.set_response({'content': response_content if response_content is not None else ''.join(output_parts)})
        capture.finish(status, error=failure)


def _json_unsupported(exc: Exception) -> bool:
    if not isinstance(exc, APIStatusError) or exc.status_code not in (400, 422):
        return False
    message = str(exc.body).lower()
    return ('response_format' in message or 'json_object' in message) and any(word in message for word in ('unsupported', 'not support', 'unknown', 'unrecognized', 'not permitted', '不支持'))


def _thinking_unsupported(exc: Exception) -> bool:
    if not isinstance(exc, APIStatusError) or exc.status_code not in (400, 422):
        return False
    message = str(exc.body).lower()
    return ('thinking' in message or 'enable_thinking' in message) and any(word in message for word in ('unsupported', 'not support', 'unknown', 'unrecognized', 'not permitted', 'extra input', '不支持'))


def complete(
    config: dict,
    prompt: str,
    *,
    json_output: bool,
    max_tokens: int | None = None,
    extra_body: dict,
    deadline_seconds: float | None = None,
    allow_retries: bool = True,
    max_deadline_seconds: float | None = None,
) -> str:
    # Read the module constant at call time. A default argument would freeze
    # the import-time value, so a shorter hard limit would never take effect.
    if deadline_seconds is None:
        deadline_seconds = DEADLINE_SECONDS
    if max_deadline_seconds is None:
        max_deadline_seconds = DEADLINE_SECONDS
    hard_deadline_seconds = min(max_deadline_seconds, deadline_seconds)
    deadline = time.monotonic() + hard_deadline_seconds
    network_retries, request_attempt = 0, 0
    use_json = json_output
    current_extra_body = dict(extra_body)
    if config.get('thinking_mode', 'default') != 'default':
        from .thinking import thinking_body
        current_extra_body.pop('thinking', None)
        current_extra_body.pop('enable_thinking', None)
        current_extra_body.pop('reasoning_effort', None)
        current_extra_body.update(thinking_body(config))
    while True:
        check_ai_control()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise AIRequestTimeout(f'模型调用达到 {math.ceil(hard_deadline_seconds)} 秒硬时限')
        request_attempt += 1
        metadata = {key: config.get(key, '') for key in ('provider_name', 'model_name', 'model_role')}
        thinking_disabled = current_extra_body.get('enable_thinking') is False or current_extra_body.get('thinking', {}).get('type') == 'disabled'
        metadata.update(request_id=uuid.uuid4().hex, request_attempt=request_attempt, streaming=1, timeout_seconds=math.ceil(remaining), deadline_seconds=math.ceil(hard_deadline_seconds), sdk_retries=0, max_tokens=max_tokens, json_mode='json_object' if use_json else 'prompt' if json_output else 'text', thinking_mode='disabled' if thinking_disabled or current_extra_body.get('reasoning_effort') == 'none' else 'enabled' if config.get('thinking_mode') == 'enabled' else 'provider_default')
        parameters = {'model': config['model_name'], 'messages': [{'role': 'user', 'content': prompt}], 'stream': True,
                      **temperature_options(config, current_extra_body, .2)}
        if max_tokens is not None:
            parameters['max_tokens'] = max_tokens
        if config.get('provider_type') in ('OpenAi', 'DeepSeek', 'MiniMax'):
            parameters['stream_options'] = {'include_usage': True}
        if current_extra_body:
            parameters['extra_body'] = current_extra_body
        if use_json:
            parameters['response_format'] = {'type': 'json_object'}
        emit_ai_event('model_request_started', '正在请求模型，等待首个输出', **metadata)
        try:
            return _drive(config, parameters, deadline, metadata, hard_deadline_seconds)
        except Exception as exc:
            from system_logs.capture import capture
            capture('大模型请求尝试失败', module='ai', exc=exc, attempt=request_attempt,
                    model_request_id=metadata['request_id'], provider_name=config.get('provider_name', ''),
                    model_name=config.get('model_name', ''), sdk_retries=0)
            error_type = 'output_limit' if isinstance(exc, AIOutputTruncated) else 'timeout' if isinstance(exc, (TimeoutError, APIConnectionError)) and 'Timeout' in type(exc).__name__ else type(exc).__name__
            emit_ai_event('model_request_failed', '本次模型请求未完成', 'warning' if (_json_unsupported(exc) or _thinking_unsupported(exc)) else 'error', **metadata, error_type=error_type)
            if allow_retries and use_json and _json_unsupported(exc):
                use_json = False
                emit_ai_event('model_compatibility', '接口明确不支持 JSON 模式，回退提示词约束', 'warning', **metadata)
                continue
            if allow_retries and config.get('thinking_mode', 'default') == 'default' and ('thinking' in current_extra_body or 'enable_thinking' in current_extra_body) and _thinking_unsupported(exc):
                current_extra_body.pop('thinking', None)
                current_extra_body.pop('enable_thinking', None)
                emit_ai_event('model_compatibility', '接口明确不支持思考控制参数，回退默认调用', 'warning', **metadata)
                continue
            retryable = isinstance(exc, APIConnectionError) and 'Timeout' not in type(exc).__name__ or isinstance(exc, APIStatusError) and exc.status_code in (408, 409, 429) or isinstance(exc, APIStatusError) and exc.status_code >= 500
            if allow_retries and retryable and network_retries == 0 and deadline - time.monotonic() > 1:
                network_retries += 1
                emit_ai_event('model_transport_retry', '连接或服务暂时失败，明确重试一次（共享硬时限）', 'warning', **metadata)
                continue
            if isinstance(exc, APIError) and not isinstance(exc, AuthenticationError):
                if 'Timeout' in type(exc).__name__:
                    raise AIRequestTimeout('模型连接或读取超时，已停止本次调用') from None
                raise AIBoundedRequestError(getattr(exc, 'status_code', None)) from None
            raise
