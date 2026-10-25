from quant.admissions.services import compact_prefetch as admission_prefetch
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from utils.response_utils import success_result
from quant.models import FactorCandidate
from quant.views import QuantView
from quant.factors.services import candidate_data
from .services import edit, select
from .presentation import history


class FormulaView(QuantView):
    def candidate(self, identity):
        return get_object_or_404(FactorCandidate.objects.select_related('report__entry', 'report__run').prefetch_related('revisions', 'qualifications', admission_prefetch()),
            pk=identity, report__entry__anthology=self.collection, report__entry__is_valid=True)

    def get(self, request, coll_id, factor_id, action=None):
        class Query(serializers.Serializer):
            offset = serializers.IntegerField(min_value=0, default=0)
            limit = serializers.IntegerField(min_value=1, max_value=40, default=20)
        query = Query(data=request.query_params); query.is_valid(raise_exception=True)
        return success_result(history(self.candidate(factor_id), **query.validated_data))

    def post(self, request, coll_id, factor_id, action=None):
        class Input(serializers.Serializer):
            request_key = serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
            reason = serializers.CharField(max_length=3000)
        class EditInput(Input):
            definition_json = serializers.CharField(max_length=150000, trim_whitespace=False)
        class SelectInput(Input):
            expected_selection_id = serializers.CharField(max_length=40, allow_blank=True)
        serializer = SelectInput(data=request.data) if action == 'select' else EditInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        candidate = self.candidate(factor_id)
        if action == 'select':
            select(candidate, **serializer.validated_data)
            return success_result(history(self.candidate(factor_id), 0, 20))
        child = edit(candidate, **serializer.validated_data)
        return success_result({'candidate': candidate_data(child), 'history': history(child, 0, 20)})
