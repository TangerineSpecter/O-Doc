import ipaddress
import gzip
import http.client
import json
import re
import time
import zlib
from urllib.parse import urlsplit, quote
import requests
from rest_framework.exceptions import ValidationError
from quant.models import ExternalConnector, ExternalResponse, ConnectorSecret
from quant.research.contracts import digest
from .mapping import validate_mappings, map_response, render
from .transport import open_connection


def endpoint(url):
    try:
        parsed = urlsplit(url)
        hostname = parsed.hostname
        parsed.port
    except ValueError as exc:
        raise ValidationError('接口地址格式无效') from exc
    if parsed.scheme not in ('http', 'https') or not hostname or parsed.username is not None or parsed.password is not None or parsed.fragment:
        raise ValidationError('接口地址须为不含内嵌凭据的HTTP/HTTPS地址')
    host = hostname.lower().rstrip('.')
    if '{{' in parsed.netloc or '}}' in parsed.netloc: raise ValidationError('接口主机须固定，路径中可使用上下文变量')
    if host in ('metadata.google.internal', 'instance-data.ec2.internal') or host.endswith('.metadata.google.internal'):
        raise ValidationError('不能使用云主机元数据接口')
    try:
        address = ipaddress.ip_address(host)
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        if address.is_link_local or address.is_unspecified or address.is_multicast: raise ValidationError('接口地址不能是链路本地、组播或未指定地址')
    except ValueError: pass
    return url


def config(raw):
    if not isinstance(raw, dict) or raw.get('version') != 1 or raw.get('method') not in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'):
        raise ValidationError('连接配置版本或HTTP方法无效')
    if not isinstance(raw.get('url'), str) or len(raw['url']) > 2000: raise ValidationError('需要接口地址')
    # The destination is fixed by the owner; templates are for query/body/header values.
    endpoint(raw['url'])
    if '{{secret.' in raw['url']: raise ValidationError('密钥请放入请求头或正文，不要放入URL')
    for key in ('headers', 'query'):
        if not isinstance(raw.get(key, {}), dict) or len(raw.get(key, {})) > 50: raise ValidationError('请求头或查询参数格式无效')
    for key, value in raw.get('headers', {}).items():
        if key.lower() in ('authorization', 'cookie', 'x-api-key') and (not isinstance(value, str) or '{{secret.' not in value):
            raise ValidationError('认证请求头请引用本机密钥变量，例如Bearer {{secret.api_key}}')
    if type(raw.get('timeout', 20)) is not int or not 1 <= raw.get('timeout', 20) <= 30: raise ValidationError('超时须为1–30秒')
    validate_mappings(raw.get('mappings', []))
    if len(json.dumps(raw)) > 100000: raise ValidationError('连接配置过长')
    return raw


def present(row):
    return {'id': row.pk, 'name': row.name, 'config_json': json.dumps(row.config, ensure_ascii=False),
        'has_secrets': ConnectorSecret.objects.filter(connector=row).exclude(values={}).exists(), 'updated_at': row.updated_at.isoformat()}


def preview(raw, response, context):
    cfg = config(raw)
    if not isinstance(context, dict): raise ValidationError('请求上下文须为JSON对象')
    normalized, warnings = map_response(response, cfg.get('mappings', []))
    return {'normalized_json': json.dumps(normalized, ensure_ascii=False, allow_nan=False), 'warnings': warnings,
        'evidence_status': 'external_report_unverified', 'request_template_json': json.dumps({key: cfg.get(key) for key in ('method', 'url', 'headers', 'query', 'body')}, ensure_ascii=False)}


def execute(row, context):
    cfg = config(row.config)
    if not isinstance(context, dict): raise ValidationError('请求上下文须为JSON对象')
    stored = ConnectorSecret.objects.filter(connector=row).first()
    secrets = stored.values if stored else {}
    headers = render(cfg.get('headers', {}), context, secrets)
    query = render(cfg.get('query', {}), context, secrets)
    body = render(cfg.get('body'), context, secrets)
    url = re.sub(r'\{\{\s*([A-Za-z0-9_.\[\]/~-]+)\s*\}\}',
        lambda match: quote(str(render('{{' + match.group(1) + '}}', context)), safe=''), cfg['url'])
    endpoint(url)
    if any(not isinstance(v, (str, int, float, bool)) for v in headers.values()): raise ValidationError('请求头须为标量值')
    deadline = time.monotonic() + cfg.get('timeout', 20)
    connection = response = reader = None
    try:
        # Prepare encoding locally, then send only to the validated numeric IP;
        # the original hostname remains the HTTP Host and TLS identity.
        prepared = requests.Request(cfg['method'], url, headers={k: str(v) for k, v in headers.items()},
                                    params=query, json=body if cfg['method'] != 'GET' else None).prepare()
        connection = open_connection(prepared.url, deadline)
        connection.request(prepared.method, prepared.path_url, body=prepared.body, headers=dict(prepared.headers))
        remaining = deadline - time.monotonic()
        if remaining <= 0: raise ValidationError('接口请求超时')
        if connection.sock: connection.sock.settimeout(remaining)
        response = connection.getresponse()
        if not 200 <= response.status < 300: raise ValidationError(f'外部接口返回HTTP {response.status}，未归档为研究证据')
        encoding = response.getheader('Content-Encoding', 'identity').strip().lower()
        if encoding not in ('', 'identity', 'gzip'):
            raise ValidationError('接口须返回UTF-8 JSON，支持未压缩或gzip响应')
        reader = gzip.GzipFile(fileobj=response) if encoding == 'gzip' else response
        chunks, length = [], 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0: raise ValidationError('接口请求超时')
            if connection.sock: connection.sock.settimeout(remaining)
            chunk = reader.read1(min(65536, 2 * 1024 * 1024 + 1 - length))
            if not chunk: break
            length += len(chunk)
            if length > 2 * 1024 * 1024: raise ValidationError('响应超过2MiB，请调整外部接口返回范围')
            chunks.append(chunk)
        raw_text = b''.join(chunks).decode('utf-8')
        parsed = json.loads(raw_text)
    except (requests.RequestException, OSError, EOFError, zlib.error, http.client.HTTPException, UnicodeError, ValueError) as exc:
        raise ValidationError('请求失败或接口未返回UTF-8 JSON，请检查连接与响应格式') from exc
    finally:
        if reader is not None and reader is not response: reader.close()
        if response is not None: response.close()
        if connection is not None: connection.close()
    normalized, warnings = map_response(parsed, cfg.get('mappings', []))
    # Store the configuration and response; never store rendered headers, request context, or local secrets.
    data = {'version': 1, 'connector_hash': row.content_hash, 'config': cfg, 'raw_response': parsed,
        'normalized': normalized, 'warnings': warnings, 'evidence_status': 'external_report_unverified',
        'request_context_hash': digest(context)}
    return data
