"""Hash-bound human review; existence/quotes are checked, judgment is human."""
from quant.research.contracts import digest

VERDICTS = {"supported", "incorrect", "missing", "uncertain"}
FACTOR_VERDICTS = {"reusable", "rule", "unsupported", "unclear"}


def text_values(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from text_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from text_values(item)


def present(quote, strings):
    return isinstance(quote, str) and bool(quote.strip()) and any(quote in text for text in strings)


def review_template(suite, records):
    from .metrics import inspect_analysis
    cases = {row["id"]: row for row in suite["cases"]}
    reviewable = [row for row in records if row["status"] == "completed"
                  and inspect_analysis(cases[row["case_id"]], row).get("schema_valid")]
    return {"version": 1, "suite_hash": suite["suite_hash"], "reviewer": "",
            "corpus_approved": False, "corpus_review_note": "",
            "reviews": [{"case_id": row["case_id"], "repeat": row["repeat"], "record_hash": digest(row),
                         "facts": [{"id": f["id"], "requirement": f["requirement"],
                                    "verdict": "uncertain", "reason": "", "report_quotes": [], "source_quotes": []}
                                   for f in cases[row["case_id"]]["facts"]],
                         "unsupported_claims": {"verdict": "uncertain", "reason": "", "report_quotes": []},
                         "parameter_review": {"complete": False, "reason": ""},
                         "factor_rubric": cases[row["case_id"]]["factor_rubric"],
                         "factors": [{"index": i, "verdict": "unclear", "reason": ""}
                                     for i, _ in enumerate(row.get("analysis", {}).get("factors", []))],
                         "factor_coverage": {"complete": False, "reason": ""}}
                        for row in reviewable]}


def assess_review(case, record, packet, approved):
    key = (record["case_id"], record["repeat"])
    matches = [r for r in packet.get("reviews", []) if (r.get("case_id"), r.get("repeat")) == key]
    if not matches:
        return {"status": "pending"}
    if len(matches) != 1 or matches[0].get("record_hash") != digest(record):
        raise ValueError("人工评审必须唯一并绑定当前完整结果哈希")
    review = matches[0]
    expected = {f["id"]: f for f in case["facts"]}
    facts = review.get("facts")
    if not isinstance(facts, list) or any(not isinstance(f, dict) for f in facts) or len(facts) != len(expected) or {f.get("id") for f in facts} != set(expected):
        raise ValueError("人工评审必须覆盖该样例的全部事实项")
    report_strings = list(text_values(record["analysis"]))
    counts = dict.fromkeys(VERDICTS, 0)
    for row in facts:
        verdict = row.get("verdict")
        if verdict not in VERDICTS or not isinstance(row.get("reason"), str) or not row["reason"].strip():
            raise ValueError("每个事实判断需要合法结论与理由")
        quotes = row.get("report_quotes", [])
        if not isinstance(quotes, list) or any(not present(q, report_strings) for q in quotes):
            raise ValueError("评审引用必须逐字存在于这份报告")
        if verdict in ("supported", "incorrect") and not quotes:
            raise ValueError("支持或错误的判断需要定位报告原句")
        if verdict == "missing" and quotes:
            raise ValueError("缺失事实不得同时引用已存在的报告表述")
        source_quotes = row.get("source_quotes", [])
        if not isinstance(source_quotes, list):
            raise ValueError("源码依据须为数组")
        for source in source_quotes:
            if not isinstance(source, dict) or not present(source.get("quote"), [case["source"].get(source.get("field"), "")]):
                raise ValueError("评审源码引用必须逐字存在于固定样例")
        if verdict == "supported" and expected[row["id"]]["source"] and not source_quotes:
            raise ValueError("源码事实判断需要源码依据")
        counts[verdict] += 1
    unfounded = review.get("unsupported_claims", {})
    if not isinstance(unfounded, dict) or unfounded.get("verdict") not in ("checked_none", "found", "uncertain") or not isinstance(unfounded.get("reason"), str) or not unfounded["reason"].strip():
        raise ValueError("需要单独检查报告中的额外无依据断言")
    quotes = unfounded.get("report_quotes", [])
    if not isinstance(quotes, list) or any(not present(q, report_strings) for q in quotes) or (unfounded["verdict"] == "found" and not quotes):
        raise ValueError("无依据断言必须定位报告原句")
    if unfounded["verdict"] == "checked_none" and quotes:
        raise ValueError("无额外断言时不能列出反例原句")
    factors = review.get("factors", [])
    expected_count = len(record["analysis"].get("factors", []))
    if not isinstance(factors, list) or any(not isinstance(f, dict) or type(f.get("index")) is not int for f in factors) or len(factors) != expected_count or {f.get("index") for f in factors} != set(range(expected_count)):
        raise ValueError("需要评价每个实际提取项，不能跳过不好的候选")
    for factor in factors:
        if factor.get("verdict") not in FACTOR_VERDICTS or not isinstance(factor.get("reason"), str) or not factor["reason"].strip():
            raise ValueError("候选用途判断需要结论和理由")
    checks = [review.get(name, {}) for name in ("parameter_review", "factor_coverage")]
    if any(not isinstance(v, dict) or type(v.get("complete")) is not bool or not isinstance(v.get("reason"), str) or not v["reason"].strip() for v in checks):
        raise ValueError("参数额外项及因子遗漏检查需要明确记录")
    complete = (approved and counts["uncertain"] == 0 and unfounded["verdict"] != "uncertain"
                and all(v["complete"] for v in checks) and all(f["verdict"] != "unclear" for f in factors))
    return {"status": "reviewed" if complete else "pending", "fact_verdicts": counts,
            "factual_accuracy": counts["supported"] / (counts["supported"] + counts["incorrect"]) if counts["supported"] + counts["incorrect"] else None,
            "fact_coverage": counts["supported"] / len(expected), "unsupported_claims": unfounded["verdict"],
            "factor_verdicts": {k: sum(f["verdict"] == k for f in factors) for k in sorted(FACTOR_VERDICTS)}}
