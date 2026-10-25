from django.shortcuts import get_object_or_404
from rest_framework import serializers
from quant.models import FactorCandidate
from quant.views import QuantView
from utils.response_utils import success_result
from .services import detail, backfill


class VerificationView(QuantView):
    def candidate(self, identity):
        return get_object_or_404(FactorCandidate.objects.select_related('report__entry').prefetch_related('qualifications'),
            pk=identity, report__entry__anthology=self.collection, report__entry__is_valid=True)

    def get(self, request, coll_id, factor_id):
        class Query(serializers.Serializer):
            offset = serializers.IntegerField(min_value=0, default=0)
            limit = serializers.IntegerField(min_value=1, max_value=40, default=20)
        value = Query(data=request.query_params); value.is_valid(raise_exception=True)
        return success_result(detail(self.candidate(factor_id), **value.validated_data))

    def post(self, request, coll_id, factor_id):
        class Input(serializers.Serializer):
            kind = serializers.ChoiceField(choices=['experiment', 'comparison', 'feedback'], default='experiment')
            offset = serializers.IntegerField(min_value=0, default=0)
            limit = serializers.IntegerField(min_value=1, max_value=50, default=20)
        value = Input(data=request.data); value.is_valid(raise_exception=True)
        return success_result(backfill(self.candidate(factor_id), **value.validated_data))
