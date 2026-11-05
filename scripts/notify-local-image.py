#!/usr/bin/env python3
"""Send a best-effort, HTTPS-only notification when the local image is ready."""

import http.client
import ipaddress
import json
import os
import socket
import ssl
import sys
from urllib.parse import urlsplit


def send_notification(url: str, payload: dict) -> None:
    target = urlsplit(url)
    if target.scheme != "https" or not target.hostname or target.username or target.password or target.fragment:
        raise ValueError("Webhook must be an HTTPS URL without credentials or a fragment")
    port = target.port or 443
    addresses = socket.getaddrinfo(target.hostname, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError("Webhook must resolve only to public IP addresses")

    # Connect to a validated IP directly while checking the certificate against the hostname.
    # HTTP redirects are not followed, so they cannot bypass destination validation.
    ip = addresses[0][4][0]
    conn = http.client.HTTPSConnection(target.hostname, port, timeout=10, context=ssl.create_default_context())
    conn._create_connection = lambda _address, timeout, source_address=None: socket.create_connection(
        (ip, port), timeout, source_address
    )
    path = target.path or "/"
    if target.query:
        path += "?" + target.query
    try:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        conn.request("POST", path, body, {"Content-Type": "application/json"})
        response = conn.getresponse()
        if not 200 <= response.status < 300:
            raise ValueError(f"Webhook returned HTTP {response.status}")
    finally:
        conn.close()


def main() -> int:
    payload = {
        "event": "local_image_ready",
        "image": os.environ["TCR_LOCAL_IMAGE"],
        "version": os.environ.get("TCR_BUILD_VERSION", "unknown"),
        "commit": os.environ.get("TCR_BUILD_COMMIT", "unknown"),
        "platform": os.environ.get("TCR_PLATFORM", "linux/amd64"),
    }
    try:
        send_notification(os.environ["TCR_BUILD_WEBHOOK_URL"], payload)
    except (OSError, ValueError, http.client.HTTPException):
        # Do not expose URLs, tokens, addresses, or response bodies in CI logs.
        print("Webhook 通知未成功，请检查地址、网络和接收端。", file=sys.stderr)
        return 1
    print("本地镜像就绪通知已发送。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
