import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("notify_local_image", ROOT / "scripts/notify-local-image.py")
notify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notify)


class PublishTests(unittest.TestCase):
    def run_script(self, fail_build=False, fail_notification=False, fail_push=False):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            log = directory / "calls"
            docker = directory / "docker"
            docker.write_text('#!/bin/sh\necho "docker $*" >> "$CALL_LOG"\n'
                              '[ "$1" = login ] && cat >/dev/null\n'
                              '[ "$FAIL_PUSH" = 1 ] && [ "$1" = push ] && exit 1\n'
                              '[ "$FAIL_BUILD" = 1 ] && [ "$1" = buildx ] && exit 1\nexit 0\n')
            docker.chmod(0o755)
            python = directory / "python3"
            python.write_text('#!/bin/sh\necho "notify" >> "$CALL_LOG"\nexit "$FAIL_NOTIFICATION"\n')
            python.chmod(0o755)
            env = {**os.environ, "PATH": f"{tmp}:/usr/bin:/bin", "CALL_LOG": str(log),
                   "CI": "true", "TCR_USERNAME": "user", "TCR_PASSWORD": "secret",
                   "TCR_BUILD_WEBHOOK_URL": "https://example.com/secret", "TCR_EXTRA_TAGS": "example.com/o-doc:v1",
                   "FAIL_BUILD": str(int(fail_build)), "FAIL_NOTIFICATION": str(int(fail_notification)),
                   "FAIL_PUSH": str(int(fail_push))}
            result = subprocess.run(["/bin/bash", str(ROOT / "scripts/push-tcr.sh")], env=env,
                                    capture_output=True, text=True, errors="replace")
            calls = log.read_text().splitlines()
            return result, calls

    def test_ready_precedes_notification_and_push(self):
        result, calls = self.run_script(fail_notification=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--load", calls[0])
        self.assertTrue(calls[1].startswith("docker image inspect o-doc:local-ready"))
        self.assertEqual(calls[2], "notify")
        self.assertTrue(calls[3].startswith("docker login"))
        self.assertEqual(len([c for c in calls if c.startswith("docker push")]), 2)
        self.assertNotIn("secret", result.stdout + result.stderr)

    def test_failed_build_does_not_notify_or_push(self):
        result, calls = self.run_script(fail_build=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 1)

    def test_failed_push_is_reported_after_local_ready(self):
        result, calls = self.run_script(fail_push=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls[2], "notify")
        self.assertTrue(calls[4].startswith("docker push"))
        self.assertIn("本地镜像已就绪", result.stdout)

    def test_webhook_rejects_private_or_non_https_destinations(self):
        for url in ("http://example.com", "https://user:pass@example.com"):
            with self.assertRaises(ValueError):
                notify.send_notification(url, {})
        with mock.patch.object(notify.socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 443))]):
            with self.assertRaises(ValueError):
                notify.send_notification("https://example.com", {})

    def test_webhook_sends_payload_and_does_not_follow_redirects(self):
        addresses = [(2, 1, 6, "", ("8.8.8.8", 443))]
        with mock.patch.object(notify.socket, "getaddrinfo", return_value=addresses), \
             mock.patch.object(notify.http.client, "HTTPSConnection") as factory:
            conn = factory.return_value
            conn.getresponse.return_value.status = 204
            notify.send_notification("https://example.com/hook?token=abc", {"event": "local_image_ready"})
            args = conn.request.call_args.args
            self.assertEqual(args[0:2], ("POST", "/hook?token=abc"))
            self.assertEqual(args[2], b'{"event": "local_image_ready"}')
            conn.getresponse.return_value.status = 302
            with self.assertRaises(ValueError):
                notify.send_notification("https://example.com/hook", {})

    def test_feishu_payload_and_optional_signature(self):
        info = {"image": "o-doc:local-ready", "version": "v1.6.6", "commit": "abc", "platform": "linux/amd64"}
        self.assertTrue(notify.is_feishu("https://open.feishu.cn/open-apis/bot/v2/hook/token"))
        self.assertEqual(notify.notification_payload(info, False)["event"], "local_image_ready")
        with mock.patch.object(notify.time, "time", return_value=1599360473):
            payload = notify.notification_payload(info, True, "test-secret", "更新提醒")
        self.assertEqual(payload["msg_type"], "text")
        self.assertIn("更新提醒", payload["content"]["text"])
        self.assertIn("v1.6.6", payload["content"]["text"])
        self.assertEqual(payload["timestamp"], "1599360473")
        self.assertEqual(payload["sign"], "wSds2BzzFIIGf/WrhUO+NI1q/9j+FRJd3JNHKAq0NZY=")
        self.assertNotIn("timestamp", notify.notification_payload(info, True))

    def test_feishu_checks_application_status_on_http_success(self):
        addresses = [(2, 1, 6, "", ("8.8.8.8", 443))]
        with mock.patch.object(notify.socket, "getaddrinfo", return_value=addresses), \
             mock.patch.object(notify.http.client, "HTTPSConnection") as factory:
            conn = factory.return_value
            conn.getresponse.return_value.status = 200
            conn.getresponse.return_value.read.return_value = json.dumps({"code": 0}).encode()
            notify.send_notification("https://open.feishu.cn/hook", {}, True)
            conn.getresponse.return_value.read.return_value = b'{"code":19024,"msg":"sensitive"}'
            with self.assertRaisesRegex(notify.NotificationError, "19024") as raised:
                notify.send_notification("https://open.feishu.cn/hook", {}, True)
            self.assertNotIn("sensitive", str(raised.exception))
            conn.getresponse.return_value.read.return_value = b'not json'
            with self.assertRaisesRegex(notify.NotificationError, "响应格式"):
                notify.send_notification("https://open.feishu.cn/hook", {}, True)

    def test_malformed_url_errors_do_not_include_secret(self):
        for url in ("https://open.feishu.cn/hook/secret中文", "https://open.feishu.cn:secret/hook",
                    "https://open.feishu.cn/hook/secret\n"):
            with self.subTest(url=url), self.assertRaises(notify.NotificationError) as raised:
                notify.parse_target(url)
            self.assertNotIn("secret", str(raised.exception))

    def test_config_check_does_not_connect_or_need_image(self):
        with mock.patch.dict(os.environ, {"TCR_BUILD_WEBHOOK_URL": "https://open.feishu.cn/hook/token"}, clear=True), \
             mock.patch.object(notify.sys, "argv", ["notify-local-image.py", "--check-config"]), \
             mock.patch.object(notify, "send_notification") as send, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(notify.main(), 0)
            send.assert_not_called()

    def test_manual_test_needs_no_image_and_reports_delivery_failure(self):
        with mock.patch.dict(os.environ, {"TCR_BUILD_WEBHOOK_URL": "https://open.feishu.cn/hook/token"}, clear=True), \
             mock.patch.object(notify.sys, "argv", ["notify-local-image.py", "--test"]), \
             mock.patch.object(notify, "send_notification") as send, \
             contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(notify.main(), 0)
            payload = send.call_args.args[1]
            self.assertIn("通知测试", payload["content"]["text"])
            self.assertNotIn("本地镜像已就绪", payload["content"]["text"])
            send.side_effect = notify.NotificationError("飞书错误码 19024")
            self.assertEqual(notify.main(), 1)

    def test_failure_location_does_not_expose_exception_message(self):
        try:
            raise ValueError("private-webhook-token")
        except ValueError as exc:
            description = notify.failure_location(exc)
        self.assertIn("ValueError", description)
        self.assertIn("test_image_publish.py", description)
        self.assertNotIn("private-webhook-token", description)

    def test_real_http_client_serializes_chinese_feishu_message(self):
        addresses = [(2, 1, 6, "", ("8.8.8.8", 443))]
        sock = mock.MagicMock()
        sock.makefile.return_value = io.BytesIO(b'HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n{"code":0}')
        context = mock.MagicMock()
        context.wrap_socket.return_value = sock
        info = {"image": "o-doc:local-ready", "version": "v1.6.7", "commit": "abc", "platform": "linux/amd64"}
        payload = notify.notification_payload(info, True)
        with mock.patch.object(notify.socket, "getaddrinfo", return_value=addresses), \
             mock.patch.object(notify.socket, "create_connection", return_value=sock) as connect, \
             mock.patch.object(notify.ssl, "create_default_context", return_value=context):
            notify.send_notification("https://open.feishu.cn/open-apis/bot/v2/hook/test", payload, True)
        connect.assert_called_once_with(("8.8.8.8", 443), 10, None)
        context.wrap_socket.assert_called_once_with(sock, server_hostname="open.feishu.cn")
        sent = b"".join(call.args[0] for call in sock.sendall.call_args_list)
        self.assertIn("本地镜像已就绪".encode("utf-8"), sent)


if __name__ == "__main__":
    unittest.main()
