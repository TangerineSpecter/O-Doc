"""Resolve and pin an explicitly configured connector destination before sending secrets."""
import ipaddress
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from urllib.parse import urlsplit

from rest_framework.exceptions import ValidationError

from quant.research.web_source import PinnedHTTP

_dns = ThreadPoolExecutor(max_workers=2, thread_name_prefix='quant-connector-dns')
_dns_slots = threading.BoundedSemaphore(2)
_metadata_addresses = {ipaddress.ip_address('100.100.100.200'), ipaddress.ip_address('fd00:ec2::254')}
_nat64_prefix = ipaddress.ip_network('64:ff9b::/96')


def target(url: str, deadline: float) -> tuple[str, str, int, str]:
    try:
        parts = urlsplit(url)
        host = (parts.hostname or '').rstrip('.').encode('idna').decode('ascii').lower()
        port = parts.port if parts.port is not None else (443 if parts.scheme == 'https' else 80)
        if parts.scheme not in ('http', 'https') or not host or port == 0 or parts.username is not None or parts.password is not None:
            raise ValueError()
    except (ValueError, UnicodeError) as exc:
        raise ValidationError('接口地址格式无效') from exc
    if host in ('metadata.google.internal', 'instance-data.ec2.internal') or host.endswith('.metadata.google.internal'):
        raise ValidationError('不能使用云主机元数据接口')
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValidationError('接口域名解析超时')
    if not _dns_slots.acquire(blocking=False):
        raise ValidationError('接口域名解析暂时繁忙，请稍后重试')
    try:
        future = _dns.submit(socket.getaddrinfo, host, port, type=socket.SOCK_STREAM)
    except BaseException:
        _dns_slots.release()
        raise
    future.add_done_callback(lambda _: _dns_slots.release())
    try:
        addresses = {entry[4][0] for entry in future.result(timeout=remaining) if entry[4]}
        for ip in addresses:
            address = ipaddress.ip_address(ip)
            if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
                address = address.ipv4_mapped
            elif isinstance(address, ipaddress.IPv6Address) and address in _nat64_prefix:
                address = ipaddress.IPv4Address(int(address) & 0xffffffff)
            if address.is_link_local or address.is_unspecified or address.is_multicast or address in _metadata_addresses:
                raise ValidationError('接口地址不能是链路本地、组播或未指定地址')
        if not addresses:
            raise ValueError()
    except (OSError, ValueError, FutureTimeout) as exc:
        future.cancel()
        raise ValidationError('接口域名无法解析或解析超时') from exc
    return parts.scheme, host, port, sorted(addresses)[0]


def open_connection(url: str, deadline: float) -> PinnedHTTP:
    scheme, host, port, ip = target(url, deadline)
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValidationError('接口请求超时')
    return PinnedHTTP(host, port, ip, remaining, scheme == 'https')
