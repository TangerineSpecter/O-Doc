"""Owner-scoped inspection and explicit legacy indexing."""
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from quant.models import FactorCandidate,FactorAdmission
from quant.views import QuantView
from utils.response_utils import success_result
from .services import detail,backfill


class Page(serializers.Serializer):
    offset=serializers.IntegerField(min_value=0,default=0)
    limit=serializers.IntegerField(min_value=1,max_value=40,default=20)


class AdmissionView(QuantView):
    def candidate(self,identity):
        return get_object_or_404(FactorCandidate.objects.select_related('report__entry').prefetch_related(
            Prefetch('admission_records',queryset=FactorAdmission.objects.only('id','candidate_id','stage','outcome'))),
            pk=identity,report__entry__anthology=self.collection,report__entry__is_valid=True)

    def get(self,request,coll_id,factor_id):
        value=Page(data=request.query_params);value.is_valid(raise_exception=True)
        return success_result(detail(self.candidate(factor_id),**value.validated_data))

    def post(self,request,coll_id,factor_id):
        value=Page(data=request.data);value.is_valid(raise_exception=True)
        return success_result(backfill(self.candidate(factor_id),**value.validated_data))
