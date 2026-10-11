"""Bounded JEV diagnostics: identifiers and classifications, never wire payloads."""
import time
import traceback
import uuid
import requests
from system_logs.capture import capture, sanitize
from utils.token_usage import usage_context

STAGES = {
    'request': '发送请求', 'response_json': '解析响应 JSON',
    'response_validation': '校验响应结构', 'version_validation': '校验模型版本',
    'usage': '采集用量', 'answer_validation': '校验候选',
    'probability_validation': '校验概率分布', 'finish': '完成用量记录',
}


def record_failure(exc: Exception, *, stage: str, request_id: str, started: float,
                   status: int | None, row=None, validation: bool = False) -> str:
    if isinstance(exc, requests.Timeout):
        kind, reason = 'timeout', 'JEV 调用超时'
    elif isinstance(exc, requests.ConnectionError):
        kind, reason = 'connection', 'JEV 网络连接失败'
    elif status is not None and status != 200:
        kind = {401: 'authentication', 403: 'permission', 429: 'rate_limit'}.get(status, f'http_{status}')
        reason = {401: 'JEV 认证失败', 403: 'JEV 拒绝访问', 429: 'JEV 请求被限流'}.get(status, 'JEV 服务返回错误') + f'（HTTP {status}）'
    elif stage == 'response_json' and isinstance(exc, ValueError):
        kind, reason = 'invalid_json', 'JEV 响应不是有效 JSON'
    elif validation:
        kind, reason = 'invalid_response', str(exc)  # Only our fixed validation messages.
    elif isinstance(exc, requests.RequestException):
        kind, reason = 'request_error', 'JEV 网络请求异常'
    else:
        kind, reason = 'adapter_error', 'JEV 适配处理异常'
    context = usage_context() or {}
    stack = '\n'.join(f'{frame.filename}:{frame.lineno} in {frame.name}'
                      for frame in traceback.extract_tb(exc.__traceback__))
    capture('JEV 决策调用失败', module='ai',
            model_request_id=request_id, model_call_id=request_id, usage_id=row.pk if row else '',
            run_id=context.get('record_key', ''), task_id=context.get('task_key', ''),
            agent_id=context.get('agent_key', ''), provider_name='TypeSafe JEV',
            model_name=row.model_name if row else 'jev-latest', operation='jev_choose',
            provider_endpoint='/v1/systemone / ' + STAGES[stage],
            stage=stage, reason=reason, error_type=kind, exception_class=type(exc).__name__,
            http_status=status, provider_http_status=status,
            duration_ms=round((time.monotonic() - started) * 1000), stack=sanitize(stack, 12000))
    return f'{reason}（{STAGES[stage]}；请求 {request_id}）'


def request_identifier(row) -> str:
    return str(row.pk) if row else uuid.uuid4().hex
