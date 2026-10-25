"""Archive first and queue one explicit analysis; replay never reauthorizes work."""
from rest_framework.exceptions import ValidationError
from quant.models import SourceMaterial, SourceRevision
from quant.services import queue, Conflict, ModelUnavailable, touch
from quant.research.contracts import digest
from .contracts import FeedbackInput, PAYLOAD_FIELDS
from .evidence import linked, for_source


def collect(entry, raw: dict, *, native_check=None):
    serializer = FeedbackInput(data=raw)
    serializer.is_valid(raise_exception=True)
    data = dict(serializer.validated_data)
    identity = digest(['external-feedback', entry.pk, data['request_key']])[:40]
    fingerprint = digest(data if native_check is None else {'input':data,'native_check':native_check})
    existing = SourceRevision.objects.filter(pk=identity, material__entry=entry).first()
    if existing:
        if existing.payload['request_fingerprint'] != fingerprint:
            raise Conflict('该反馈请求标识已用于其他材料')
        return existing, ''
    payload = {key: value for key, value in data.items() if key in PAYLOAD_FIELDS}
    payload.update(provenance='external_feedback', feedback_version=1, request_fingerprint=fingerprint)
    if native_check is not None:
        if data['document_format']!='json' or data['mode']!='unknown' or 'execution_adapter' in data:
            raise ValidationError('Python原始验证解读格式无效')
        payload.update(feedback_version=4,native_check=native_check)
    if data['document_format'] == 'mql_set':
        from quant.parameters.mql_set import parse
        payload.update(feedback_version=2, parameter_configuration=parse(data['document']))
    if 'execution_adapter' in data:
        from .execution import freeze
        payload.update(feedback_version=3, **freeze(data['document'], data['execution_adapter'], data['execution_options']))
    target, _, _ = linked(entry, payload)
    if native_check is not None:
        from quant.native_python.evidence import linked_summary
        linked_summary(payload)
    if payload.get('feedback_version') == 2:
        from quant.parameters.comparison import compare
        payload['parameter_comparison'] = compare(payload['parameter_configuration'],
            {'id': target.pk, 'content_hash': target.content_hash, 'payload': target.payload})
    material = SourceMaterial.objects.create(id=identity, entry=entry, title=data['title'], current_revision_id=identity)
    source = SourceRevision.objects.create(id=identity, material=material, payload=payload, content_hash=digest(payload))
    from quant.verification.services import feedback as archive_verification
    archive_verification(source)
    notice = ''
    if data['analyze']:
        try:
            queue(entry, {'kind': 'feedback_review', 'source_id': source.pk,
                'request_key': data['request_key'], 'model_id': data['model_id']})
        except (ValidationError, Conflict, ModelUnavailable) as exc:
            notice = str(exc.detail)
    touch(entry)
    return source, notice


def validate_input(entry, values: dict, existing=None) -> dict:
    source = SourceRevision.objects.select_related('material__entry').filter(pk=values['source_id'], material__entry=entry).first()
    if not source or source.payload.get('provenance') != 'external_feedback':
        raise ValidationError('请选择当前研究的外部反馈')
    from quant.native_reviews.policy import prepare
    prepare(source,values,existing)
    from .contracts import prompt
    from .memory import freeze, for_source as memory_for_source
    selection = existing.planning_context if existing and existing.kind == 'feedback_review' else freeze(source)
    context = for_source(source)
    if selection:
        context['research_memory'] = memory_for_source(source, selection)
        values['planning_context'] = selection
    memory = selection.get('library_memory') if selection else None
    while memory and memory['items'] and len(prompt(context, values.get('requirements', ''))) > 210000:
        # Drop only whole optional historical records. Current feedback and
        # linked calculation evidence must never disappear to fit a prompt.
        memory['items'].pop()
        memory['omitted_for_size'] += 1
        context['research_memory'] = memory_for_source(source, selection)
    if len(prompt(context, values.get('requirements', ''))) > 210000:
        raise ValidationError('反馈与实验规划材料超过分析上限，请拆分报告；原文仍保留')
    values.update(source_version_id=None, target_language='', target_version='')
    return values
