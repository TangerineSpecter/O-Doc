"""Freeze a bounded same-source research memory when the user requests analysis."""
import json
from rest_framework.exceptions import ValidationError
from quant.models import FactorCandidate, SourceRevision
from quant.experiments.library_contract import option

METHOD = 'feedback-research-1'


def history_item(identity: str, source: dict) -> dict:
    payload = source['payload']
    if payload.get('feedback_version') == 3:
        from .execution import summary
        return {'id': identity, 'content_hash': source['content_hash'],
                **{key: payload[key] for key in ('title', 'document_format', 'mode', 'platform', 'notes')},
                'execution_summary': summary(payload)}
    return {'id': identity, 'content_hash': source['content_hash'],
            **{key: payload[key] for key in ('title', 'document', 'document_format', 'mode', 'platform', 'notes')}}


def freeze(source) -> dict:
    payload = source.payload
    candidates = []
    if not payload['factor_id'] and not payload['experiment_result_id']:
        for candidate in FactorCandidate.objects.filter(report__source_id=payload['target_source_id']).order_by('id')[:200]:
            try:
                option(candidate.pk, candidate.data)
            except (ValidationError, ValueError, TypeError, KeyError):
                continue
            candidates.append(candidate.pk)
            if len(candidates) == 8:
                break
    history, size = [], 0
    for row in SourceRevision.objects.filter(material__entry=source.material.entry,
            payload__provenance='external_feedback', payload__target_source_id=payload['target_source_id'],
            created_at__lt=source.created_at.replace(microsecond=source.created_at.microsecond // 1000 * 1000)).order_by('-created_at', '-id')[:100]:
        amount = len(json.dumps(history_item(row.pk, {'payload': row.payload, 'content_hash': row.content_hash}), ensure_ascii=False))
        if size + amount > 24000:
            continue  # Keep whole records, including their negative evidence.
        history.append(row.pk); size += amount
        if len(history) == 4:
            break
    selection = {'version': 1, 'method': METHOD, 'candidate_ids': candidates, 'history_ids': history}
    from .evidence import for_source as source_context
    from .planning import options
    from quant.research_memory import freeze as freeze_library
    context = source_context(source)
    context['research_memory'] = for_source(source, selection)
    return {**selection, 'version': 4, 'method': 'feedback-research-4',
            'library_memory': freeze_library(options(context), str(source.material.entry.anthology_id),
                exclude_result_id=payload['experiment_result_id'] or None, source_id=source.pk, version=3)}


def project(selection: dict, source_id: str, source: dict, candidates: dict, sources: dict) -> dict:
    if isinstance(selection, dict) and type(selection.get('version')) is int and selection['version'] in (2, 3, 4):
        if set(selection) != {'version', 'method', 'candidate_ids', 'history_ids', 'library_memory'} or selection['method'] != f"feedback-research-{selection['version']}":
            raise ValidationError('跨来源反馈研究记忆版本无效')
        legacy = {key: value for key, value in selection.items() if key != 'library_memory'}
        legacy.update(version=1, method=METHOD)
        from quant.research_memory.contract import instant
        normalized_source = {**source, 'created_at': instant(source['created_at']).isoformat(timespec='milliseconds')}
        normalized_sources = dict(sources)
        for identity in selection['history_ids']:
            if identity in normalized_sources:
                row = normalized_sources[identity]
                normalized_sources[identity] = {**row, 'created_at': instant(row['created_at']).isoformat(timespec='milliseconds')}
        value = project(legacy, source_id, normalized_source, candidates, normalized_sources)
        import copy
        return {**value, 'method': selection['method'], 'library_memory': copy.deepcopy(selection['library_memory'])}
    if (not isinstance(selection, dict) or set(selection) != {'version', 'method', 'candidate_ids', 'history_ids'}
            or type(selection['version']) is not int or selection['version'] != 1 or selection['method'] != METHOD):
        raise ValidationError('反馈研究记忆版本无效')
    for field, maximum in [('candidate_ids', 8), ('history_ids', 4)]:
        value = selection[field]
        if not isinstance(value, list) or len(value) > maximum or any(not isinstance(key, str) for key in value) or len(set(value)) != len(value):
            raise ValidationError('反馈研究记忆引用无效')
    payload = source['payload']
    if selection['candidate_ids'] and (payload['factor_id'] or payload['experiment_result_id']):
        raise ValidationError('已指定目标时不得额外替换父代')
    parents = []
    for identity in selection['candidate_ids']:
        candidate = candidates.get(identity, {})
        if candidate.get('source_id') != payload['target_source_id']:
            raise ValidationError('反馈研究候选不属于目标来源')
        parents.append(option(identity, candidate['data']))
    history = []
    for identity in selection['history_ids']:
        row = sources.get(identity, {})
        if (identity == source_id or row.get('entry_id') != source['entry_id']
                or row.get('payload', {}).get('provenance') != 'external_feedback'
                or row['payload'].get('target_source_id') != payload['target_source_id']
                or str(row.get('created_at')) >= str(source['created_at'])):
            raise ValidationError('反馈研究记忆必须引用同来源的较早记录')
        history.append(history_item(identity, row))
    if sum(len(json.dumps(row, ensure_ascii=False)) for row in history) > 24000:
        raise ValidationError('反馈研究记忆超过材料上限')
    return {'method': METHOD, 'options': parents, 'history': history,
            'scope': 'same_source_bounded_history_not_independent_validation'}


def for_source(source, selection: dict) -> dict:
    candidates = {row.pk: {'source_id': row.report.source_id, 'data': row.data}
                  for row in FactorCandidate.objects.select_related('report').filter(pk__in=selection['candidate_ids'])}
    sources = {row.pk: {'entry_id': row.material.entry_id, 'payload': row.payload,
                       'created_at': row.created_at.isoformat(), 'content_hash': row.content_hash}
               for row in SourceRevision.objects.select_related('material').filter(pk__in=[source.pk, *selection['history_ids']])}
    return project(selection, source.pk, sources[source.pk], candidates, sources)


def from_rows(run: dict, rows: dict) -> dict:
    reports, materials = rows.get('quant.researchreport', {}), rows.get('quant.sourcematerial', {})
    candidates = {key: {'source_id': reports.get(str(value.get('report')), {}).get('source'), 'data': value['data']}
                  for key, value in rows.get('quant.factorcandidate', {}).items()}
    sources = {key: {**value, 'entry_id': materials.get(str(value['material']), {}).get('entry')}
               for key, value in rows.get('quant.sourcerevision', {}).items()}
    value = project(run['planning_context'], str(run['source']), sources[str(run['source'])], candidates, sources)
    if run['planning_context'].get('version') in (2, 3, 4):
        from .sync import context_from_rows
        from .planning import options
        from quant.research_memory import validate_from_rows as validate_memory
        def fail(message):
            raise ValidationError(message)
        context = context_from_rows(sources[str(run['source'])], rows, fail)
        context['research_memory'] = value
        entry = rows['quant.entry'][str(sources[str(run['source'])]['entry_id'])]
        if value['library_memory'].get('version') != run['planning_context']['version'] - 1:
            raise ValidationError('反馈研究记忆不能升级或降级历史合同')
        validate_memory(value['library_memory'], rows, collection_id=str(entry['anthology']), latest_at=run['created_at'],
                        options=options(context), exclude_result_id=sources[str(run['source'])]['payload']['experiment_result_id'] or None,
                        exclude_source_id=str(run['source']))
    return value
