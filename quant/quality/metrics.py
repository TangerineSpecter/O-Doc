"""Mechanical checks are deliberately separate from semantic expert review."""
import math
from decimal import Decimal, InvalidOperation
from statistics import pstdev

from rest_framework.exceptions import ValidationError

from quant.research.analysis import DIMENSIONS, validate_analysis, validate_source_evidence
from quant.research.contracts import digest

SECTIONS = ("summary", "principle", "formula", "usage", "risks", "validation_plan")


def default_equal(actual, expected):
    a, b = str(actual).strip(), str(expected).strip()
    if a.lower() in ("true", "false") or b.lower() in ("true", "false"):
        return a.lower() == b.lower()
    try:
        left, right = Decimal(a), Decimal(b)
        return left.is_finite() and right.is_finite() and left == right
    except InvalidOperation:
        return a == b


def ratio(a, b):
    return round(a / b, 6) if b else None


def inspect_analysis(case, record):
    value = record.get("analysis")
    if not isinstance(value, dict):
        return {"schema_valid": False, "failure": "missing_analysis"}
    try:
        clean = validate_analysis(value)
        from quant.research.findings import validate_admission
        validate_admission(clean, record.get("context", {}).get("workflow_version", 0))
        validate_source_evidence(clean, case["source"])
    except (ValidationError, ValueError, TypeError, KeyError, RecursionError):
        # Do not copy provider text, invalid fields or possible credentials into logs.
        return {"schema_valid": False, "failure": "production_contract_rejected"}
    params = clean["parameters"]
    by_name = {}
    for row in params:
        by_name.setdefault(row["name"], []).append(row)
    recognized, correct_default, correct_category, missing = [], [], [], []
    for expected in case["parameters"]:
        name = expected["name"]
        found = by_name.get(name, [])
        if len(found) != 1:
            missing.append(name)
            continue
        recognized.append(name)
        if default_equal(found[0]["default_value"], expected["default"]):
            correct_default.append(name)
        if found[0]["category"] == expected["category"]:
            correct_category.append(name)
    required = {p["name"] for p in case["parameters"]}
    optional = set(case["optional_state"])
    optional_rows = [p for p in params if p["name"] in optional and p["category"] == "state"]
    unlabelled = [p["name"] for p in params if p["name"] not in required
                 and not (p["name"] in optional and p["category"] == "state")]
    factors = clean.get("factors", [])
    return {"schema_valid": True, "analysis_hash": digest(value),
            "kind_matches_reference": clean["kind"] == case["kind"] if case["kind"] else None,
            "parameters": {"expected": len(required), "reported": len(params), "matched": len(recognized),
                           "recall": ratio(len(recognized), len(required)),
                           "reference_precision": ratio(len(recognized) + len(optional_rows), len(params)),
                           "correct_defaults": len(correct_default), "default_recall": ratio(len(correct_default), len(required)),
                           "correct_categories": len(correct_category), "missing_or_duplicate": missing,
                           "wrong_defaults": sorted(set(recognized) - set(correct_default)),
                           "wrong_categories": sorted(set(recognized) - set(correct_category)),
                           "unlabelled_names_require_review": unlabelled,
                           "duplicate_names": sorted(k for k, rows in by_name.items() if len(rows) > 1)},
            "nonempty_sections": sum(bool(clean.get(k, "").strip()) for k in SECTIONS),
            "section_count": len(SECTIONS), "factor_count": len(factors),
            "extraction_contract_present": clean.get("extraction_version") == 1,
            "factor_quotes_bound_to_source": True if factors else None,
            "all_scores_unknown": all(s["score"] is None for s in clean["scores"]),
            "scores": {s["dimension"]: s["score"] for s in clean["scores"]},
            "total_score": clean["total_score"],
            "semantic_correctness": "requires_expert_review"}


def stability(records):
    """Never pool different model/config/evidence contexts or reused results."""
    groups = {}
    for row in records:
        if row["mechanical"].get("type") == "source_acquisition_control":
            continue
        key = (row["case_id"], row["context_hash"])
        group = groups.setdefault(key, [])
        if row["status"] == "completed" and row["mechanical"].get("schema_valid") and row["fresh_model_calls"]:
            group.append(row)
    result = []
    for (case_id, context_hash), rows in sorted(groups.items()):
        dimensions = {}
        for key in (*DIMENSIONS, "total_score"):
            values = [row["mechanical"]["total_score"] if key == "total_score" else row["mechanical"]["scores"][key] for row in rows]
            known = [v for v in values if v is not None]
            dimensions[key] = {"known": len(known), "unknown": len(values) - len(known),
                               "min": min(known) if known else None, "max": max(known) if known else None,
                               "range": max(known) - min(known) if known else None,
                               "population_stddev": round(pstdev(known), 6) if len(known) >= 2 else None}
        result.append({"case_id": case_id, "context_hash": context_hash, "fresh_completed": len(rows),
                       "minimum_repeats_met": len(rows) >= 3, "dimensions": dimensions})
    return result


def finite_tree(value, depth=0):
    if depth > 80:
        raise ValueError("质量评测输入嵌套过深")
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("质量评测不接受非有限数值")
    if isinstance(value, dict):
        for child in value.values():
            finite_tree(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            finite_tree(child, depth + 1)
