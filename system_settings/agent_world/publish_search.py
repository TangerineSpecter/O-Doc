"""有界 Tavily 适配；只持久化采用的资料，不保存原始响应。"""
import ipaddress
import json
import time
import queue
import threading
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from utils.mcp_client import call_mcp_tool
from .publish_config import SEARCH_NAMES, search_server


def canonical_url(value: str) -> str:
    try:
        url = urlsplit(value.strip())
        if url.scheme not in ('https', 'http') or not url.hostname or url.username or url.password:
            return ''
        host = url.hostname.lower()
        if host == 'localhost' or host.endswith(('.local', '.internal')):
            return ''
        try:
            if not ipaddress.ip_address(host).is_global:
                return ''
        except ValueError:
            pass
        query = [(k, v) for k, v in parse_qsl(url.query) if not k.lower().startswith('utm_') and k.lower() not in {'fbclid', 'gclid'}]
        return urlunsplit((url.scheme.lower(), url.netloc.lower(), url.path.rstrip('/') or '/', urlencode(sorted(query)), ''))
    except (ValueError, TypeError):
        return ''


def date_value(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = parse_datetime(value)
    except ValueError:
        return None
    if parsed is None:
        try:
            day = parse_date(value)
        except ValueError:
            return None
        if day:
            from datetime import datetime, time as daytime
            parsed = datetime.combine(day, daytime.min)
    if parsed and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    if parsed and not settings.USE_TZ and timezone.is_aware(parsed):
        parsed = timezone.make_naive(parsed)
    return parsed


def search(config: dict, query: str, mode: str, days: int, deadline: float) -> list[dict]:
    server = search_server(config)
    tool = next(t for t in server.tools if t.get('name') in SEARCH_NAMES and t.get('enabled', True))
    schema = tool.get('inputSchema') or tool.get('input_schema') or {}
    properties = schema.get('properties', {})
    args = {'query': query}
    for key, value in [('max_results', 5), ('search_depth', 'advanced'), ('topic', 'news' if mode == 'news' else 'general'), ('days', days)]:
        spec = properties.get(key, {})
        if key in properties and (key != 'days' or mode == 'news') and ('enum' not in spec or value in spec['enum']):
            args[key] = value
    missing = set(schema.get('required', [])) - set(args)
    if missing:
        raise ValueError('搜索工具 schema 包含不支持的必填参数，请更新服务配置')
    remaining = deadline-time.monotonic()
    if remaining <= 0:
        raise TimeoutError('发帖流程达到5分钟时限')
    inbox = queue.Queue(maxsize=1)
    def request():
        try:
            inbox.put(call_mcp_tool(server, tool['name'], args, timeout=min(10, remaining / 12)))
        except Exception:
            inbox.put((None, '搜索调用异常'))
    threading.Thread(target=request, daemon=True, name='agent-publish-search').start()
    try:
        payload, error = inbox.get(timeout=min(30, remaining))
    except queue.Empty as exc:
        raise TimeoutError('搜索达到时限，未发布') from exc
    if error:
        raise ValueError('搜索服务调用失败，请检查搜索配置')
    if isinstance(payload, dict) and isinstance(payload.get('content'), list):
        texts = [x.get('text', '') for x in payload['content'] if x.get('type') == 'text']
        try:
            payload = json.loads('\n'.join(texts))
        except (ValueError, TypeError):
            return []
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except ValueError:
            return []
    rows = payload.get('results', []) if isinstance(payload, dict) else []
    results = []
    for row in rows[:5]:
        if not isinstance(row, dict):
            continue
        url = canonical_url(str(row.get('url') or ''))
        if not url or any(item['url'] == url for item in results):
            continue
        published = date_value(row.get('published_date') or row.get('published_at'))
        results.append({'url': url, 'title': str(row.get('title') or '')[:500],
                        'summary': str(row.get('content') or row.get('raw_content') or '')[:6000],
                        'published_at': published.isoformat() if published else None,
                        'fetched_at': timezone.now().isoformat()})
    return results
