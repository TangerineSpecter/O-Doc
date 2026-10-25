"""Immutable linked evidence; shared projection for execution and snapshot restore."""
import json
from rest_framework.exceptions import ValidationError
from quant.models import SourceRevision, FactorCandidate, ExperimentResult
from .contracts import validate_payload


def project(payload: dict, target: dict, factor: dict | None, experiment: dict | None, *, enforce_budget=True,native_check=None) -> dict:
    validate_payload(payload)
    context = {'version': 1, 'feedback': {key: payload[key] for key in
        ('title', 'mode', 'document_format', 'document', 'platform', 'notes')},
        'target_source': target, 'factor': factor, 'experiment': experiment,
        'status': 'external_report_unverified'}
    if payload.get('feedback_version')==4:
        if native_check is None:raise ValidationError('Python原始验证解读缺少计算事实')
        context.update(native_check=native_check,status='native_python_fixed_sample_record')
    if factor and factor['data'].get('formula_version'):
        context['factor_source_scope'] = {
            'origin': 'authored_formula_version', 'formula_version': factor['data']['formula_version'],
            'source_role': 'ancestor_context_not_authored_formula_source',
            'parameter_comparison_scope': 'target_source_ancestor_only',
            'notice': '固定来源及其参数配置对照属于祖先源码上下文，不是人工公式版本的默认值或原平台等价证明；'
                      '本版本声明参数取 factor.data.parameters，外部实际值仍需单独核对，不继承原报告评分。'}
        if factor['data']['formula_version']['origin'] == 'ai_repair':
            context['factor_source_scope'].update(origin='ai_revised_formula_version',
                source_role='ancestor_context_not_ai_revised_formula_source',
                notice='固定来源与参数对照属于祖先上下文，不是 AI 修订定义的原平台参数或等价证明；本版本参数取 factor.data.parameters，实际值仍需单独核对，不继承原评分。')
    if payload.get('feedback_version') == 2:
        from quant.parameters.comparison import compare
        context['parameter_configuration'] = payload['parameter_configuration']
        expected = compare(payload['parameter_configuration'], target)
        if payload['parameter_comparison'] != expected:
            raise ValidationError('参数配置对照必须匹配固定来源快照')
        context['parameter_comparison'] = expected
    if payload.get('feedback_version') == 3:
        from .execution import model_context
        # The complete immutable source remains available in the UI and restore
        # validation; only the deterministic sufficient summary enters the model.
        context['feedback']['document'] = ''
        context['feedback']['document_hash'] = payload['execution_evidence']['document_hash']
        context.update(model_context(payload, target))
    if enforce_budget and len(json.dumps(context, ensure_ascii=False)) > 190000:
        raise ValidationError('反馈与关联材料超过分析上限，请拆分报告；已保存的材料仍保留')
    return context


def experiment_projection(plan: dict, result: dict, dataset: dict) -> dict:
    output = result.get('output') or {}
    def metrics(key):
        return {name: value for name, value in (output.get(key) or {}).items() if name not in ('curve', 'returns')}
    return {'name': plan['name'], 'seeds': plan['seeds'], 'config': plan['config'],
        'dataset': {key: dataset.get(key) for key in ('symbol', 'timeframe', 'timezone', 'price_adjustment', 'source')},
        'selected_attempt': next(({key: row.get(key) for key in ('id', 'parents', 'operation', 'recipe', 'requested_parameters', 'metrics')}
            for row in output.get('attempts', []) if row['id'] == output.get('selected_id')), None),
        'engine_version': plan['engine_version'], 'status': result['status'], 'selected_id': output.get('selected_id'),
        'holdout': metrics('holdout'), 'baseline': metrics('buy_hold_baseline'),
        'limitations': output.get('limitations', []), 'error': result.get('error', '')}


def linked(entry, payload: dict) -> tuple:
    target = SourceRevision.objects.select_related('material__entry').filter(
        pk=payload['target_source_id'], material__entry=entry).first()
    if not target or target.payload.get('provenance') == 'external_feedback':
        raise ValidationError('反馈须关联当前研究的原始来源，不能关联另一条反馈')
    factor = None
    if payload['factor_id']:
        factor = FactorCandidate.objects.select_related('report').filter(pk=payload['factor_id'], report__entry=entry,
            report__source=target).first()
        if factor is None:
            raise ValidationError('因子与反馈目标来源不一致')
    experiment = None
    if payload['experiment_result_id']:
        experiment = ExperimentResult.objects.select_related('request__dataset').filter(
            pk=payload['experiment_result_id'], request__anthology=entry.anthology).first()
        ids = [row['id'] for row in experiment.request.plan['seeds']] if experiment else []
        if not experiment or (factor and factor.pk not in ids) or not FactorCandidate.objects.filter(
                pk__in=ids, report__entry=entry, report__source=target).exists():
            raise ValidationError('实验不包含当前反馈目标，不能关联')
    return target, factor, experiment


def for_source(source) -> dict:
    payload = source.payload
    target, factor, experiment = linked(source.material.entry, payload)
    return project(payload, {'id': target.pk, 'content_hash': target.content_hash, 'payload': target.payload},
        {'id': factor.pk, 'data': factor.data} if factor else None,
        {'id': experiment.pk, 'content_hash': experiment.content_hash,
         **experiment_projection(experiment.request.plan, experiment.data, experiment.request.dataset.snapshot)} if experiment else None,
        native_check=__native(payload))


def __native(payload):
    if payload.get('feedback_version')!=4:return None
    from quant.native_python.evidence import linked_summary
    return linked_summary(payload)


def for_run(run) -> dict:
    context = for_source(run.source)
    if run.planning_context:
        from .memory import for_source as memory_for_source
        context['research_memory'] = memory_for_source(run.source, run.planning_context)
    if run.feedback_workflow_version:
        from quant.native_reviews.policy import POLICY
        context['native_review_policy']=POLICY.copy()
    return context
