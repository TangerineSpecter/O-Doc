"""Feedback links must survive restore without changing their immutable targets."""
from .contracts import validate_payload, validate_analysis
from .evidence import project, experiment_projection


def context_from_rows(source: dict, rows: dict, fail) -> dict:
    payload = source['payload']
    validate_payload(payload)
    if source.get('code_version'):
        fail('反馈不能冒充代码版本')
    sources, materials = rows.get('quant.sourcerevision', {}), rows.get('quant.sourcematerial', {})
    entry_id = materials.get(str(source.get('material')), {}).get('entry')
    target = sources.get(payload['target_source_id'], {})
    if not target or materials.get(str(target.get('material')), {}).get('entry') != entry_id or target['payload'].get('provenance') == 'external_feedback':
        fail('反馈目标来源缺失、跨研究或循环')
    factor = rows.get('quant.factorcandidate', {}).get(payload['factor_id']) if payload['factor_id'] else None
    report = rows.get('quant.researchreport', {}).get(str((factor or {}).get('report')), {})
    if payload['factor_id'] and (not factor or report.get('entry') != entry_id or report.get('source') != payload['target_source_id']):
        fail('反馈因子与来源不一致')
    result = rows.get('quant.experimentresult', {}).get(payload['experiment_result_id']) if payload['experiment_result_id'] else None
    experiment = None
    if payload['experiment_result_id']:
        request = rows.get('quant.experimentrequest', {}).get(str((result or {}).get('request')), {})
        ids = [row['id'] for row in request.get('plan', {}).get('seeds', [])]
        source_ids = [rows.get('quant.researchreport', {}).get(str(rows.get('quant.factorcandidate', {}).get(key, {}).get('report')), {}).get('source') for key in ids]
        if not result or request.get('anthology') != rows.get('quant.entry', {}).get(str(entry_id), {}).get('anthology') or payload['target_source_id'] not in source_ids or (factor and payload['factor_id'] not in ids):
            fail('反馈实验引用缺失或不包含目标')
        dataset = rows.get('quant.marketdataset', {}).get(str(request.get('dataset')), {})
        experiment = {'id': payload['experiment_result_id'], 'content_hash': result['content_hash'], **experiment_projection(request['plan'], result['data'], dataset['snapshot'])}
    native=None
    if payload.get('feedback_version')==4:
        from quant.native_python.evidence import from_rows
        from quant.research_memory.contract import instant
        native=from_rows(payload['native_check'],payload,rows,fail)
        if instant(rows['quant.nativepythonresult'][payload['native_check']['id']]['created_at'])>instant(source['created_at']):
            fail('Python验证反馈引用未来结果')
    return project(payload, {'id': payload['target_source_id'], 'content_hash': target['content_hash'], 'payload': target['payload']},
        {'id': payload['factor_id'], 'data': factor['data']} if factor else None, experiment, enforce_budget=False,native_check=native)


def validate_feedback(rows: dict, fail) -> None:
    sources = rows.get('quant.sourcerevision', {})
    contexts = {}
    for key, source in sources.items():
        if source['payload'].get('provenance') == 'external_feedback':
            contexts[key] = context_from_rows(source, rows, fail)
    for key, run in rows.get('quant.airun', {}).items():
        if run['kind'] == 'feedback_review':
            context = contexts.get(str(run.get('source')))
            if not context or run.get('resolved_source'):
                fail('反馈分析必须引用固定的外部报告')
            if run.get('planning_context'):
                from .memory import from_rows
                context = {**context, 'research_memory': from_rows(run, rows)}
            if run.get('feedback_workflow_version'):
                from quant.native_reviews.context import from_rows as enrich_native
                context=enrich_native(context,run,rows)
            if run['status'] == 'completed':
                if validate_analysis(run['result'], context) != run['result']:
                    fail('反馈分析证据或哈希不一致')
                if sum(report.get('run') == key for report in rows.get('quant.researchreport', {}).values()) != 1:
                    fail('反馈分析缺少研究报告')
        elif str(run.get('source')) in contexts:
            fail('外部反馈不能作为代码分析输入')
    from quant.models import AIRun
    incoming = rows.get('quant.airun', {})
    for run in AIRun.objects.filter(pk__in=incoming, kind='feedback_review'):
        other = incoming[run.pk]
        if other.get('kind') != run.kind or other.get('entry') != run.entry_id or other.get('source') != run.source_id or other.get('planning_context', {}) != run.planning_context:
            fail('已有反馈任务的固定来源不可改写')


def for_run_rows(run: dict, rows: dict, fail) -> dict:
    context = context_from_rows(rows['quant.sourcerevision'][str(run['source'])], rows, fail)
    if run.get('planning_context'):
        from .memory import from_rows
        context['research_memory'] = from_rows(run, rows)
    if run.get('feedback_workflow_version'):
        from quant.native_reviews.context import from_rows as enrich_native
        context=enrich_native(context,run,rows)
    return context
