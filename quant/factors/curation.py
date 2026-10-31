"""Append-only user labels with optimistic concurrency; original calculations stay intact."""
import unicodedata
from django.db import transaction
from django.db.models import prefetch_related_objects
from rest_framework import serializers
from quant.locking import collection_lock
from quant.models import Entry, FactorCandidate, FactorRevision
from quant.research.contracts import digest
from quant.services import Conflict, touch
from .contracts import FAMILIES


def unique_labels(values: list[str]) -> list[str]:
    seen, result = set(), []
    for item in values:
        text = unicodedata.normalize('NFKC', item).strip()
        key = text.casefold()
        if key and key not in seen:
            seen.add(key)
            result.append(text)
    return result


class Curation(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    family = serializers.ChoiceField(choices=FAMILIES)
    aliases = serializers.ListField(child=serializers.CharField(max_length=100), max_length=30)
    tags = serializers.ListField(child=serializers.CharField(max_length=50), max_length=30)
    note = serializers.CharField(max_length=10000, allow_blank=True, trim_whitespace=False)

    def validate_aliases(self, value):
        normalized = unique_labels(value)
        if any(len(item) > 100 for item in normalized):
            raise serializers.ValidationError('规范化后的别名最多100字符')
        return normalized

    def validate_tags(self, value):
        normalized = unique_labels(value)
        if any(len(item) > 50 for item in normalized):
            raise serializers.ValidationError('规范化后的标签最多50字符')
        return normalized


def default_curation(candidate: FactorCandidate) -> dict:
    return {key: candidate.data[key] for key in ('name', 'family', 'tags')} | {'aliases': [], 'note': ''}


def curation_data_many(candidates: list[FactorCandidate]) -> dict[str, dict]:
    """A request-local projection; never cache mutable label heads globally."""
    from .identity import extraction_key, inherited_curations
    prefetch_related_objects(candidates, 'report', 'revisions')
    inherited = inherited_curations(candidates)
    result = {}
    for candidate in candidates:
        revisions = list(candidate.revisions.all())
        current = next((row for row in revisions if row.pk == candidate.current_revision_id), None)
        shared = inherited.get(extraction_key(candidate))
        if shared and (not current or (shared.created_at, shared.pk) > (current.created_at, current.pk)):
            current = shared
        result[candidate.pk] = {'current_revision_id': candidate.current_revision_id,
            'curation_revision_id': current.pk if current else '',
            'curation_inherited': bool(current and current.candidate_id != candidate.pk),
            'curation': current.data if current else default_curation(candidate),
            'revisions': [{'id': row.pk, 'parent_id': row.parent_id, 'data': row.data,
                'created_at': row.created_at.isoformat()} for row in revisions]}
    return result


def curation_data(candidate: FactorCandidate, *, curations: dict[str, dict] | None = None) -> dict:
    return curations[candidate.pk] if curations is not None else curation_data_many([candidate])[candidate.pk]


def revise_candidate(candidate: FactorCandidate, data: dict, expected_revision_id: str,
                     expected_curation_revision_id: str) -> FactorRevision:
    serializer = Curation(data=data)
    serializer.is_valid(raise_exception=True)
    with collection_lock(candidate.report.entry.anthology_id), transaction.atomic():
        # Duplicate extractions share the entry even when their reports differ.
        # Lock that common owner before either candidate's mutable head.
        Entry.objects.select_for_update().get(pk=candidate.report.entry_id)
        candidate = FactorCandidate.objects.select_for_update().select_related('report__entry').get(pk=candidate.pk)
        if candidate.current_revision_id != expected_revision_id:
            raise Conflict('因子已有新修订，请刷新后合并修改')
        if curation_data(candidate)['curation_revision_id'] != expected_curation_revision_id:
            raise Conflict('同一算法的整理已有新修订，请刷新后合并修改')
        normalized = dict(serializer.validated_data)
        revision = FactorRevision.objects.create(candidate=candidate, parent_id=expected_revision_id,
            data=normalized, content_hash=digest(normalized))
        candidate.current_revision_id = revision.pk
        candidate.save(update_fields=['current_revision_id', 'updated_at'])
        touch(candidate.report.entry)
        # Rebuild after commit, without extending the user's save transaction.
        from quant.graph.indexing import auto_index
        transaction.on_commit(lambda: auto_index(candidate.report_id))
        return revision
