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
    def run_script(self, fail_build=False, fail_notification=False, fail_push=False, wrong_image=False, no_extra=False):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            log = directory / "calls"
            docker = directory / "docker"
            docker.write_text('#!/bin/sh\necho "docker $*" >> "$CALL_LOG"\n'
                              '[ "$1" = login ] && cat >/dev/null\n'
                              '[ "$FAIL_PUSH" = 1 ] && [ "$1" = push ] && exit 1\n'
                              '[ "$FAIL_BUILD" = 1 ] && [ "$1" = buildx ] && exit 1\n'
                              'if [ "$1" = buildx ]; then\n'
                              '  while [ "$#" -gt 0 ]; do\n'
                              '    if [ "$1" = --iidfile ]; then shift; echo sha256:testimage > "$1"; break; fi\n'
                              '    shift\n  done\nfi\n'
                              'if [ "$1" = image ] && [ "$2" = inspect ]; then echo "${INSPECT_ID:-sha256:testimage}"; fi\n'
                              'exit 0\n')
            docker.chmod(0o755)
            python = directory / "python3"
            python.write_text('#!/bin/sh\necho "notify $TCR_LOCAL_IMAGE" >> "$CALL_LOG"\nexit "$FAIL_NOTIFICATION"\n')
            python.chmod(0o755)
            env = {**os.environ, "PATH": f"{tmp}:/usr/bin:/bin", "CALL_LOG": str(log),
                   "CI": "true", "TCR_USERNAME": "user", "TCR_PASSWORD": "secret", "TCR_IMAGE": "example.com/o-doc:latest",
                   "TCR_BUILD_WEBHOOK_URL": "https://example.com/secret", "TCR_EXTRA_TAGS": "" if no_extra else "example.com/o-doc:v1",
                   "INSPECT_ID": "sha256:oldimage" if wrong_image else "sha256:testimage",
                   "FAIL_BUILD": str(int(fail_build)), "FAIL_NOTIFICATION": str(int(fail_notification)),
                   "FAIL_PUSH": str(int(fail_push))}
            (directory / "scripts").mkdir()
            script = directory / "scripts/push-tcr.sh"
            script.write_text((ROOT / "scripts/push-tcr.sh").read_text())
            result = subprocess.run(["/bin/bash", str(script)], env=env,
                                    capture_output=True, text=True, errors="replace")
            calls = log.read_text().splitlines()
            return result, calls

    def test_ready_precedes_notification_and_push(self):
        result, calls = self.run_script(fail_notification=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--load", calls[0])
        self.assertIn("docker tag sha256:testimage example.com/o-doc:latest", calls)
        self.assertIn("docker tag sha256:testimage example.com/o-doc:v1", calls)
        self.assertNotIn("local-ready", " ".join(calls))
        self.assertLess(calls.index("notify example.com/o-doc:latest"), calls.index("docker login ccr.ccs.tencentyun.com --username user --password-stdin"))
        self.assertEqual(len([c for c in calls if c.startswith("docker push")]), 2)
        self.assertNotIn("secret", result.stdout + result.stderr)

    def test_failed_build_does_not_notify_or_push(self):
        result, calls = self.run_script(fail_build=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 1)

    def test_wrong_local_tag_does_not_notify_or_push(self):
        result, calls = self.run_script(wrong_image=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("与本次构建不一致", result.stderr)
        self.assertFalse(any(call.startswith(("notify", "docker push")) for call in calls))

    def test_manual_run_without_extra_tags_publishes_latest(self):
        result, calls = self.run_script(no_extra=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call for call in calls if call.startswith("docker push")],
                         ["docker push example.com/o-doc:latest"])

    def test_failed_push_is_reported_after_local_ready(self):
        result, calls = self.run_script(fail_push=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("notify example.com/o-doc:latest", calls)
        self.assertIn("docker push example.com/o-doc:latest", calls)
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
        with mock.patch.object(notify.subprocess, "run") as run, \
             mock.patch.object(notify.socket, "getaddrinfo", side_effect=AssertionError("Python DNS should not be used")):
            run.return_value = subprocess.CompletedProcess([], 0, b'{"code":0}\n200', b'')
            notify.send_notification("https://open.feishu.cn/hook", {}, True)
            run.return_value.stdout = b'{"code":19024,"msg":"sensitive"}\n200'
            with self.assertRaisesRegex(notify.NotificationError, "19024") as raised:
                notify.send_notification("https://open.feishu.cn/hook", {}, True)
            self.assertNotIn("sensitive", str(raised.exception))
            run.return_value.stdout = b'not json\n200'
            with self.assertRaisesRegex(notify.NotificationError, "响应格式"):
                notify.send_notification("https://open.feishu.cn/hook", {}, True)

    def test_curl_keeps_secrets_off_arguments_and_checks_failures(self):
        url = 'https://open.feishu.cn/open-apis/bot/v2/hook/private-token'
        with mock.patch.object(notify.subprocess, "run") as run:
            run.return_value = subprocess.CompletedProcess([], 0, b'{"code":0}\n200', b'')
            notify.send_feishu_curl(url, {"text": '测试 "quote" \\ newline\n'})
            args = run.call_args.args[0]
            self.assertNotIn(url, args)
            self.assertNotIn("--insecure", args)
            self.assertNotIn("--location", args)
            self.assertIn("private-token", run.call_args.kwargs["input"].decode())
            run.return_value = subprocess.CompletedProcess([], 60, b'', b'private-token')
            with self.assertRaisesRegex(notify.NotificationError, "证书校验失败") as raised:
                notify.send_feishu_curl(url, {})
            self.assertNotIn("private-token", str(raised.exception))
            run.return_value = subprocess.CompletedProcess([], 0, b'private-token\n302', b'')
            with self.assertRaisesRegex(notify.NotificationError, "HTTP 状态码 302"):
                notify.send_feishu_curl(url, {})

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

    def test_linux_loads_system_ca_without_overriding_explicit_trust(self):
        with mock.patch.object(notify.sys, "platform", "linux"), \
             mock.patch.object(notify.Path, "is_file", return_value=True), \
             mock.patch.object(notify.ssl, "create_default_context") as create, \
             mock.patch.dict(os.environ, {}, clear=True):
            notify.ssl_context()
            create.return_value.load_verify_locations.assert_called_once_with(cafile="/etc/ssl/certs/ca-certificates.crt")
            create.return_value.load_verify_locations.reset_mock()
            os.environ["SSL_CERT_FILE"] = "/custom/trust.pem"
            notify.ssl_context()
            create.return_value.load_verify_locations.assert_not_called()

    def test_certificate_error_logs_safe_reason(self):
        exc = notify.ssl.SSLCertVerificationError(1, "private-webhook-token")
        exc.verify_code = 20
        output = io.StringIO()
        with mock.patch.dict(os.environ, {"TCR_BUILD_WEBHOOK_URL": "https://open.feishu.cn/hook/token"}, clear=True), \
             mock.patch.object(notify.sys, "argv", ["notify-local-image.py", "--test"]), \
             mock.patch.object(notify, "send_notification", side_effect=exc), contextlib.redirect_stderr(output):
            self.assertEqual(notify.main(), 1)
        self.assertIn("code=20", output.getvalue())
        self.assertNotIn("private-webhook-token", output.getvalue())

    def test_generic_http_client_serializes_chinese_message(self):
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
            notify.send_notification("https://open.feishu.cn/open-apis/bot/v2/hook/test", payload)
        connect.assert_called_once_with(("8.8.8.8", 443), 10, None)
        context.wrap_socket.assert_called_once_with(sock, server_hostname="open.feishu.cn")
        sent = b"".join(call.args[0] for call in sock.sendall.call_args_list)
        self.assertIn("本地镜像已就绪".encode("utf-8"), sent)


if __name__ == "__main__":
    unittest.main()
