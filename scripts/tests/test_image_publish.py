import importlib.util
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


if __name__ == "__main__":
    unittest.main()
