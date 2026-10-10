"""菲伦农场决策演示：默认离线，显式开启后才调用付费 API。

RUN_TYPESAFE_LIVE=1 .venv/bin/python -m unittest test.test_typesafe_farm_demo.TypeSafeFarmDemoTest -v
TYPESAFE_DEMO_PROFILE=compact（默认）/full/both；both 对比完整与精简提示词。
TYPESAFE_DEMO_REVERSE=1 可倒序候选，检查选项顺序是否影响结果。
输出是模型选择与概率，不是模型生成的解释，也不会执行任何真实农场操作。
"""

import json
import math
import os
import time
import unittest

from test.test_typesafe_api import evaluate_questions
from test.typesafe_farm_demo_data import (
    ACTION_DESCRIPTIONS, FERN_DECISION_PROFILE, FERN_FULL_PROMPT,
    SCENARIOS, build_request,
)


def validate_choice(result: dict, options: dict) -> dict:
    """只校验接口契约，不把主观行为预期当作测试断言。"""
    answer = result["answers"]["next_action"]
    if answer.get("type") != "choice" or answer.get("choice") not in options:
        raise ValueError("返回的选择不在本轮合法候选中")
    probabilities = answer.get("probabilities")
    if not isinstance(probabilities, dict) or set(probabilities) != set(options):
        raise ValueError("候选概率分布不完整")
    for value in [*probabilities.values(), answer.get("confidence")]:
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError("概率或置信度必须是 0 到 1 的有限数值")
    if not math.isclose(sum(probabilities.values()), 1, abs_tol=0.01):
        raise ValueError("候选概率之和应接近 1")
    return answer


class TypeSafeFarmDemoOfflineTest(unittest.TestCase):
    def test_only_feasible_candidates_are_sent(self):
        for scenario in SCENARIOS:
            with self.subTest(scenario=scenario["id"]):
                state, questions = build_request(FERN_DECISION_PROFILE, scenario)
                options = questions["next_action"]["criteria"]
                self.assertEqual(set(options), {
                    key for key, feasible in scenario["feasible"].items() if feasible
                })
                self.assertEqual(state["available_actions"], options)
                self.assertIn("rest", options)

    def test_reversing_order_preserves_candidates(self):
        _, normal = build_request(FERN_FULL_PROMPT, SCENARIOS[-1])
        _, reverse = build_request(FERN_FULL_PROMPT, SCENARIOS[-1], reverse=True)
        self.assertEqual(normal, reverse)
        self.assertEqual(list(reverse["next_action"]["criteria"]),
                         list(reversed(normal["next_action"]["criteria"])))

    def test_out_of_set_choice_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "合法候选"):
            validate_choice({"answers": {"next_action": {
                "type": "choice", "choice": "plant",
            }}}, {"rest": "休息"})

    def test_valid_distribution(self):
        answer = {"type": "choice", "choice": "rest", "confidence": 0.8,
                  "probabilities": {"rest": 0.9, "plant": 0.1}}
        self.assertEqual(validate_choice({"answers": {"next_action": answer}},
                                         {"rest": "休息", "plant": "播种"}), answer)


@unittest.skipUnless(os.environ.get("RUN_TYPESAFE_LIVE") == "1", "真实调用需 RUN_TYPESAFE_LIVE=1")
class TypeSafeFarmDemoTest(unittest.TestCase):
    def test_fern_farm_decisions(self):
        mode = os.environ.get("TYPESAFE_DEMO_PROFILE", "compact")
        self.assertIn(mode, ("compact", "full", "both"), "PROFILE 应为 compact/full/both")
        profiles = {"compact": FERN_DECISION_PROFILE, "full": FERN_FULL_PROMPT}
        if mode != "both":
            profiles = {mode: profiles[mode]}
        reverse = os.environ.get("TYPESAFE_DEMO_REVERSE") == "1"
        summaries = {}
        print(f"\n菲伦农场演示：{len(profiles) * len(SCENARIOS)} 次 API 请求；"
              f"候选顺序={'倒序' if reverse else '正序'}；仅选择，不执行。", flush=True)
        for scenario in SCENARIOS:
            for profile_name, profile in profiles.items():
                with self.subTest(scenario=scenario["id"], profile=profile_name):
                    state, questions = build_request(profile, scenario, reverse=reverse)
                    started = time.perf_counter()
                    result = evaluate_questions(
                        os.environ.get("TYPESAFE_API_KEY", ""), state, questions,
                        os.environ.get("TYPESAFE_MODEL", "jev-latest"),
                    )
                    elapsed = time.perf_counter() - started
                    answer = validate_choice(result, questions["next_action"]["criteria"])
                    summaries[(scenario["id"], profile_name)] = answer["choice"]
                    print(json.dumps({
                        "场景": scenario["title"], "事实": scenario["facts"],
                        "性格输入": "精简决策画像" if profile_name == "compact" else "完整提示词",
                        "选择": ACTION_DESCRIPTIONS[answer["choice"]],
                        "候选概率": {ACTION_DESCRIPTIONS[key].split("：")[0]: value
                                     for key, value in answer["probabilities"].items()},
                        "置信度": answer["confidence"], "模型": result.get("model"),
                        "Token用量": result.get("usage"), "耗时秒": round(elapsed, 3),
                        "人工观察提示（非模型解释）": scenario["observe"],
                    }, ensure_ascii=False, indent=2), flush=True)
        if mode == "both":
            print("\n完整/精简提示词选择对比（单次观察，不能证明稳定性）：", flush=True)
            for scenario in SCENARIOS:
                compact = summaries.get((scenario["id"], "compact"), "失败")
                full = summaries.get((scenario["id"], "full"), "失败")
                print(f"{scenario['title']}：compact={compact} / full={full}", flush=True)
