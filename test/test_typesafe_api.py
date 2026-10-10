"""TypeSafe 调用测试，不加载 Django、不访问数据库。

离线测试：.venv/bin/python -m unittest test.test_typesafe_api -v
真实调用：设置 TYPESAFE_API_KEY 后，运行
RUN_TYPESAFE_LIVE=1 .venv/bin/python -m unittest test.test_typesafe_api.TypeSafeLiveTest -v
文档：https://docs.typesafe.ai/api
"""

import json
import os
import time
import unittest
from unittest.mock import Mock, patch

import requests


def evaluate_urgency(api_key: str, model: str = "jev-latest") -> dict:
    return evaluate_questions(api_key, "我的账号连续三天无法登录，请尽快帮我处理！", {
        "is_urgent": {
            "type": "noul",
            "instructions": "Does this message express urgency?",
        },
    }, model)


def evaluate_questions(api_key: str, state: str | dict, questions: dict,
                       model: str = "jev-latest") -> dict:
    """用固定示例发一次请求；不重试，避免重复计费。"""
    if not api_key.strip():
        raise ValueError("请先设置环境变量 TYPESAFE_API_KEY")
    try:
        with requests.post(
            "https://api.typesafe.ai/v1/systemone",
            headers={"Authorization": f"Bearer {api_key.strip()}"},
            json={
                "model": model,
                "state": state,
                "questions": questions,
            },
            timeout=(10, 60),
            allow_redirects=False,
        ) as response:
            if response.status_code != 200:
                hints = {
                    401: "API Key 缺失或无效",
                    403: "账号或 API Key 无访问权限",
                    422: "请求参数校验失败",
                    429: "调用频率或配额受限",
                    529: "服务暂时过载",
                }
                hint = hints.get(response.status_code, "请检查服务状态")
                raise RuntimeError(f"TypeSafe HTTP {response.status_code}: {hint}")
            try:
                return response.json()
            except ValueError:
                raise RuntimeError("TypeSafe 返回了非 JSON 内容") from None
    except requests.Timeout:
        raise RuntimeError("TypeSafe 请求超时，请检查网络或代理") from None
    except requests.RequestException:
        raise RuntimeError("TypeSafe 连接失败，请检查网络、代理或证书") from None


class TypeSafeRequestTest(unittest.TestCase):
    @patch("test.test_typesafe_api.requests.post")
    def test_request_contract(self, post):
        response = Mock(status_code=200)
        response.json.return_value = {"answers": {"is_urgent": {"noul": 0.95}}}
        post.return_value.__enter__.return_value = response

        self.assertEqual(evaluate_urgency("test-key"), response.json.return_value)
        args, kwargs = post.call_args
        self.assertEqual(args, ("https://api.typesafe.ai/v1/systemone",))
        self.assertEqual(kwargs["headers"], {"Authorization": "Bearer test-key"})
        self.assertEqual(kwargs["json"]["model"], "jev-latest")
        self.assertEqual(kwargs["json"]["questions"]["is_urgent"]["type"], "noul")
        self.assertEqual(kwargs["timeout"], (10, 60))
        self.assertFalse(kwargs["allow_redirects"])

    @patch("test.test_typesafe_api.requests.post")
    def test_missing_key_does_not_send_request(self, post):
        with self.assertRaisesRegex(ValueError, "TYPESAFE_API_KEY"):
            evaluate_urgency(" ")
        post.assert_not_called()

    @patch("test.test_typesafe_api.requests.post")
    def test_authentication_failure(self, post):
        post.return_value.__enter__.return_value.status_code = 401
        with self.assertRaisesRegex(RuntimeError, "HTTP 401"):
            evaluate_urgency("test-key")


@unittest.skipUnless(os.environ.get("RUN_TYPESAFE_LIVE") == "1", "真实调用需 RUN_TYPESAFE_LIVE=1")
class TypeSafeLiveTest(unittest.TestCase):
    def test_systemone_is_callable(self):
        started = time.perf_counter()
        result = evaluate_urgency(
            os.environ.get("TYPESAFE_API_KEY", ""),
            os.environ.get("TYPESAFE_MODEL", "jev-latest"),
        )
        self.assertIsInstance(result, dict)
        self.assertIsInstance(result.get("model"), str)
        self.assertIsInstance(result.get("answers"), dict)
        answer = result["answers"].get("is_urgent")
        self.assertIsInstance(answer, dict)
        self.assertEqual(answer.get("type"), "noul")
        self.assertIn(type(answer.get("noul")), (int, float))
        self.assertGreaterEqual(answer["noul"], 0)
        self.assertLessEqual(answer["noul"], 1)
        # 仅展示响应字段，不输出认证信息；不固定概率，避免模型波动导致误报。
        print(json.dumps({
            "model": result["model"],
            "answers": result["answers"],
            "usage": result.get("usage"),
            "elapsed_seconds": round(time.perf_counter() - started, 3),
        }, ensure_ascii=False, indent=2))
