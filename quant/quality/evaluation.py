"""A baseline report, never a release-pass verdict or profitability score."""
import json
from pathlib import Path

from quant.research.contracts import digest
from .corpus import suite
from .metrics import finite_tree, inspect_analysis, stability
from .reviews import assess_review

MAX_BYTES = 16_000_000
CONTEXT_KEYS = {"model_key", "configuration_hash", "evidence_context_hash", "workflow_version"}


def read_json(path):
    with Path(path).open("rb") as stream:
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("质量评测文件超过 16 MB")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("质量评测 JSON 不接受重复键")
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=unique)
    finite_tree(value)
    return value


def records(packet, reference=None):
    reference = reference or suite()
    if not isinstance(packet, dict) or type(packet.get("version")) is not int or packet["version"] != 1 or packet.get("suite_hash") != reference["suite_hash"]:
        raise ValueError("评测格式或固定语料哈希不匹配")
    values = packet.get("records")
    if not isinstance(values, list) or len(values) > 60:
        raise ValueError("评测 records 必须是最多 60 项的数组")
    expected = {c["id"]: c for c in reference["cases"]}
    seen, run_ids = set(), set()
    for row in values:
        if not isinstance(row, dict) or row.get("case_id") not in expected:
            raise ValueError("评测中有未知样例")
        number = row.get("repeat")
        if type(number) is not int or not 1 <= number <= 10 or (row["case_id"], number) in seen:
            raise ValueError("同一样例的重复序号必须唯一且在 1–10 之间")
        seen.add((row["case_id"], number))
        run_id = row.get("run_id")
        if not isinstance(run_id, str) or not run_id.strip() or len(run_id) > 100 or run_id in run_ids:
            raise ValueError("不能把同一运行重复计作独立分析")
        run_ids.add(run_id)
        if row.get("source_hash") != expected[row["case_id"]]["source_hash"]:
            raise ValueError("结果未绑定固定源码样例")
        if row.get("status") not in ("completed", "failed", "cancelled") or type(row.get("fresh_model_calls")) is not bool:
            raise ValueError("运行状态或新调用标记无效")
        if row.get("origin") not in ("synthetic", "provider_recorded", "unverified"):
            raise ValueError("需要声明回答来源，模拟回答不能冒充真实模型")
        if row.get("block_reason", "none") not in ("none", "source_acquisition_failed"):
            raise ValueError("负对照阻断原因无效")
        context = row.get("context")
        if not isinstance(context, dict) or set(context) != CONTEXT_KEYS:
            raise ValueError("需要模型配置与冻结上下文指纹")
        if type(context["workflow_version"]) is not int or not 1 <= context["workflow_version"] <= 100:
            raise ValueError("工作流版本无效")
        if any(not isinstance(context[k], str) or not context[k].strip() or len(context[k]) > 300 for k in CONTEXT_KEYS - {"workflow_version"}):
            raise ValueError("模型或上下文指纹无效")
    finite_tree(packet)
    return values


def evaluate(packet, reviews=None):
    reference = suite()
    values = records(packet, reference)
    by_case = {c["id"]: c for c in reference["cases"]}
    reviews = reviews or {}
    approved = False
    if reviews:
        if reviews.get("version") != 1 or reviews.get("suite_hash") != reference["suite_hash"] or not isinstance(reviews.get("reviews"), list):
            raise ValueError("人工评审格式或语料哈希不匹配")
        approved = (reviews.get("corpus_approved") is True and isinstance(reviews.get("reviewer"), str)
                    and bool(reviews["reviewer"].strip()) and isinstance(reviews.get("corpus_review_note"), str)
                    and bool(reviews["corpus_review_note"].strip()))
        expected_keys = {(r["case_id"], r["repeat"]) for r in values if r["status"] == "completed"}
        keys = [(r.get("case_id"), r.get("repeat")) for r in reviews["reviews"] if isinstance(r, dict)]
        if len(keys) != len(reviews["reviews"]) or len(set(keys)) != len(keys) or any(k not in expected_keys for k in keys):
            raise ValueError("人工评审包含重复、未知或未完成的运行")
    results = []
    for row in values:
        case = by_case[row["case_id"]]
        negative_control = case["expected_outcome"] == "acquisition_blocked"
        if negative_control:
            matched = row["status"] == "failed" and row.get("block_reason") == "source_acquisition_failed" and "analysis" not in row
            mechanical = {"schema_valid": matched, "type": "source_acquisition_control", "expected_block_matched": matched,
                          **({"failure": "negative_control_not_blocked"} if not matched else {})}
            reviewed = {"status": "not_required_acquisition_control" if matched else "not_reviewable"}
        else:
            mechanical = inspect_analysis(case, row) if row["status"] == "completed" else {"schema_valid": False, "failure": row["status"]}
            reviewed = assess_review(case, row, reviews, approved) if mechanical.get("schema_valid") else {"status": "not_reviewable"}
        results.append({"case_id": row["case_id"], "repeat": row["repeat"], "run_id": row["run_id"],
                        "record_hash": digest(row), "status": row["status"], "origin": row["origin"],
                        "context_hash": digest([row["context"], row["origin"]]), "fresh_model_calls": row["fresh_model_calls"],
                        "mechanical": mechanical, "human": reviewed})
    coverage = []
    for case in reference["cases"]:
        selected = [r for r in results if r["case_id"] == case["id"]]
        fresh = [r for r in selected if r["status"] == "completed" and r["mechanical"].get("schema_valid") and r["fresh_model_calls"]]
        controls = sum(r["mechanical"].get("expected_block_matched", False) for r in selected)
        coverage.append({"case_id": case["id"], "attempts": len(selected), "fresh_valid": len(fresh),
                         "expected_outcome": case["expected_outcome"], "matched_acquisition_controls": controls,
                         "missing_required_repeats": max(0, 3 - (controls if case["expected_outcome"] == "acquisition_blocked" else len(fresh))),
                         "failed_or_invalid": sum(not r["mechanical"].get("schema_valid") for r in selected)})
    repeated = stability(results)
    return {"version": 1, "suite_version": reference["version"], "suite_hash": reference["suite_hash"],
            "label_status": "human_attested" if approved else reference["label_status"],
            "acceptance": "baseline_collection_only_no_release_thresholds", "required_repeats_per_case": 3,
            "coverage": coverage, "records": results, "score_stability": repeated,
            "complete_same_context_baseline": all(any(g["case_id"] == c["id"] and g["minimum_repeats_met"] for g in repeated) for c in reference["cases"] if c["expected_outcome"] == "report")
                and all(c["missing_required_repeats"] == 0 for c in coverage),
            "human_review_complete": bool(results) and approved and all(r["human"]["status"] in ("reviewed", "not_required_acquisition_control") for r in results)
                and all(c["missing_required_repeats"] == 0 for c in coverage),
            "provider_recorded_attempts": sum(r["origin"] == "provider_recorded" for r in results),
            "limitations": ["自动引用与格式检查不证明语义正确；参数额外项可能是合法遗漏标签，须人工裁决。",
                            "本版参考标签由 AI 起草，未有人类审阅记录时不能称专家基准。",
                            "provider_recorded 只表示导出时存在调用用量记录，不是独立的提供商真实性证明。",
                            "同配置同上下文至少三次新分析才报告稳定性基线；缓存复用、失败和未知分数不按零分计。",
                            "尚无经确认的放行阈值；不输出通过结论、收益分或平台验证状态。"]}
