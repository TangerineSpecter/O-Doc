"""Public, static source collection. No browser execution, cookies or credentials."""
import http.client
import ipaddress
import re
import socket
import ssl
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from urllib.parse import quote, urljoin, urlsplit, urlunsplit
from django.conf import settings
from utils.web_parser import extract_html_content, looks_like_login_or_block_page, WebParserError
from .intake import detect_language

MAX_BYTES = 2 * 1024 * 1024
MAX_TEXT = 120000
FETCH_SECONDS = 35
_dns = ThreadPoolExecutor(max_workers=2, thread_name_prefix='quant-source-dns')
_dns_slots = threading.BoundedSemaphore(2)


class SourceFetchError(Exception):
    """Expected acquisition failure safe to display with the archived source."""


def public_target(url: str, deadline: float) -> tuple[str, str, int, str]:
    try:
        if len(url) > 2000 or any(ord(c) < 33 or ord(c) == 127 for c in url):
            raise ValueError()
        parts = urlsplit(url)
        host = (parts.hostname or '').rstrip('.').encode('idna').decode('ascii').lower()
        port = parts.port or (443 if parts.scheme == 'https' else 80)
        if parts.scheme not in ('http', 'https') or not host or parts.username is not None or parts.password is not None:
            raise ValueError()
    except (ValueError, UnicodeError) as exc:
        raise SourceFetchError('网址格式无效，仅支持无账号密码的 HTTP/HTTPS 链接') from exc
    if host == 'localhost' or host.endswith(('.localhost', '.local', '.lan', '.internal')):
        raise SourceFetchError('网页来源不能指向本机或内网地址')
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None and not literal.is_global:
        raise SourceFetchError('网页来源不能直接使用内网或保留 IP 地址')
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise SourceFetchError('网页获取超时')
    if not _dns_slots.acquire(blocking=False):
        raise SourceFetchError('域名解析暂时繁忙，请稍后重试')
    try:
        future = _dns.submit(socket.getaddrinfo, host, port, type=socket.SOCK_STREAM)
    except BaseException:
        _dns_slots.release()
        raise
    future.add_done_callback(lambda _: _dns_slots.release())
    try:
        addresses = {item[4][0] for item in future.result(timeout=remaining)}
        def allowed(ip):
            address = ipaddress.ip_address(ip)
            # Match the existing desktop proxy policy. Never enable it here or
            # allow a literal fake IP, private LAN target or mixed private DNS.
            proxy = (literal is None and getattr(settings, 'WEB_IMPORT_ALLOW_PROXY_FAKE_IPS', False)
                     and address in ipaddress.ip_network('198.18.0.0/15'))
            return address.is_global or proxy
        if not addresses or any(not allowed(ip) for ip in addresses):
            raise SourceFetchError('网页来源不能指向本机、内网或保留地址')
    except (socket.gaierror, ValueError, FutureTimeout) as exc:
        future.cancel()
        raise SourceFetchError('网页域名无法解析或解析超时') from exc
    # Use this exact validated address; never resolve the host again at connect.
    return parts.scheme, host, port, sorted(addresses)[0]


class PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host: str, port: int, ip: str, timeout: float, secure: bool):
        super().__init__(host, port, timeout=timeout)
        self.ip, self.secure = ip, secure

    def connect(self):
        self.sock = socket.create_connection((self.ip, self.port), self.timeout)
        if self.secure:
            try:
                self.sock = ssl.create_default_context().wrap_socket(self.sock, server_hostname=self.host)
            except Exception:
                self.sock.close()
                raise


def download(url: str, check_cancel=lambda: None) -> tuple[str, bytes, str]:
    deadline = time.monotonic() + FETCH_SECONDS
    current = url
    for redirect in range(4):
        check_cancel()
        scheme, host, port, ip = public_target(current, deadline)
        parts = urlsplit(current)
        target = quote(urlunsplit(('', '', parts.path or '/', parts.query, '')), safe="/%?=&:+,;@!$'()*[]~-")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise SourceFetchError('网页获取超时')
        connection = PinnedHTTP(host, port, ip, min(10, remaining), scheme == 'https')
        response = None
        try:
            connection.request('GET', target, headers={'User-Agent': 'O-Doc-Research/1.0',
                'Accept': 'text/html, text/plain;q=0.9', 'Accept-Encoding': 'identity', 'Connection': 'close'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location or redirect == 3:
                    raise SourceFetchError('网页重定向过多或缺少目标地址')
                current = urljoin(current, location)
                continue
            if response.status in (401, 403, 429):
                raise SourceFetchError('网页要求登录、验证或限制访问；请粘贴可读取的代码与说明')
            if response.status != 200:
                raise SourceFetchError(f'网页返回 HTTP {response.status}，未获取正文')
            mime = response.getheader('Content-Type', '').split(';')[0].strip().lower()
            if mime not in ('text/html', 'application/xhtml+xml', 'text/plain', 'text/x-python'):
                raise SourceFetchError('仅支持静态 HTML 或纯文本源码链接')
            if response.getheader('Content-Encoding', 'identity').lower() != 'identity':
                raise SourceFetchError('网页未提供可读取的未压缩正文')
            declared = response.getheader('Content-Length', '')
            if declared.isdecimal() and int(declared) > MAX_BYTES:
                raise SourceFetchError('网页超过 2 MiB，请粘贴需要研究的部分')
            chunks, total = [], 0
            while True:
                check_cancel()
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise SourceFetchError('网页获取超时')
                if connection.sock:
                    connection.sock.settimeout(min(5, remaining))
                chunk = response.read1(min(65536, MAX_BYTES + 1 - total))
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_BYTES:
                    raise SourceFetchError('网页超过 2 MiB，请粘贴需要研究的部分')
                chunks.append(chunk)
            return current, b''.join(chunks), mime
        except InterruptedError:
            raise
        except (OSError, http.client.HTTPException, UnicodeError) as exc:
            raise SourceFetchError('网页连接失败或超时，请稍后重试或粘贴正文') from exc
        finally:
            if response is not None:
                response.close()
            connection.close()
    raise SourceFetchError('网页重定向过多')


def fetch_source(url: str, check_cancel=lambda: None) -> dict:
    final_url, body, mime = download(url, check_cancel)
    check_cancel()
    # BeautifulSoup's encoding detection is already used by the shared parser.
    from bs4 import UnicodeDammit
    text = UnicodeDammit(body).unicode_markup
    if not text or '\x00' in text:
        raise SourceFetchError('网页未包含可读取的文本')
    if mime in ('text/plain', 'text/x-python'):
        markdown, title, method, confidence = text, '', 'plain_text', 'unknown'
        language = detect_language(text)
        code = text if language != 'text' else ''
    else:
        if looks_like_login_or_block_page(text):
            raise SourceFetchError('页面需要登录或验证；未将拦截页面作为研究材料')
        try:
            parsed = extract_html_content(text, final_url)
        except WebParserError as exc:
            raise SourceFetchError('未提取到正文，页面可能需要登录或 JavaScript；请粘贴代码与说明') from exc
        candidate = parsed.best_candidate
        markdown, title, method, confidence = candidate.markdown, parsed.title, candidate.source, candidate.confidence
        blocks = re.findall(r'^```[^\n]*\n(.*?)^```\s*$', markdown, re.M | re.S)
        recognized = [block for block in blocks if detect_language(block) != 'text']
        # Several blocks may be alternatives, not one runnable program.
        code = recognized[0] if len(blocks) == 1 and len(recognized) == 1 else ''
        language = detect_language(code)
    if len(markdown) + len(code) > MAX_TEXT:
        raise SourceFetchError('提取正文超过分析上限，请粘贴需要研究的部分；未静默截断内容')
    if not markdown.strip():
        raise SourceFetchError('网页正文为空')
    return dict(final_url=final_url, web_markdown=markdown, title=title[:255],
                extracted_code=code, language=language, extraction_method=method,
                extraction_confidence=confidence)
