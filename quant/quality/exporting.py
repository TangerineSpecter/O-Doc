"""Read-only export of original analysis runs, excluding settings and secrets."""
from quant.research.contracts import digest
from quant.workflows.contracts import MODEL_STAGES
from .corpus import suite


def export_run(run_id, case_id, repeat):
    from quant.models import AIRun
    run = AIRun.objects.select_related("source", "resolved_source").get(pk=run_id)
    cases = {c["id"]: c for c in suite()["cases"]}
    if case_id not in cases or run.kind != "analyze" or run.status not in ("completed", "failed", "cancelled"):
        raise ValueError("只能导出已结束的原始源码分析运行")
    expected = cases[case_id]
    source = run.resolved_source or run.source
    if source is None or any(source.payload.get(key, "") != value for key, value in expected["source"].items()):
        raise ValueError("运行源码、说明、标题或平台与固定样例不一致")
    # An acquired webpage would change this negative-control task.
    if source.payload.get("web_markdown", "").strip():
        raise ValueError("固定样例不可混入额外网页正文")
    if any(source.payload.get(key) for key in ("language_version", "dependencies", "parameters", "note")):
        raise ValueError("固定样例不可混入额外版本、参数或说明")
    steps = list(run.workflow_steps.select_related("outcome").order_by("ordinal"))
    models = {digest(s.input.get("model", {})): s.input.get("model", {}) for s in steps if s.stage in MODEL_STAGES}
    if not models and run.status == "completed":
        raise ValueError("运行没有可追溯的模型阶段输入")
    if not models:
        # A failure before the first model stage is still an attempted task.
        models = {"unrecorded": {"model_id": run.model_id, "model_name": run.model_name}}
    outcomes = [getattr(s, "outcome", None) for s in steps if s.stage in MODEL_STAGES]
    required = {"identify", "parameters", "research", "extract", "review", "plan"}
    observed = set()
    call_count = 0
    reused = False
    for step in steps:
        outcome = getattr(step, "outcome", None)
        if step.stage not in MODEL_STAGES or outcome is None:
            continue
        count = outcome.data.get("usage", {}).get("request_count", 0)
        call_count += count
        reused = reused or bool(outcome.data.get("reused_from"))
        if count > 0 and outcome.data.get("status") == "completed":
            observed.add(step.stage)
    compare = next((s.input.get("library", {}) for s in steps if s.stage == "compare"), {})
    frozen = {"candidates": compare.get("candidates", []), "truncated": compare.get("truncated", False),
              "history": compare.get("research_memory", {}).get("items", [])}
    vocabulary = next((s.input.get("vocabulary_ref") for s in steps if s.stage == "normalize"), None)
    # Revision identity is not content; identical vocabularies in clean, separate
    # benchmark collections should compare under the same semantic context.
    vocabulary_content = {k: v for k, v in (vocabulary or {}).items() if k != "revision_id"}
    return {"case_id": case_id, "repeat": repeat, "run_id": str(run.pk), "source_hash": expected["source_hash"],
            "status": run.status, "origin": "provider_recorded" if call_count else "unverified",
            "block_reason": "source_acquisition_failed" if run.status == "failed" and source.payload.get("fetch_status") == "failed"
                and not source.payload.get("code", "").strip() and not source.payload.get("description", "").strip() else "none",
            "fresh_model_calls": required <= observed and not reused and bool(outcomes),
            "context": {"model_key": digest(sorted(models)), "configuration_hash": digest([models[k].get("configuration_hash", "") for k in sorted(models)]),
                        "workflow_version": run.workflow_version,
                        "evidence_context_hash": digest({"requirements": run.requirements, "vocabulary": vocabulary_content, "library": frozen})},
            **({"analysis": run.result} if run.status == "completed" else {})}
