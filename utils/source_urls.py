"""Source URL parsing shared by search, draft validation and publication."""
import ipaddress
import re
from urllib.parse import unquote, urlsplit

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from utils.markdown_links import normalize_link_uri, single_link_target

SOURCE_URL_MAX_LENGTH = 2048


def normalize_source_url(value: str, *, field: str = 'source_url', required: bool = True) -> str:
    if not isinstance(value, str):
        raise ValueError(f'{field} 必须是 HTTP(S) URL')
    value = value.strip()
    if not value and not required:
        return ''
    if value.startswith('['):
        target = single_link_target(value)
        if target is None:
            raise ValueError(f'{field} 必须是完整的 Markdown HTTP(S) 链接')
        value = target
    try:
        if re.search(r'[\s\x00-\x1f\x7f<>\\]', value):
            raise ValueError()
        value = normalize_link_uri(value)
        url = urlsplit(value)
        host = (url.hostname or '').lower().rstrip('.')
        if url.scheme not in ('http', 'https') or not host or url.username or url.password:
            raise ValueError()
        if host == 'localhost' or host.endswith(('.local', '.internal')):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError()
        url.port  # Reject malformed/out-of-range ports before persistence.
        # Keep path, empty query markers, query order/values and fragment intact.
        # urlunsplit/parse_qsl would silently remove or reorder meaningful data.
        suffix = value[len(url.scheme) + 3 + len(url.netloc):]
        result = url.scheme.lower() + '://' + url.netloc.lower() + suffix
        # Parentheses in paths must not break generated Markdown references.
        result = result.replace('(', '%28').replace(')', '%29')
        result = re.sub(r'%[0-9a-fA-F]{2}', lambda match: match[0].upper(), result)
        if len(result) <= SOURCE_URL_MAX_LENGTH:
            URLValidator(schemes=['http', 'https'])(result)
    except (ValueError, TypeError, ValidationError):
        raise ValueError(f'{field} 必须是有效的公开 HTTP(S) URL') from None
    if len(result) > SOURCE_URL_MAX_LENGTH:
        raise ValueError(f'{field} 规范化后长度不能超过 {SOURCE_URL_MAX_LENGTH} 字符（当前 {len(result)}）')
    return result


def canonical_url(value: str) -> str:
    """Search and duplicate checks discard invalid sources without accepting them."""
    try:
        return normalize_source_url(value)
    except ValueError:
        return ''


def duplicate_source_key(value: str) -> str:
    """Tracking-insensitive anti-repeat key, never used to authorize/store sources."""
    normalized = canonical_url(value)
    document = normalized.split('#', 1)[0]
    path, separator, query = document.partition('?')
    if not separator:
        return document
    parts = query.split('&')
    kept = [part for part in parts if not (
        unquote(part.split('=', 1)[0]).lower().startswith('utm_')
        or unquote(part.split('=', 1)[0]).lower() in {'fbclid', 'gclid'})]
    return path + ('?' + '&'.join(kept) if kept else '')
