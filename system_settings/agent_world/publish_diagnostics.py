"""发帖搜索的安全诊断，不记录密钥、请求正文或远端响应正文。"""
import logging
import re
from urllib.parse import urlsplit

from system_logs.capture import capture

logger = logging.getLogger(__name__)
# 根日志只配置了持久化 Handler 时，错误也须出现在运行终端。
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('[%(levelname)s] %(name)s: %(message)s'))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


class PublishSearchError(ValueError):
    def __init__(self, reason: str, *, error_type: str, status: int | None = None):
        super().__init__(reason)
        self.diagnostics = {'reason': reason, 'error_type': error_type,
                            'http_status': status, 'provider_http_status': status}


def search_error(error: object) -> PublishSearchError:
    # MCP 适配器目前返回字符串；仅提取受控分类，不输出附带的响应内容。
    text = str(error)
    lower = text.lower()
    match = re.search(r'HTTP\s+(\d{3})\b', text, re.IGNORECASE)
    status = int(match.group(1)) if match else None
    if status in (401, 403) or any(word in lower for word in ('unauthorized', 'invalid api key', 'authentication')):
        kind, reason = 'authentication', '搜索服务认证或权限失败，请检查 API Key 和访问权限'
    elif status == 429:
        kind, reason = 'rate_limit', '搜索服务限流或额度不足，请检查服务额度'
    elif any(word in lower for word in ('timeout', 'timed out', '超时', '时限')):
        kind, reason = 'timeout', '搜索服务连接或读取超时'
    elif any(word in lower for word in ('ssl', 'certificate')):
        kind, reason = 'tls', '搜索服务 TLS 连接或证书校验失败'
    elif any(word in lower for word in ('connection', 'connect', 'resolve', 'name resolution')):
        kind, reason = 'connection', '无法连接搜索服务，请检查后端网络与服务地址'
    elif any(word in lower for word in ('literal_error', 'validation error', 'invalid argument', 'input should be', 'invalid params', 'invalid parameter')):
        kind, reason = 'invalid_arguments', '搜索工具参数不符合服务要求，请核对工具 schema 的 const、enum 和必填项'
    elif status:
        kind, reason = f'http_{status}', f'搜索服务返回 HTTP {status}'
    elif '无法解析' in text:
        kind, reason = 'invalid_response', '搜索服务响应无法解析'
    else:
        kind, reason = 'search_error', '搜索 MCP 工具调用失败，请检查服务配置和工具参数'
    phase = '初始化' if '初始化' in text else '工具调用'
    return PublishSearchError(f'{phase}失败：{reason}', error_type=kind, status=status)


def report_search_failure(exc: PublishSearchError, *, server, tool_name: str, duration_ms: int, stage: str) -> None:
    host = urlsplit(server.url or '').hostname or ''
    capture('发帖搜索失败', module='agent_world', exc=exc, search_server_id=str(server.pk),
            search_host=host, search_tool=tool_name, publish_stage=stage, duration_ms=duration_ms)
    logger.error('发帖搜索失败 server=%s host=%s tool=%s stage=%s duration_ms=%s type=%s status=%s reason=%s',
                 server.pk, host, tool_name, stage, duration_ms,
                 exc.diagnostics['error_type'], exc.diagnostics['http_status'], str(exc))
