"""有界 Tavily 适配；只持久化采用的资料，不保存原始响应。"""
import json
import time
import queue
import threading
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from utils.mcp_client import call_mcp_tool
from .publish_config import SEARCH_NAMES, search_server
from utils.source_urls import canonical_url
from .publish_diagnostics import PublishSearchError, search_error, report_search_failure



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


def search(config: dict, query: str, mode: str, days: int, deadline: float, *, search_depth: str = 'advanced') -> list[dict]:
    server = search_server(config)
    tool = next(t for t in server.tools if t.get('name') in SEARCH_NAMES and t.get('enabled', True))
    schema = tool.get('inputSchema') or tool.get('input_schema') or {}
    properties = schema.get('properties', {})
    args = {'query': query}
    for key, value in [('max_results', 5), ('search_depth', search_depth), ('topic', 'news' if mode == 'news' else 'general'), ('days', days)]:
        spec = properties.get(key, {})
        if key in properties and (key != 'days' or mode == 'news'):
            # Tavily MCP 的 topic 可能被 const 限定为 general；不能只检查 enum。
            if 'const' in spec:
                args[key] = spec['const']
            elif 'enum' not in spec or value in spec['enum']:
                args[key] = value
    if mode == 'news' and 'days' not in args:
        now = timezone.now()
        today = timezone.localtime(now).date() if timezone.is_aware(now) else now.date()
        for key, value in [('start_date', (today-timedelta(days=days)).isoformat()),
                           ('end_date', (today+timedelta(days=1)).isoformat())]:
            if key in properties:
                spec = properties[key]
                if 'const' in spec:
                    args[key] = spec['const']
                elif 'enum' not in spec or value in spec['enum']:
                    args[key] = value
    missing = set(schema.get('required', [])) - set(args)
    if missing:
        raise ValueError('搜索工具 schema 包含不支持的必填参数，请更新服务配置')
    remaining = deadline-time.monotonic()
    if remaining <= 0:
        raise TimeoutError('发帖流程达到5分钟时限')
    started = time.monotonic()
    from .publish_diagnostics import logger as diagnostic_logger
    options = {key: value for key, value in args.items() if key != 'query'}
    diagnostic_logger.info('发帖搜索参数 server=%s tool=%s mode=%s options=%s',
                           server.pk, tool['name'], mode, options)
    inbox = queue.Queue(maxsize=1)
    def request():
        try:
            inbox.put(call_mcp_tool(server, tool['name'], args, timeout=min(30, remaining)))
        except Exception as exc:
            inbox.put((None, exc))
    threading.Thread(target=request, daemon=True, name='agent-publish-search').start()
    try:
        payload, error = inbox.get(timeout=min(90, remaining))
    except queue.Empty:
        failure = PublishSearchError('搜索达到时限，未发布', error_type='timeout')
        report_search_failure(failure, server=server, tool_name=tool['name'],
                              duration_ms=round((time.monotonic()-started)*1000), stage='search_wait')
        raise failure from None
    if not error and isinstance(payload, dict) and payload.get('isError'):
        error = ' '.join(str(row.get('text', '')) for row in payload.get('content', [])
                         if isinstance(row, dict) and row.get('type') == 'text') or 'MCP 工具返回错误'
    if error:
        failure = search_error(error)
        report_search_failure(failure, server=server, tool_name=tool['name'],
                              duration_ms=round((time.monotonic()-started)*1000), stage='search_call')
        raise failure
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
                        'search_window': {key: args[key] for key in ('days', 'start_date', 'end_date', 'time_range') if key in args and args[key] is not None},
                        'fetched_at': timezone.now().isoformat()})
    return results
