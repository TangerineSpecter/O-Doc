"""Paged definitions and selection events, never inherited report scores."""
import json
from .services import root_of
from quant.factors.contracts import Candidate


def definition_json(candidate) -> str:
    return json.dumps({key: candidate.data[key] for key in Candidate().fields if key != 'evidence'}, ensure_ascii=False, indent=2)


def history(candidate, offset: int, limit: int) -> dict:
    root = root_of(candidate)
    versions = root.formula_versions.select_related('candidate').order_by('-created_at', 'id')
    count = versions.count()
    records = [{'id': row.pk, 'candidate_id': row.candidate_id, 'candidate_hash': row.candidate.content_hash,
        'name': row.candidate.data['name'], 'origin': row.data['origin'],
        'parent_candidate_ids': [ref['id'] for ref in row.data['parents']], 'reason': row.data['reason'],
        'created_at': row.created_at.isoformat(), 'formula': row.candidate.data['formula'], 'expression_hash': row.candidate.expression_hash} for row in versions[offset:offset + limit]]
    extra = not root.formula_version_id
    total = count + int(extra)
    if extra and offset <= count < offset + limit:
        records.append({'id': '', 'candidate_id': root.pk, 'candidate_hash': root.content_hash,
            'name': root.data['name'], 'origin': 'experiment' if root.derived_checkpoint_id else 'source', 'parent_candidate_ids': [],
            'reason': '谱系起点；旧来源/实验事实完整保留。', 'created_at': root.created_at.isoformat(), 'formula': root.data['formula'], 'expression_hash': root.expression_hash})
    head = root.formula_selections.filter(pk=root.formula_selection_id).select_related('candidate').first() if root.formula_selection_id else None
    selected = root.formula_selections.order_by('-created_at', 'id')
    return {'version': 1, 'root_candidate_id': root.pk, 'current_candidate_id': head.candidate_id if head else root.pk,
        'root_name': root.data['name'], 'candidate_name': candidate.data['name'], 'current_name': head.candidate.data['name'] if head else root.data['name'],
        'candidate_id': candidate.pk, 'definition_json': definition_json(candidate),
        'current_selection_id': root.formula_selection_id, 'versions_total': total, 'versions': records,
        'selections_total': selected.count(), 'selections': [{'id': row.pk, 'candidate_id': row.candidate_id,
            'parent_id': row.parent_id, 'reason': row.data['reason'], 'created_at': row.created_at.isoformat()}
            for row in selected[offset:offset + limit]],
        'claim': 'working_version_only_not_performance_promotion'}
