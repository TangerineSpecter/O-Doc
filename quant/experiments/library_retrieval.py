"""Bounded cross-source discovery using existing semantic edges and declared contracts."""
import json
from django.db.models import Q
from rest_framework.exceptions import ValidationError
from quant.models import FactorCandidate, FactorRelation
from .planning_context import for_result as base_options
from .library_contract import METHOD, METHOD_V2, LIMIT, EXTRA_LIMIT, option, compatible, reason, structural_key


def retrieve(result, *, method=METHOD):
    base = base_options(result)
    parents = list(FactorCandidate.objects.filter(pk__in=[row['id'] for row in base]).select_related('report__entry'))
    parent_ids = {row.pk for row in parents}
    source_ids = {row.report.source_id for row in parents}
    records = list(FactorCandidate.objects.filter(report__entry__anthology_id=result.request.anthology_id,
        report__entry__is_valid=True).exclude(report__source_id__in=source_ids).exclude(pk__in=parent_ids)
        .select_related('report__entry').order_by('-created_at', 'id')[:LIMIT])
    by_id = {row.pk: row for row in [*parents, *records]}
    edges = FactorRelation.objects.filter(Q(left_id__in=parent_ids, right_id__in=[row.pk for row in records])
        | Q(right_id__in=parent_ids, left_id__in=[row.pk for row in records])).filter(kind='semantic_similar').order_by('-created_at', 'id')[:LIMIT]
    semantic = {}
    for edge in edges:
        left, right = by_id[edge.left_id], by_id[edge.right_id]
        if left.current_revision_id != edge.evidence['left_revision_id'] or right.current_revision_id != edge.evidence['right_revision_id']:
            continue  # A renamed/retagged node needs a fresh embedding relation.
        identity, parent = (right.pk, left.pk) if left.pk in parent_ids else (left.pk, right.pk)
        item = {'relation_id': edge.pk, 'parent_id': parent, 'similarity': edge.evidence['similarity']}
        if identity not in semantic or (item['similarity'], item['relation_id']) > (semantic[identity]['similarity'], semantic[identity]['relation_id']):
            semantic[identity] = item
    known = {structural_key(row, method) for row in base}
    eligible = []
    for record in records:
        try:
            candidate = option(record.pk, record.data)
            if structural_key(candidate, method) in known or not compatible(candidate, base):
                continue
        except (ValidationError, ValueError, TypeError, KeyError, OverflowError):
            continue
        known.add(structural_key(candidate, method))
        explanation = reason(record.data, base, semantic.get(record.pk))
        info = {'candidate_id': record.pk, 'source_id': record.report.source_id, 'report_id': record.report_id,
            'entry_id': record.report.entry_id, 'entry_title': record.report.entry.title, 'reason': explanation, 'selection': 'related'}
        eligible.append((candidate, info))
    eligible.sort(key=lambda row: (-row[1]['reason']['rank_score'], row[0]['id']))
    # Reserve one slot for a different mechanism when contracts permit combination.
    selected = eligible[:EXTRA_LIMIT - 1]
    families = {row['candidate']['family'] for row in base} | {row[0]['candidate']['family'] for row in selected}
    diverse = next((row for row in eligible[EXTRA_LIMIT - 1:] if row[0]['candidate']['family'] not in families), None)
    if diverse:
        diverse[1]['selection'] = 'diversity'; selected.append(diverse)
    elif len(eligible) >= EXTRA_LIMIT:
        selected.append(eligible[EXTRA_LIMIT - 1])
    # Keep the model context small; omitted candidates remain in the library.
    bounded, size = [], 0
    for row in selected:
        length = len(json.dumps(row, ensure_ascii=False))
        if size + length <= 32000:
            bounded.append(row); size += length
    return {'version': 1, 'method': method, 'scan_limit': LIMIT, 'scanned': len(records), 'eligible': len(eligible),
        'omitted_for_size': len(selected) - len(bounded), 'options': base + [row[0] for row in bounded],
        'retrieved': [row[1] for row in bounded]}


def validate_from_rows(run, rows, base):
    from .library_contract import validate_context
    reports, entries = rows.get('quant.researchreport', {}), rows.get('quant.entry', {})
    candidates = {}
    for identity, fields in rows.get('quant.factorcandidate', {}).items():
        report = reports.get(str(fields.get('report')), {})
        entry = entries.get(str(report.get('entry')), {})
        candidates[identity] = {'data': fields.get('data'), 'source_id': str(report.get('source')),
            'report_id': str(fields.get('report')), 'entry_id': str(report.get('entry')), 'collection_id': str(entry.get('anthology'))}
    source_ids = {candidates[row['id']]['source_id'] for row in base}
    validate_context(run.get('planning_context'), base, candidates, rows.get('quant.factorrelation', {}),
        collection_id=str(entries[str(run['entry'])]['anthology']), source_ids=source_ids,
        method=METHOD_V2 if run.get('review_version') in (15, 16, 17) else METHOD)

    if run.get('review_version') in (6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17):
        context = run.get('planning_context', {})
        version = 7 if run['review_version'] == 17 else 6 if run['review_version'] in (11, 12, 13, 14, 15, 16, 17) else 5 if run['review_version'] == 10 else 4 if run['review_version'] == 9 else 2 if run['review_version'] == 6 else 3
        if context.get('version') != version or 'research_memory' not in context or context['research_memory'].get('version') != (3 if version in (5, 6, 7) else 2 if version == 4 else version - 1):
            raise ValidationError('新版实验解读缺少历史研究快照')
        from quant.research_memory import validate_from_rows as validate_memory
        validate_memory(context['research_memory'], rows, collection_id=str(entries[str(run['entry'])]['anthology']),
                        latest_at=run['created_at'], options=context['options'], exclude_result_id=str(run['experiment_result']), exclude_validation_id=str(run['validation_result']) if run.get('validation_result') else None)
    elif run.get('planning_context', {}).get('version') != 1:
        raise ValidationError('历史实验解读不得升级历史研究输入')
    if run.get('review_version') == 17:
        from .output_associations import validate
        result = rows['quant.experimentresult'][str(run['experiment_result'])]
        request = rows['quant.experimentrequest'][str(result['request'])]
        validate(context.get('output_associations'), rows, context['options'], request['plan'],
            collection_id=str(entries[str(run['entry'])]['anthology']), latest_at=run['created_at'])
