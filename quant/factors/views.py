"""Collection owner boundary for automatically archived and user-curated candidates."""
from quant.admissions.services import compact_prefetch as admission_prefetch
import json
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import MethodNotAllowed
from utils.response_utils import success_result
from quant.models import FactorCandidate
from quant.views import QuantView
from .services import candidate_data
from .contracts import ROLES, FAMILIES
from .curation import curation_data, revise_candidate
from .grouping import group_candidates, group_key


class Query(serializers.Serializer):
    q = serializers.CharField(max_length=200, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=['', *ROLES], required=False)
    family = serializers.ChoiceField(choices=['', *FAMILIES], required=False)
    reuse_status = serializers.ChoiceField(choices=['', 'reusable', 'candidate', 'unchecked'], required=False)
    admission_stage = serializers.ChoiceField(choices=['','unrecorded','candidate','reusable','calculated','historical','fixed_observation','registered_criteria_met'],required=False)
    taxonomy_term = serializers.CharField(max_length=48, required=False, allow_blank=True)
    entry_id = serializers.CharField(max_length=40, required=False, allow_blank=True)
    group_by = serializers.ChoiceField(choices=['none', 'raw', 'expression', 'merged', 'lineage'], default='none')
    offset = serializers.IntegerField(min_value=0, default=0)
    limit = serializers.IntegerField(min_value=1, max_value=100, default=40)


def matches(candidate: FactorCandidate, query: dict, vocabulary=None) -> bool:
    curated = curation_data(candidate)['curation']
    if query.get('role') and query['role'] != candidate.data['role']:
        return False
    if query.get('family') and query['family'] != curated['family']:
        return False
    if query.get('entry_id') and query['entry_id'] != candidate.report.entry_id:
        return False
    if query.get('admission_stage'):
        from quant.admissions.services import summary
        if summary(candidate)['stage']!=query['admission_stage']:return False
    if query.get('reuse_status'):
        from quant.verification.services import projection
        if projection(candidate)['reuse_status'] != query['reuse_status']: return False
    if not query.get('taxonomy_term') and not query.get('q', '').strip():
        return True
    from quant.taxonomy.normalization import classify, search_labels
    classification = classify(candidate.data, curated, *vocabulary, platform=candidate.report.source.payload.get('platform', '') if not candidate.data.get('formula_version') and not candidate.derived_checkpoint_id else '') if vocabulary else None
    if query.get('taxonomy_term') and (not classification or query['taxonomy_term'] not in {row['id'] for row in classification['terms']}):
        return False
    from quant.taxonomy.contracts import key
    term = key(query.get('q', ''))
    return not term or any(term in key(str(text)) for text in [curated['name'], curated['note'],
        *curated['tags'], *curated['aliases'], candidate.data['name'], candidate.data['summary'], candidate.data['formula'],
        json.dumps(candidate.data['expression'], ensure_ascii=False) if candidate.data['expression'] is not None else '', candidate.report.entry.title,
        *(search_labels(classification) if classification else [])])


class FactorView(QuantView):
    def candidates(self):
        return FactorCandidate.objects.filter(report__entry__anthology=self.collection,
            report__entry__is_valid=True).select_related('report__entry', 'report__run').prefetch_related(
                'revisions', 'report__source', 'qualifications', admission_prefetch()).defer('report__data', 'report__markdown', 'report__entry__content')

    def get(self, request, coll_id, factor_id=None, action=None):
        candidates = self.candidates()
        from quant.taxonomy.services import current
        vocabulary = current(self.collection.pk)
        if factor_id and action == 'export':
            from quant.exports.service import bundle
            return success_result(bundle(get_object_or_404(candidates, pk=factor_id), request.query_params.get('target', 'python')))
        if factor_id and not action:
            return success_result(candidate_data(get_object_or_404(candidates, pk=factor_id), vocabulary))
        query = Query(data=request.query_params)
        query.is_valid(raise_exception=True)
        values = query.validated_data
        start, limit = values['offset'], values['limit']
        if values['group_by'] == 'lineage':
            from .versions.groups import groups
            grouped = groups(list(candidates))
            if action == 'occurrences':
                target = get_object_or_404(candidates, pk=factor_id)
                related = next(members for members, _, _ in grouped if any(row.pk == target.pk for row in members))
                return success_result({'total': len(related), 'items': [candidate_data(row, vocabulary) for row in related[start:start + limit]]})
            selected = [(members, head, meta) for members, head, meta in grouped if matches(head,{'admission_stage':values.get('admission_stage')},vocabulary) and any(matches(row,{**values,'admission_stage':''},vocabulary) for row in members)]
            return success_result({'total': len(selected), 'occurrence_total': sum(len(members) for members, _, _ in selected),
                'items': [candidate_data(head, vocabulary) | {'occurrence_count': len(members), 'formula_lineage': meta}
                    for members, head, meta in selected[start:start + limit]]})
        if values['group_by'] == 'merged':
            from quant.comparisons.groups import components, group_data
            groups, links = components(list(candidates))
            if action == 'occurrences':
                target = get_object_or_404(candidates, pk=factor_id)
                related = next(group for group in groups if any(row.pk == target.pk for row in group))
                return success_result({'total': len(related), 'items': [candidate_data(row, vocabulary) for row in related[start:start + limit]]})
            selected = []
            for group in groups:
                metadata = group_data(group, links)
                term = values.get('q', '').casefold()
                label_match = term and any(term in item.casefold() for item in metadata['names'] + metadata['aliases'])
                if not matches(group[0],{'admission_stage':values.get('admission_stage')},vocabulary):continue
                if any(matches(row,{**values,'admission_stage':''},vocabulary) for row in group) or label_match and any(matches(row,{**values,'admission_stage':'','q':''},vocabulary) for row in group):
                    selected.append((group, metadata))
            return success_result({'total': len(selected), 'occurrence_total': sum(len(group) for group, _ in selected),
                'items': [candidate_data(group[0], vocabulary) | {'occurrence_count': len(group), 'merged_group': metadata}
                          for group, metadata in selected[start:start + limit]]})
        if action == 'occurrences':
            target = get_object_or_404(candidates, pk=factor_id)
            key = group_key(target, values['group_by'])
            related = [item for item in candidates if group_key(item, values['group_by']) == key]
            return success_result({'total': len(related), 'items': [candidate_data(row, vocabulary) for row in related[start:start + limit]]})
        filtered = [row for row in candidates if matches(row, values, vocabulary)]
        groups = group_candidates(filtered, values['group_by'])
        return success_result({'total': len(groups), 'occurrence_total': len(filtered),
            'items': [candidate_data(group[0], vocabulary) | {'occurrence_count': len(group)} for group in groups[start:start + limit]]})

    def patch(self, request, coll_id, factor_id=None, action=None):
        if not factor_id or action:
            raise MethodNotAllowed('PATCH')
        class Edit(serializers.Serializer):
            data = serializers.DictField()
            expected_revision_id = serializers.CharField(max_length=40, allow_blank=True)
        serializer = Edit(data=request.data)
        serializer.is_valid(raise_exception=True)
        candidate = get_object_or_404(self.candidates(), pk=factor_id)
        revise_candidate(candidate, **serializer.validated_data)
        return success_result(candidate_data(self.candidates().get(pk=factor_id)))
