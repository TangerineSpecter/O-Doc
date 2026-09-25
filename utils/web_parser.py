import hashlib
import ipaddress
import logging
import re
import socket
import time
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup, Comment
from django.conf import settings
from markdownify import MarkdownConverter
from readability import Document


logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = (5, 15)
MAX_REDIRECTS = 5
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_URL_LENGTH = 500
HTML_CONTENT_TYPES = {'text/html', 'application/xhtml+xml'}
PROXY_FAKE_IP_NETWORKS = (ipaddress.ip_network('198.18.0.0/15'),)
USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
)

CONTENT_SELECTORS = (
    '[itemprop="articleBody"]',
    '#content_views',
    '#js_content',
    '.RichContent-inner',
    '.markdown-body',
    '.article-content',
    '.article_content',
    '.post-content',
    '.entry-content',
    '.blog-content-box',
    'article',
    'main',
    '[role="main"]',
)

NOISE_ATTRIBUTE_RE = re.compile(
    r'(?:^|[-_\s])(?:nav|menu|header|footer|sidebar|aside|comment|recommend|related|'
    r'advert|advertisement|ads|share|social|login|toolbar|breadcrumb|copyright|'
    r'catalog|directory|pagination|popup|modal|cookie|author-card|profile-card)(?:$|[-_\s])',
    re.IGNORECASE,
)

SITE_ADAPTERS = (
    {
        'name': 'csdn',
        'host_suffixes': ('.csdn.net', 'csdn.net'),
        'content_selectors': ('#content_views', '.blog-content-box'),
        'title_selectors': ('.title-article', 'h1'),
        'source_bonus': 1600,
    },
    {
        'name': 'zhihu',
        'host_suffixes': ('.zhihu.com', 'zhihu.com'),
        'content_selectors': ('.Post-RichTextContainer', '.Post-RichText', 'article'),
        'title_selectors': ('.Post-Title', 'h1'),
        'source_bonus': 1600,
    },
)


class WebParserError(Exception):
    """Raised when a page cannot be safely fetched or parsed into article content."""


@dataclass(frozen=True)
class WebContentCandidate:
    candidate_id: str
    source: str
    markdown: str
    score: int
    confidence: str
    text_length: int
    meaningful_blocks: int
    link_density: float
    image_urls: tuple[str, ...]


@dataclass(frozen=True)
class ParsedWebContent:
    title: str
    final_url: str
    candidates: tuple[WebContentCandidate, ...]

    @property
    def best_candidate(self):
        return self.candidates[0]


@dataclass(frozen=True)
class FetchedResource:
    final_url: str
    content: bytes
    content_type: str


class ArticleMarkdownConverter(MarkdownConverter):
    def convert_pre(self, el, text, convert_as_inline=False, **kwargs):
        lang = ''
        code_tag = el.find('code')
        if code_tag and code_tag.has_attr('class'):
            classes = code_tag['class']
            if isinstance(classes, str):
                classes = [classes]
            for class_name in classes:
                if class_name.startswith('language-'):
                    lang = class_name.replace('language-', '')
                    break
        return f'\n```{lang}\n{text.strip()}\n```\n'


# Compatibility for older imports.
CSDNConverter = ArticleMarkdownConverter


def _safe_url_for_log(url):
    """Return a URL without query strings or credentials for server logs."""
    try:
        parsed = urlsplit(str(url))
        host = parsed.hostname or '<unknown-host>'
        port = f':{parsed.port}' if parsed.port else ''
        path = parsed.path or '/'
        return urlunsplit((parsed.scheme.lower(), f'{host}{port}', path, '', ''))
    except (TypeError, ValueError, UnicodeError):
        return '<invalid-url>'


def _proxy_fake_ip_allowed():
    return bool(getattr(settings, 'WEB_IMPORT_ALLOW_PROXY_FAKE_IPS', False))


def _is_proxy_fake_ip(ip):
    return any(ip in network for network in PROXY_FAKE_IP_NETWORKS)


def _resolve_host(host, port):
    try:
        addresses = {
            result[4][0]
            for result in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
            if result[4]
        }
    except OSError as exc:
        raise WebParserError('无法解析网页地址，请确认域名有效。') from exc

    if not addresses:
        raise WebParserError('无法解析网页地址，请确认域名有效。')

    for address in addresses:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError as exc:
            raise WebParserError('网页地址解析结果无效。') from exc

        if _proxy_fake_ip_allowed() and _is_proxy_fake_ip(ip):
            continue
        if not ip.is_global:
            raise WebParserError('为保护服务器安全，不支持访问本机或内网地址。')
    return tuple(addresses)


def _response_peer_ip(response):
    """Best-effort lookup of the connected peer before reading its body."""
    raw = getattr(response, 'raw', None)
    connection = getattr(raw, '_connection', None) or getattr(raw, 'connection', None)
    socket_object = getattr(connection, 'sock', None)
    if socket_object is None:
        try:
            socket_object = raw._fp.fp.raw._sock
        except AttributeError:
            return None
    try:
        return socket_object.getpeername()[0]
    except (AttributeError, OSError, TypeError):
        return None


def _validate_connected_peer(response):
    peer_address = _response_peer_ip(response)
    if not peer_address:
        return
    try:
        peer_ip = ipaddress.ip_address(peer_address)
    except ValueError as exc:
        raise WebParserError('网页实际连接地址无效。') from exc
    if _proxy_fake_ip_allowed() and _is_proxy_fake_ip(peer_ip):
        return
    if not peer_ip.is_global:
        raise WebParserError('为保护服务器安全，实际连接指向了本机或内网地址。')


def _validate_fetch_url(url):
    if not isinstance(url, str) or not url.strip():
        raise WebParserError('请输入有效的网址。')

    value = url.strip()
    if len(value) > MAX_URL_LENGTH or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise WebParserError('网址格式无效。')

    try:
        parsed = urlsplit(value)
        scheme = parsed.scheme.lower()
        hostname = parsed.hostname
        port = parsed.port
    except (TypeError, ValueError, UnicodeError) as exc:
        raise WebParserError('网址格式无效。') from exc

    if scheme not in {'http', 'https'} or not hostname:
        raise WebParserError('仅支持 http:// 或 https:// 网页地址。')
    if parsed.username is not None or parsed.password is not None:
        raise WebParserError('网址不能包含用户名或密码。')

    normalized_host = hostname.rstrip('.').lower()
    if normalized_host in {'localhost', 'localhost.localdomain'} or normalized_host.endswith(
            ('.localhost', '.local', '.lan', '.internal')):
        raise WebParserError('为保护服务器安全，不支持访问本机或内网地址。')

    try:
        literal_ip = ipaddress.ip_address(hostname)
    except ValueError:
        literal_ip = None

    if literal_ip is not None:
        # Proxy synthetic ranges are allowed only when reached through a hostname.
        if not literal_ip.is_global:
            raise WebParserError('为保护服务器安全，不支持访问本机、内网或保留地址（直接 IP）。')
    else:
        _resolve_host(normalized_host, port or (443 if scheme == 'https' else 80))

    return urlunsplit((scheme, parsed.netloc, parsed.path or '/', parsed.query, ''))


def is_public_remote_url(url: str) -> bool:
    """Whether an external URL passes the same public-target checks as downloads."""
    try:
        _validate_fetch_url(url)
    except WebParserError:
        return False
    return True


def _read_response_body(response, max_bytes, size_error, byte_budget=None):
    headers = getattr(response, 'headers', {}) or {}
    content_length = headers.get('Content-Length')
    try:
        if content_length and int(content_length) > max_bytes:
            raise WebParserError(size_error)
    except (TypeError, ValueError):
        pass

    chunks = []
    total_size = 0
    iterator = getattr(response, 'iter_content', None)
    if callable(iterator):
        try:
            for chunk in iterator(chunk_size=64 * 1024):
                if not chunk:
                    continue
                if isinstance(chunk, str):
                    chunk = chunk.encode('utf-8')
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise WebParserError(size_error)
                if byte_budget is not None:
                    byte_budget.claim(len(chunk))
                chunks.append(chunk)
        except WebParserError:
            if byte_budget is not None and total_size:
                byte_budget.release(min(total_size, sum(map(len, chunks))))
            raise
        except (OSError, requests.RequestException) as exc:
            if byte_budget is not None and chunks:
                byte_budget.release(sum(map(len, chunks)))
            raise WebParserError('网页内容读取失败，请稍后重试。') from exc
        if chunks:
            return b''.join(chunks)

    content = getattr(response, 'content', b'') or b''
    if isinstance(content, str):
        content = content.encode('utf-8')
    if len(content) > max_bytes:
        raise WebParserError(size_error)
    if byte_budget is not None:
        byte_budget.claim(len(content))
    return content


def _fetch_resource(
        url,
        *,
        session=None,
        referer=None,
        max_bytes=MAX_RESPONSE_BYTES,
        accepted_content_types=None,
        size_error='网页内容过大，暂不支持导入。',
        byte_budget=None,
        deadline=None,
):
    current_url = _validate_fetch_url(url)
    headers = {
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
    if referer:
        headers['Referer'] = referer

    client = session or requests
    for redirect_count in range(MAX_REDIRECTS + 1):
        # Resolve again immediately before connecting, then verify the actual
        # peer before any response body is consumed.
        _validate_fetch_url(current_url)
        timeout = REQUEST_TIMEOUT
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise WebParserError('图片下载超时，已保留原始外链。')
            timeout = (max(min(REQUEST_TIMEOUT[0], remaining), 0.1),
                       max(min(REQUEST_TIMEOUT[1], remaining), 0.1))
        try:
            response = client.get(
                current_url,
                headers=headers,
                timeout=timeout,
                allow_redirects=False,
                stream=True,
            )
        except requests.RequestException as exc:
            raise WebParserError('网页访问失败，请确认链接可访问。') from exc

        try:
            _validate_connected_peer(response)
            status_code = int(response.status_code)
            if 300 <= status_code < 400:
                if redirect_count >= MAX_REDIRECTS:
                    raise WebParserError('网页重定向次数过多，无法导入。')
                location = (getattr(response, 'headers', {}) or {}).get('Location')
                if not location:
                    raise WebParserError('网页重定向地址无效。')
                current_url = _validate_fetch_url(urljoin(current_url, location))
                continue

            try:
                response.raise_for_status()
            except requests.RequestException as exc:
                raise WebParserError('网页返回错误，请确认链接可访问。') from exc

            content_type = str((getattr(response, 'headers', {}) or {}).get('Content-Type') or '')
            content_type = content_type.split(';', 1)[0].strip().lower()
            if accepted_content_types and content_type and not any(
                    content_type == accepted or content_type.startswith(f'{accepted}/')
                    for accepted in accepted_content_types):
                raise WebParserError('远程内容类型不受支持。')

            response_url = getattr(response, 'url', None)
            if isinstance(response_url, str) and response_url:
                current_url = _validate_fetch_url(response_url)
            return FetchedResource(
                final_url=current_url,
                content=_read_response_body(
                    response, max_bytes, size_error, byte_budget=byte_budget,
                ),
                content_type=content_type,
            )
        finally:
            close = getattr(response, 'close', None)
            if callable(close):
                close()

    raise WebParserError('网页重定向次数过多，无法导入。')


def _fetch_html(url, session=None):
    resource = _fetch_resource(
        url,
        session=session,
        max_bytes=MAX_RESPONSE_BYTES,
        size_error='网页内容超过 8 MB，暂不支持导入。',
    )
    if resource.content_type and resource.content_type not in HTML_CONTENT_TYPES:
        raise WebParserError('该链接不是 HTML 网页。')
    return resource.final_url, resource.content


def fetch_remote_image(
        url, *, session=None, referer=None, max_bytes=15 * 1024 * 1024,
        byte_budget=None, deadline=None,
):
    return _fetch_resource(
        url,
        session=session,
        referer=referer,
        max_bytes=max_bytes,
        accepted_content_types={'image'},
        size_error='图片超过 15 MB，已保留原始外链。',
        byte_budget=byte_budget,
        deadline=deadline,
    )


def clean_code_blocks(soup):
    for pre in soup.find_all('pre'):
        code_tag = pre.find('code')
        if not code_tag:
            continue
        classes = code_tag.get('class', [])
        if isinstance(classes, str):
            classes = [classes]
        lang = ''
        for class_name in classes:
            if class_name.startswith('language-'):
                lang = class_name.replace('language-', '')
                break
        code_content = code_tag.get_text()
        new_pre = soup.new_tag('pre')
        new_code = soup.new_tag('code')
        if lang:
            new_code['class'] = f'language-{lang}'
        new_code.string = code_content
        new_pre.append(new_code)
        pre.replace_with(new_pre)
    return soup


def _visible_text(html):
    soup = BeautifulSoup(html or '', 'html.parser')
    for tag in soup.find_all(['script', 'style', 'noscript', 'template', 'svg']):
        tag.decompose()
    return re.sub(r'\s+', ' ', soup.get_text(' ', strip=True)).strip()


def looks_like_login_or_block_page(html):
    """Detect an access/challenge page without rejecting normal login links."""
    raw_lower = (html or '').lower()
    visible_text = _visible_text(html)
    visible_lower = visible_text.lower()
    title = BeautifulSoup(html or '', 'html.parser').title
    title_text = title.get_text(' ', strip=True) if title else ''

    hard_markers = (
        'login_redirect', 'suite/passport', 'no_permission', 'access denied',
        'just a moment...', '请先登录', '请登录后', '登录后查看', '登录后访问',
        '登陆后查看', '安全验证', '人机验证', '身份验证', '需要验证',
    )
    if any(marker in raw_lower or marker in visible_lower for marker in hard_markers):
        return True

    challenge_title = re.search(r'(登录|登陆|验证|验证码|captcha|sign in)', title_text, re.IGNORECASE)
    if challenge_title and len(visible_text) <= 1500:
        return True
    if any(marker in visible_lower for marker in ('captcha', 'challenge')) and len(visible_text) <= 800:
        return True
    return False


def _best_srcset_url(srcset):
    candidates = []
    for index, part in enumerate((srcset or '').split(',')):
        fields = part.strip().split()
        if not fields:
            continue
        weight = index
        if len(fields) > 1:
            match = re.match(r'([0-9.]+)(w|x)$', fields[-1])
            if match:
                weight = float(match.group(1)) * (10000 if match.group(2) == 'x' else 1)
        candidates.append((weight, fields[0]))
    return max(candidates, default=(0, ''))[1]


def _normalize_lazy_images(soup, base_url):
    lazy_attributes = ('data-src', 'data-original', 'data-actualsrc', 'data-lazy-src', 'data-url')
    for image in soup.find_all('img'):
        source = ''
        for attribute in lazy_attributes:
            value = image.get(attribute)
            if isinstance(value, str) and value.strip() and not value.strip().startswith('data:'):
                source = value.strip()
                break
        if not source:
            source = _best_srcset_url(image.get('srcset'))
        if not source:
            source = str(image.get('src') or '').strip()
        if not source or source.startswith('data:'):
            image.decompose()
            continue
        absolute_url = urljoin(base_url, source)
        if urlsplit(absolute_url).scheme.lower() not in {'http', 'https'}:
            image.decompose()
            continue
        image['src'] = absolute_url
        for attribute in (*lazy_attributes, 'srcset'):
            image.attrs.pop(attribute, None)


def _strip_noise(soup):
    for comment in soup.find_all(string=lambda value: isinstance(value, Comment)):
        comment.extract()

    for tag in soup.find_all([
            'script', 'style', 'noscript', 'template', 'nav', 'header', 'footer',
            'aside', 'form', 'button', 'iframe', 'canvas', 'svg']):
        tag.decompose()

    for element in list(soup.find_all(True)):
        if element.parent is None:
            continue
        style = str(element.get('style') or '').replace(' ', '').lower()
        if element.has_attr('hidden') or str(element.get('aria-hidden') or '').lower() == 'true' \
                or 'display:none' in style or 'visibility:hidden' in style:
            element.decompose()
            continue
        identity = ' '.join([
            str(element.get('id') or ''),
            *[str(item) for item in element.get('class', [])],
        ])
        if identity and NOISE_ATTRIBUTE_RE.search(identity):
            element.decompose()


def _clean_content_soup(soup, base_url):
    _normalize_lazy_images(soup, base_url)
    _strip_noise(soup)

    for element in soup.find_all(True):
        for attribute in list(element.attrs):
            if attribute.lower().startswith('on'):
                del element.attrs[attribute]

        for attribute in ('href', 'src'):
            value = element.get(attribute)
            if not isinstance(value, str) or not value.strip():
                continue
            if value.startswith('#') and attribute == 'href':
                continue
            absolute_url = urljoin(base_url, value.strip())
            if urlsplit(absolute_url).scheme.lower() not in {'http', 'https'}:
                del element.attrs[attribute]
            else:
                element.attrs[attribute] = absolute_url
    return soup


def _decode_html(content):
    if not content:
        raise WebParserError('网页没有返回可读取的内容。')
    return str(BeautifulSoup(content, 'html.parser'))


def _site_adapter(hostname):
    normalized_host = (hostname or '').lower().rstrip('.')
    for adapter in SITE_ADAPTERS:
        if any(normalized_host == suffix.lstrip('.') or normalized_host.endswith(suffix)
               for suffix in adapter['host_suffixes']):
            return adapter
    return None


def _extract_title(soup, adapter, readability_title=''):
    if adapter:
        for selector in adapter['title_selectors']:
            element = soup.select_one(selector)
            if element and element.get_text(' ', strip=True):
                return re.sub(r'\s+', ' ', element.get_text(' ', strip=True))[:255]

    for attributes in ({'property': 'og:title'}, {'name': 'twitter:title'}):
        meta = soup.find('meta', attrs=attributes)
        value = str(meta.get('content') or '').strip() if meta else ''
        if value:
            return re.sub(r'\s+', ' ', value)[:255]

    title = readability_title
    if not title and soup.title:
        title = soup.title.get_text(' ', strip=True)
    title = re.sub(r'\s+', ' ', title or '').strip()
    title = re.sub(r'\s*[-_|]\s*CSDN博客\s*$', '', title, flags=re.IGNORECASE)
    if title:
        return title[:255]

    heading = soup.find('h1')
    if heading and heading.get_text(' ', strip=True):
        return re.sub(r'\s+', ' ', heading.get_text(' ', strip=True))[:255]
    return '未命名网页'


def _candidate_confidence(text_length, meaningful_blocks, link_density):
    if text_length >= 500 and meaningful_blocks >= 3 and link_density <= 0.25:
        return 'high'
    if (text_length >= 120 or meaningful_blocks >= 2) and link_density <= 0.45:
        return 'medium'
    return 'low'


def _build_candidate(fragment, source, source_bonus, base_url):
    soup = BeautifulSoup(str(fragment), 'html.parser')
    soup = _clean_content_soup(soup, base_url)
    soup = clean_code_blocks(soup)

    text = re.sub(r'\s+', ' ', soup.get_text(' ', strip=True)).strip()
    text_length = len(text)
    code_length = sum(len(tag.get_text()) for tag in soup.find_all(['pre', 'code']))
    meaningful_paragraphs = sum(
        1 for paragraph in soup.find_all('p')
        if len(re.sub(r'\s+', '', paragraph.get_text())) >= 20
    )
    heading_count = len(soup.find_all(['h1', 'h2', 'h3', 'h4']))
    rich_blocks = len(soup.find_all(['pre', 'table', 'figure', 'blockquote']))
    image_urls = tuple(dict.fromkeys(
        str(image.get('src')) for image in soup.find_all('img') if image.get('src')
    ))
    meaningful_blocks = meaningful_paragraphs + heading_count + rich_blocks + len(image_urls)
    link_text_length = sum(len(link.get_text(' ', strip=True)) for link in soup.find_all('a'))
    link_density = link_text_length / max(text_length, 1)

    # Chinese technical articles can carry substantial information in fewer
    # characters than Latin prose. Two meaningful paragraphs are sufficient
    # even when the aggregate character count is below the generic threshold.
    if (
        text_length < 120
        and code_length < 80
        and meaningful_paragraphs < 2
        and not (image_urls and text_length >= 40)
    ):
        return None

    score = (
        min(text_length, 20000)
        + min(meaningful_paragraphs, 30) * 150
        + min(heading_count, 10) * 100
        + min(rich_blocks, 20) * 120
        + min(len(image_urls), 20) * 60
        + source_bonus
        - link_text_length * 2
    )
    if link_density > 0.45:
        score -= 800

    converter = ArticleMarkdownConverter(heading_style='ATX')
    markdown = converter.convert_soup(soup).strip()
    if not markdown:
        return None

    return {
        'source': source,
        'markdown': markdown,
        'score': int(score),
        'confidence': _candidate_confidence(text_length, meaningful_blocks, link_density),
        'text_length': text_length,
        'meaningful_blocks': meaningful_blocks,
        'link_density': round(link_density, 4),
        'image_urls': image_urls,
    }


def _collect_candidates(html, final_url):
    page_soup = BeautifulSoup(html, 'html.parser')
    _normalize_lazy_images(page_soup, final_url)
    adapter = _site_adapter(urlsplit(final_url).hostname)
    raw_candidates = []

    if adapter:
        for selector in adapter['content_selectors']:
            for element in page_soup.select(selector)[:3]:
                raw_candidates.append((
                    f"site:{adapter['name']}:{selector}",
                    element,
                    int(adapter.get('source_bonus', 700)),
                ))

    selector_bonus = 500
    for selector in CONTENT_SELECTORS:
        for element in page_soup.select(selector)[:5]:
            raw_candidates.append((f'selector:{selector}', element, selector_bonus))
        selector_bonus = max(selector_bonus - 20, 300)

    readability_title = ''
    try:
        document = Document(str(page_soup))
        readability_title = (document.title() or '').strip()
        raw_candidates.append(('readability', document.summary(), 350))
    except Exception:
        logger.info('Readability candidate generation failed: url=%s', _safe_url_for_log(final_url))

    if page_soup.body:
        raw_candidates.append(('body-fallback', page_soup.body, 0))

    candidates = []
    seen_text = set()
    for source, fragment, bonus in raw_candidates:
        candidate = _build_candidate(fragment, source, bonus, final_url)
        if not candidate:
            continue
        normalized_markdown = re.sub(r'\s+', '', candidate['markdown'])
        fingerprint = hashlib.sha256(normalized_markdown.encode('utf-8')).hexdigest()
        if fingerprint in seen_text:
            continue
        seen_text.add(fingerprint)
        candidates.append(candidate)

    candidates.sort(key=lambda item: item['score'], reverse=True)
    finalized = tuple(
        WebContentCandidate(candidate_id=f'candidate_{index}', **candidate)
        for index, candidate in enumerate(candidates[:6], start=1)
    )
    return page_soup, adapter, readability_title, finalized


def extract_web_content(url, session=None):
    """Fetch a static HTML page and return ranked article-content candidates."""
    safe_url = _safe_url_for_log(url)
    try:
        final_url, body = _fetch_html(url, session=session)
        html = _decode_html(body)
        if looks_like_login_or_block_page(html):
            raise WebParserError('页面需要登录、授权或验证后才能读取正文内容。')

        page_soup, adapter, readability_title, candidates = _collect_candidates(html, final_url)
        if not candidates:
            raise WebParserError('未识别到有效正文；页面可能需要浏览器执行 JavaScript 后才能显示内容。')

        return ParsedWebContent(
            title=_extract_title(page_soup, adapter, readability_title),
            final_url=final_url,
            candidates=candidates,
        )
    except WebParserError as exc:
        logger.info('Web page import rejected: url=%s reason=%s', safe_url, exc)
        raise
    except Exception as exc:
        logger.exception('Failed to parse web page: url=%s error_type=%s', safe_url, type(exc).__name__)
        raise WebParserError('网页内容解析失败，请稍后重试。') from exc


def extract_html_content(html, source_url=''):
    """Extract article candidates from an already-rendered HTML document."""
    if not html:
        raise WebParserError('HTML 文件没有可读取的内容。')
    base_url = source_url if isinstance(source_url, str) and source_url.startswith(
        ('http://', 'https://')
    ) else 'https://imported.local/'
    try:
        page_soup, adapter, readability_title, candidates = _collect_candidates(html, base_url)
        if not candidates:
            raise WebParserError('HTML 文件中未识别到有效正文。')
        return ParsedWebContent(
            title=_extract_title(page_soup, adapter, readability_title),
            final_url=base_url,
            candidates=candidates,
        )
    except WebParserError:
        raise
    except Exception as exc:
        raise WebParserError('HTML 文件解析失败。') from exc


def parse_web_content(url):
    """Backwards-compatible wrapper returning ``(title, markdown_content)``."""
    parsed = extract_web_content(url)
    return parsed.title, parsed.best_candidate.markdown
