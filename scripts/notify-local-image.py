#!/usr/bin/env python3
"""Send a best-effort, HTTPS-only notification when the local image is ready."""

import base64
import hashlib
import hmac
import http.client
import ipaddress
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import time
from urllib.parse import urlsplit


class NotificationError(ValueError):
    pass


def failure_location(exc: Exception) -> str:
    trace = exc.__traceback__
    if trace is None:
        return type(exc).__name__
    while trace.tb_next is not None:
        trace = trace.tb_next
    code = trace.tb_frame.f_code
    # Do not include exception messages, source lines, or local variables: any can contain secrets.
    return f"{type(exc).__name__}，{Path(code.co_filename).name}:{trace.tb_lineno}/{code.co_name}"


def ssl_context():
    context = ssl.create_default_context()
    # Self-hosted runners may use a Python whose OpenSSL defaults point to a
    # separate/obsolete bundle. Also trust the host's maintained CA bundle.
    # Explicit OpenSSL trust configuration continues to take precedence.
    system_bundle = Path("/etc/ssl/certs/ca-certificates.crt")
    if sys.platform.startswith("linux") and not (os.environ.get("SSL_CERT_FILE") or os.environ.get("SSL_CERT_DIR")):
        if system_bundle.is_file():
            context.load_verify_locations(cafile=str(system_bundle))
    return context


def parse_target(url: str):
    if any(character.isspace() or ord(character) < 32 for character in url):
        raise NotificationError("Webhook 地址包含空格或换行，请重新复制完整机器人地址")
    if not url.isascii():
        raise NotificationError("Webhook 地址包含非 ASCII 字符，请检查中文标点或误粘贴的说明文字")
    try:
        target = urlsplit(url)
        port = target.port
    except ValueError:
        raise NotificationError("Webhook 地址结构或端口无效，请重新复制完整机器人地址") from None
    if port == 0:
        raise NotificationError("Webhook 端口不能为 0")
    if target.scheme != "https" or not target.hostname or target.username or target.password or target.fragment:
        raise NotificationError("地址必须是 HTTPS，且不能包含用户凭据或片段")
    return target


def is_feishu(url: str) -> bool:
    return parse_target(url).hostname in {"open.feishu.cn", "open.larksuite.com"}


def notification_payload(info: dict, feishu: bool, secret: str = "", keyword: str = "", test: bool = False) -> dict:
    if not feishu:
        return {"event": "notification_test" if test else "local_image_ready", **info}
    lines = ["O-Doc 通知测试", "这是一条连通性测试消息，不表示新的镜像构建完成。"] if test else ["O-Doc 本地镜像已就绪", f"镜像：{info['image']}",
             f"版本：{info['version']}", f"提交：{info['commit']}",
             f"平台：{info['platform']}", "可手动升级；云端推送随后继续。"]
    if keyword:
        lines.insert(1, keyword)
    payload = {"msg_type": "text", "content": {"text": "\n".join(lines)}}
    if secret:
        timestamp = str(int(time.time()))
        key = f"{timestamp}\n{secret}".encode("utf-8")
        payload["timestamp"] = timestamp
        payload["sign"] = base64.b64encode(hmac.new(key, digestmod=hashlib.sha256).digest()).decode("ascii")
    return payload


def check_feishu_response(body: bytes) -> None:
    try:
        result = json.loads(body)
        code = result.get("code") if isinstance(result, dict) else None
    except (UnicodeError, json.JSONDecodeError):
        code = None
    if type(code) is not int:
        raise NotificationError("飞书响应格式无效")
    if code != 0:
        reasons = {19021: "签名校验失败或服务器时间不准确", 19022: "IP 白名单校验失败",
                   19024: "消息未包含机器人配置的关键词"}
        raise NotificationError(f"飞书错误码 {code}：{reasons.get(code, '请检查机器人配置')}")


def send_feishu_curl(url: str, payload: dict) -> None:
    if not is_feishu(url):
        raise NotificationError("飞书发送仅支持飞书或 Lark 官方机器人域名")

    def quoted(value: str) -> str:
        return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'

    # Keep the webhook token and signed payload off command arguments and logs.
    # curl handles proxy, DNS and CA configuration from the runner environment.
    config = f"url = {quoted(url)}\ndata-binary = {quoted(json.dumps(payload))}\n"
    try:
        result = subprocess.run(
            ["curl", "--disable", "--silent", "--show-error", "--globoff", "--proto", "=https",
             "--connect-timeout", "5", "--max-time", "15", "--request", "POST",
             "--header", "Content-Type: application/json", "--write-out", "\n%{http_code}", "--config", "-"],
            input=config.encode("utf-8"), capture_output=True, timeout=20,
        )
    except FileNotFoundError:
        raise NotificationError("Runner 未安装 curl") from None
    except subprocess.TimeoutExpired:
        raise NotificationError("curl 通知超时") from None
    if result.returncode:
        reasons = {5: "代理域名解析失败", 6: "目标域名解析失败", 7: "连接失败", 28: "请求超时",
                   35: "TLS 握手失败", 60: "证书校验失败", 77: "CA 证书文件不可用"}
        raise NotificationError(f"curl 错误码 {result.returncode}：{reasons.get(result.returncode, '请求失败')}")
    body, _, status = result.stdout.rpartition(b"\n")
    if len(status) != 3 or not status.isdigit():
        raise NotificationError("curl 未返回有效的 HTTP 状态码")
    if not 200 <= int(status) < 300:
        raise NotificationError(f"HTTP 状态码 {int(status)}")
    check_feishu_response(body)


def send_notification(url: str, payload: dict, feishu: bool = False) -> None:
    target = parse_target(url)
    if feishu:
        send_feishu_curl(url, payload)
        return
    port = target.port or 443
    addresses = socket.getaddrinfo(target.hostname, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise NotificationError("地址必须只解析到公网 IP")

    # Connect to a validated IP directly while checking the certificate against the hostname.
    # HTTP redirects are not followed, so they cannot bypass destination validation.
    ip = addresses[0][4][0]
    conn = http.client.HTTPSConnection(target.hostname, port, timeout=10, context=ssl_context())
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
            raise NotificationError(f"HTTP 状态码 {response.status}")
    finally:
        conn.close()


def main() -> int:
    stage = "读取配置"
    try:
        url = os.environ["TCR_BUILD_WEBHOOK_URL"]
        feishu = is_feishu(url)
        if sys.argv[1:] == ["--check-config"]:
            print(f"{'飞书' if feishu else '通用'} Webhook 地址格式检查通过（未联网、未发送）。")
            return 0
        test = sys.argv[1:] == ["--test"]
        info = {
            "image": "" if test else os.environ["TCR_LOCAL_IMAGE"],
            "version": os.environ.get("TCR_BUILD_VERSION", "unknown"),
            "commit": os.environ.get("TCR_BUILD_COMMIT", "unknown"),
            "platform": os.environ.get("TCR_PLATFORM", "linux/amd64"),
        }
        stage = "生成消息"
        payload = notification_payload(info, feishu, os.environ.get("TCR_BUILD_WEBHOOK_SECRET", ""),
                                       os.environ.get("TCR_BUILD_WEBHOOK_KEYWORD", ""), test)
        stage = "发送及读取响应"
        send_notification(url, payload, feishu)
    except NotificationError as exc:
        # These messages are generated locally and do not contain the URL or response body.
        print(f"Webhook 通知未成功：{exc}", file=sys.stderr)
        return 1
    except ssl.SSLCertVerificationError as exc:
        reasons = {9: "证书尚未生效，请检查 Runner 时间", 10: "证书已过期或 Runner 时间不准确",
                   18: "证书为自签名", 19: "证书链含未受信任的自签名证书",
                   20: "找不到受信任的签发机构", 21: "无法验证证书链", 62: "证书域名不匹配"}
        code = exc.verify_code
        print(f"Webhook 通知未成功：TLS 证书校验失败（code={code}，{reasons.get(code, '请检查 Runner 的 CA 信任和时间')}）。", file=sys.stderr)
        return 1
    except (ValueError, KeyError) as exc:
        print(f"Webhook 通知未成功：{stage}异常（{failure_location(exc)}）。", file=sys.stderr)
        return 1
    except (OSError, http.client.HTTPException) as exc:
        print(f"Webhook 通知未成功：DNS、网络连接或 TLS 错误（{failure_location(exc)}）。", file=sys.stderr)
        return 1
    print("测试通知已发送。" if test else "本地镜像就绪通知已发送。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
