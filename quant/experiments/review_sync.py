"""Restore experiment analysis only when all cited calculation facts survive."""
from .review_evidence import project
from .review_contract import validate_review


def review_evidence_from_rows(run: dict, rows: dict, fail) -> dict:
    result = rows.get('quant.experimentresult', {}).get(str(run.get('experiment_result')), {})
    request = rows.get('quant.experimentrequest', {}).get(str(result.get('request')), {})
    entry = rows.get('quant.entry', {}).get(str(run.get('entry')), {})
    if not request or request.get('anthology') != entry.get('anthology'):
        fail('实验解读引用缺失或跨文集')
    if run.get('review_version') not in (9,10,11,12,13,14) and ('strategy' in request['plan']['config']) != (run.get('review_version') == 8):
        fail('策略执行实验解读版本不匹配')
    seed = request['plan']['seeds'][0]['id']
    candidate = rows.get('quant.factorcandidate', {}).get(seed, {})
    report = rows.get('quant.researchreport', {}).get(str(candidate.get('report')), {})
    if report.get('entry') != run.get('entry') or report.get('source') != run.get('source') or run.get('resolved_source'):
        fail('实验解读与原始父代来源不一致')
    dataset = rows.get('quant.marketdataset', {}).get(str(request.get('dataset')), {})
    attempts = [row for row in rows.get('quant.experimentcheckpoint', {}).values() if row.get('request') == result.get('request')]
    from .planning_context import from_rows
    context = run.get('planning_context') if run.get('review_version') in (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14) else None
    if context is not None:
        from .library_retrieval import validate_from_rows
        validate_from_rows(run, rows, from_rows(str(result['request']), rows))
    from quant.validation_studies.evidence import from_rows as fixed_from_rows
    fixed=fixed_from_rows(run,rows,fail)
    from quant.search_diagnostics.evidence import from_rows as diagnostic_from_rows
    diagnostic=diagnostic_from_rows(run,rows,fail)
    evidence = project(request['plan'], dataset['snapshot'], result['data'],
        [row['attempt'] for row in sorted(attempts, key=lambda row: row['ordinal'])],
        planning_options=context['options'] if context is not None else from_rows(str(result['request']), rows) if run.get('review_version', 1) == 2 else None, library_context=context, sensitivity=run.get('review_version') in (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14), joint_sensitivity=run.get('review_version') in (5, 6, 7, 8, 9, 10, 11, 12, 13, 14), research_memory=context.get('research_memory') if run.get('review_version') in (6, 7, 8, 9, 10, 11, 12, 13, 14) else None, fixed_validation=fixed,selection_diagnostic=diagnostic,temporal_sensitivity=run.get('review_version') in (12,13,14),window_reviews=run.get('review_version') in (13,14),context_encoding=run.get('review_version')==14)
    if run['status'] == 'completed' and validate_review(run['result'], evidence) != run['result']:
        fail('实验解读内容或证据哈希不一致')
    return evidence


def validate_local_review_links(rows: dict, fail) -> None:
    from quant.models import AIRun
    incoming = rows.get('quant.airun', {})
    for run in AIRun.objects.filter(pk__in=incoming, kind='experiment_review'):
        fields = incoming[run.pk]
        if (fields.get('kind') != run.kind or fields.get('experiment_result') != run.experiment_result_id
                or fields.get('validation_result') != run.validation_result_id or fields.get('source') != run.source_id or fields.get('entry') != run.entry_id
                or fields.get('review_version', 1) != run.review_version or fields.get('planning_context', {}) != run.planning_context):
            fail('已有实验解读的结果与来源引用不可改写')
