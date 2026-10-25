"""Frozen library comparison: structural matches and shared mechanisms, not proof."""
from quant.factors.expression import expression_hash


def match(factor: dict, candidate: dict, identity: str, content_hash: str) -> dict | None:
    exact = expression_hash(factor)
    same = bool(exact) and exact == expression_hash(candidate)
    if not same and (factor['family'] == 'other' or factor['family'] != candidate['family']):
        return None
    return {'candidate_id': identity, 'candidate_hash': content_hash,
        'basis': 'same_expression_contract' if same else 'shared_declared_family',
        'name': candidate['name'], 'family': candidate['family'], 'summary': candidate['summary'][:500],
        'claim': 'comparison_candidate_not_equivalence_or_performance'}


def library_snapshot(run, frozen: dict | None = None, factors=None, continuation=None) -> tuple[list, dict]:
    from quant.models import FactorCandidate
    if frozen is not None:
        from rest_framework.exceptions import ValidationError
        found = {row.pk: row for row in FactorCandidate.objects.filter(
            pk__in=[ref['id'] for ref in frozen['candidates']], report__entry__anthology=run.entry.anthology)}
        if any(ref['id'] not in found or found[ref['id']].content_hash != ref['hash'] for ref in frozen['candidates']):
            raise ValidationError('原比对快照缺少资料，请从检索比对阶段重新执行')
        return [found[ref['id']] for ref in frozen['candidates']], frozen
    candidates = list(FactorCandidate.objects.filter(report__entry__anthology=run.entry.anthology,
        report__entry__is_valid=True).order_by('-created_at', '-id')[:2001])
    rows = candidates[:2000]
    scope={'candidates': [{'id': row.pk, 'hash': row.content_hash} for row in rows],
        'truncated': len(candidates) > 2000}
    from .memory import uses_history,options
    if uses_history(run.workflow_version):
        from quant.research_memory import freeze
        if continuation and all(scope[key]==continuation.get(key) for key in ('candidates','truncated')):
            import copy
            scope['research_memory']=copy.deepcopy(continuation['research_memory'])
        else: scope['research_memory']=freeze(options(factors or []),str(run.entry.anthology_id),before=run.created_at.isoformat(),version=3)
    return rows,scope


def compare(rows: list, scope: dict, factors: list[dict], version=1) -> dict:
    matches = []
    for index, factor in enumerate(factors):
        options = [value for row in rows if (value := match(factor, row.data, row.pk, row.content_hash))]
        options.sort(key=lambda row: (row['basis'] != 'same_expression_contract', row['candidate_id']))
        matches.append({'factor_index': index, 'items': options[:5], 'matched_in_scope': len(options)})
    from .memory import uses_history
    import copy
    return {**({'research_memory':copy.deepcopy(scope['research_memory'])} if uses_history(version) else {}),'method': 'bounded-structure-family-v1', 'scope_limit': 2000, 'scanned': len(rows),
        'truncated': scope['truncated'], 'semantic_status': 'not_requested', 'matches': matches}
