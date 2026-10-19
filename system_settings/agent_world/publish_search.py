"""有界 Tavily 适配；只持久化采用的资料，不保存原始响应。"""
import json
import time
import queue
import threading
from datetime import timedelta
from email.utils import parsedate_to_datetime
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
        else:
            try:
                parsed = parsedate_to_datetime(value)
            except (TypeError, ValueError):
                return None
    if parsed and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    if parsed and not settings.USE_TZ and timezone.is_aware(parsed):
        parsed = timezone.make_naive(parsed)
    return parsed


def _schema_accepts(spec, value):
    spec = spec or {}
    if 'const' in spec and spec['const'] != value:
        return False
    if 'enum' in spec and value not in spec['enum']:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if 'minimum' in spec and value < spec['minimum']:
            return False
        if 'maximum' in spec and value > spec['maximum']:
            return False
    return True


def _max_results_for_schema(spec, requested):
    """Choose the closest requested count accepted by the saved MCP schema."""
    spec = spec or {}
    if 'const' in spec:
        value = spec['const']
        return value if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 20 else None
    if 'enum' in spec:
        values = [value for value in spec['enum'] if isinstance(value, int) and not isinstance(value, bool)
                  and 1 <= value <= 20]
        return min(values, key=lambda value: abs(value - requested)) if values else None
    minimum = max(1, int(spec.get('minimum', 1)))
    maximum = min(20, int(spec.get('maximum', 20)))
    if minimum > maximum:
        return None
    return max(minimum, min(maximum, requested))


def search(config: dict, query: str, mode: str, days: int, deadline: float, *, search_depth: str = 'advanced',
           max_results: int = 5, time_range: str = '', require_news_filters: bool = False,
           preserve_content: bool = False) -> list[dict]:
    server = search_server(config)
    tool = next(t for t in server.tools if t.get('name') in SEARCH_NAMES and t.get('enabled', True))
    schema = tool.get('inputSchema') or tool.get('input_schema') or {}
    properties = schema.get('properties', {})
    args = {'query': query}
    if preserve_content:
        for key in ('include_answer', 'include_raw_content'):
            if key in properties and _schema_accepts(properties[key], False):
                args[key] = False
    requested_results = max(1, min(20, int(max_results)))
    results_spec = properties.get('max_results')
    schema_max_results = (_max_results_for_schema(results_spec, requested_results)
                          if 'max_results' in properties else None)
    if schema_max_results is not None:
        args['max_results'] = schema_max_results
    elif mode == 'news' and require_news_filters:
        raise ValueError('Tavily MCP 工具定义不支持 max_results，请在 MCP 设置中刷新工具定义')
    max_results = schema_max_results or requested_results
    for key, value in [('search_depth', search_depth)]:
        spec = properties.get(key, {})
        if key in properties:
            args[key] = spec.get('const', value) if isinstance(spec, dict) else value

    topic = 'news' if mode == 'news' else 'general'
    topic_spec = properties.get('topic')
    if 'topic' in properties and _schema_accepts(topic_spec, topic):
        args['topic'] = topic
    elif mode == 'news' and require_news_filters:
        raise ValueError('Tavily MCP 工具定义不支持 topic=news，请在 MCP 设置中刷新工具定义')

    if mode == 'news':
        now = timezone.now()
        today = timezone.localtime(now).date() if timezone.is_aware(now) else now.date()
        published_date_spec = properties.get('filter_by_published_date')
        if 'filter_by_published_date' in properties and _schema_accepts(published_date_spec, True):
            args['filter_by_published_date'] = True
        requested_range = time_range or ''
        range_spec = properties.get('time_range', {})
        range_aliases = {'day': ('day', 'd'), 'week': ('week', 'w'),
                         'month': ('month', 'm'), 'year': ('year', 'y')}
        accepted_range = next((value for value in range_aliases.get(requested_range, (requested_range,))
                               if _schema_accepts(range_spec, value)), '') if 'time_range' in properties else ''
        if requested_range and accepted_range:
            args['time_range'] = accepted_range
        elif 'days' in properties and _schema_accepts(properties['days'], days):
            args['days'] = days
        elif 'start_date' in properties or 'end_date' in properties:
            start_day = today if requested_range == 'day' else today - timedelta(days=days)
            date_args_added = False
            for key, value in [('start_date', start_day.isoformat()),
                               ('end_date', (today + timedelta(days=1)).isoformat())]:
                if key in properties and _schema_accepts(properties[key], value):
                    args[key] = value
                    date_args_added = True
            if require_news_filters and not date_args_added:
                raise ValueError('Tavily MCP 工具定义不支持今日时间范围，请在 MCP 设置中刷新工具定义')
        elif require_news_filters:
            raise ValueError('Tavily MCP 工具定义不支持今日时间范围，请在 MCP 设置中刷新工具定义')
    missing = set(schema.get('required', [])) - set(args)
    if missing:
        raise ValueError('搜索工具 schema 包含不支持的必填参数，请更新服务配置')
    remaining = deadline-time.monotonic()
    if remaining <= 0:
        raise TimeoutError('发帖流程达到总时限')
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
    for row in rows[:max_results]:
        if not isinstance(row, dict):
            continue
        url = canonical_url(str(row.get('url') or ''))
        if not url or any(item['url'] == url for item in results):
            continue
        published = date_value(row.get('published_date') or row.get('published_at'))
        # Theatre uses the complete built-in snippet, never a full-page fallback.
        summary = (str(row.get('content') or '') if preserve_content else
                   str(row.get('content') or row.get('raw_content') or '')[:6000])
        results.append({'url': url, 'title': str(row.get('title') or '')[:500],
                        'summary': summary,
                        'published_at': published.isoformat() if published else None,
                        'search_window': {key: args[key] for key in ('days', 'start_date', 'end_date', 'time_range') if key in args and args[key] is not None},
                        'fetched_at': timezone.now().isoformat()})
    return results
