from rest_framework import serializers
from rest_framework.views import APIView
from quant.access import owned_collection
from quant.views import QuantView
from quant.factors.contracts import ROLES, FAMILIES
from utils.response_utils import success_result
from .service import search


class SearchInput(serializers.Serializer):
    q = serializers.CharField(max_length=200, allow_blank=False)
    role = serializers.ChoiceField(choices=['', *ROLES], default='')
    family = serializers.ChoiceField(choices=['', *FAMILIES], default='')
    reuse_status = serializers.ChoiceField(choices=['', 'reusable', 'candidate', 'unchecked'], required=False)
    admission_stage = serializers.ChoiceField(choices=['','unrecorded','candidate','reusable','calculated','historical','fixed_observation','registered_criteria_met'],required=False)
    taxonomy_term = serializers.CharField(max_length=48, required=False, allow_blank=True)
    entry_id = serializers.CharField(max_length=40, required=False, allow_blank=True)
    group_by = serializers.ChoiceField(choices=['none', 'raw', 'expression'], default='none')


class FactorSearchView(QuantView):
    def initial(self, request, *args, **kwargs):
        # Authentication/error contracts stay shared; this explicit POST performs
        # external I/O, so only local snapshots take the domain lock/transaction.
        APIView.initial(self, request, *args, **kwargs)
        self.collection = owned_collection(request, kwargs['coll_id'])

    def post(self, request, coll_id):
        serializer = SearchInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return success_result(search(self.collection, serializer.validated_data,
                                     lambda: owned_collection(request, coll_id)))
