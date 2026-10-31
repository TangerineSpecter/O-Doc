"""Batch lineage grouping selects the explicit working head, never latest score."""
from quant.models import FactorCandidate, FactorFormulaVersion, FactorFormulaSelection


def groups(candidates: list) -> list[tuple[list, object, dict]]:
    from quant.factors.identity import canonical_roots
    aliases = canonical_roots(candidates)
    versions = {row['candidate_id']: row['root_id'] for row in FactorFormulaVersion.objects.filter(
        pk__in=[row.formula_version_id for row in candidates if row.formula_version_id]).values('candidate_id', 'root_id')}
    by_root = {}
    for candidate in candidates:
        root = versions.get(candidate.pk, candidate.pk)
        by_root.setdefault(aliases.get(root, root), []).append(candidate)
    roots = {row['id']: row['formula_selection_id'] for row in FactorCandidate.objects.filter(pk__in=by_root).values('id', 'formula_selection_id')}
    selections = {row['id']: row['candidate_id'] for row in FactorFormulaSelection.objects.filter(
        pk__in=[key for key in roots.values() if key]).values('id', 'candidate_id')}
    output = []
    for root_id, members in by_root.items():
        pointer = roots[root_id]
        selected = selections.get(pointer, root_id)
        visible = {row.pk: row for row in members}
        representative = visible.get(selected) or visible.get(root_id) or members[0]
        output.append((members, representative, {'id': 'lineage:' + root_id, 'root_candidate_id': root_id,
            'current_candidate_id': selected, 'current_selection_id': pointer, 'current_available': selected in visible,
            'versions_total': len({aliases.get(row.pk, row.pk) for row in members})}))
    return output
