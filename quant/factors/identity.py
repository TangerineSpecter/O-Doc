"""Exact extraction identity across repeated analyses of the same source.

This is not semantic/formula equivalence. All saved factor facts must match;
experiments and authored formula changes keep their own identities.
"""
from django.db.models import F, Q
from quant.models import FactorCandidate, FactorRevision


def extraction_key(candidate):
    if candidate.formula_version_id or candidate.derived_checkpoint_id:
        return ('candidate', candidate.pk)
    return (candidate.report.entry_id, candidate.report.source_id, candidate.content_hash)


def canonical_roots(candidates: list) -> dict[str, str]:
    groups = {}
    for row in candidates:
        groups.setdefault(extraction_key(row), []).append(row)
    aliases = {}
    for members in groups.values():
        # An explicit working selection must stay reachable. Independent
        # selections are not collapsed merely because their roots match.
        selected = [row for row in members if row.formula_selection_id]
        if len(selected) > 1:
            aliases.update({row.pk: row.pk for row in members})
            continue
        root = selected[0] if selected else min(members, key=lambda row: (row.created_at, row.pk))
        aliases.update({row.pk: root.pk for row in members})
    return aliases


def inherited_curations(candidates: list[FactorCandidate]) -> dict[tuple, FactorRevision]:
    """Read current peer heads in batches, including peers outside a page/report."""
    keys = list(dict.fromkeys(extraction_key(row) for row in candidates
        if not row.formula_version_id and not row.derived_checkpoint_id))
    latest = {}
    # Bound SQL parameters/expression depth on SQLite as well as PostgreSQL.
    for start in range(0, len(keys), 200):
        sources = {}
        for entry_id, source_id, content_hash in keys[start:start + 200]:
            sources.setdefault((entry_id, source_id), []).append(content_hash)
        scope = Q()
        for (entry_id, source_id), hashes in sources.items():
            scope |= Q(candidate__report__entry_id=entry_id, candidate__report__source_id=source_id,
                candidate__content_hash__in=hashes)
        heads = FactorRevision.objects.filter(scope, candidate__current_revision_id=F('id'),
            candidate__formula_version_id='', candidate__derived_checkpoint_id='').select_related(
                'candidate__report').only('id', 'created_at', 'data', 'candidate_id',
                    'candidate__report_id', 'candidate__content_hash',
                    'candidate__report__entry_id', 'candidate__report__source_id').order_by('-created_at', '-id')
        for revision in heads:
            candidate = revision.candidate
            key = (candidate.report.entry_id, candidate.report.source_id, candidate.content_hash)
            latest.setdefault(key, revision)
    return latest
