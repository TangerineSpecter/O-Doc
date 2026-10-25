"""Owner-only comparison facts and reversible merge events."""
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.views import APIView
from utils.response_utils import success_result
from quant.access import owned_collection
from quant.locking import collection_lock
from quant.models import FactorComparison, FactorMerge
from quant.views import QuantView
from .contracts import ComparisonInput, MergeInput, Query, WithdrawalInput
from .groups import components, group_data
from .services import candidates, compare, comparison_data, create_merge, merge_data, withdraw


class ComparisonView(QuantView):
    def initial(self, request, *args, **kwargs):
        if request.method == 'POST' and not kwargs.get('comparison_id'):
            # CPU work runs between two short locked transactions in compare().
            APIView.initial(self, request, *args, **kwargs)
            self.collection = owned_collection(request, kwargs['coll_id'])
        else:
            super().initial(request, *args, **kwargs)

    def get(self, request, coll_id, comparison_id=None):
        records = FactorComparison.objects.filter(anthology=self.collection).select_related('dataset')
        if comparison_id:
            return success_result(comparison_data(get_object_or_404(records, pk=comparison_id), detail=True))
        serializer = Query(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        if values['factor_id']:
            get_object_or_404(candidates(self.collection), pk=values['factor_id'])
            records = records.filter(Q(left_id=values['factor_id']) | Q(right_id=values['factor_id']))
        offset, limit = values['offset'], values['limit']
        return success_result({'total': records.count(), 'items': [comparison_data(row) for row in records[offset:offset + limit]]})

    def post(self, request, coll_id, comparison_id=None):
        if comparison_id:
            raise MethodNotAllowed('POST')
        serializer = ComparisonInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = compare(self.collection, serializer.validated_data)
        # Snapshot restore can replace ownership and records after publication.
        # Project the response under the same short lock as ordinary reads.
        with collection_lock(coll_id), transaction.atomic():
            collection = owned_collection(request, coll_id)
            current = get_object_or_404(FactorComparison.objects.select_related('dataset'), anthology=collection, pk=record.pk)
            return success_result(comparison_data(current, detail=True))


class MergeView(QuantView):
    def get(self, request, coll_id, merge_id=None, action=None):
        if merge_id or action:
            raise MethodNotAllowed('GET')
        serializer = Query(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        records = FactorMerge.objects.filter(anthology=self.collection).select_related('comparison', 'withdrawal')
        group = None
        if values['factor_id']:
            factor = get_object_or_404(candidates(self.collection), pk=values['factor_id'])
            records = records.filter(Q(comparison__left=factor) | Q(comparison__right=factor))
            groups, links = components(list(candidates(self.collection)))
            group = group_data(next(rows for rows in groups if any(row.pk == factor.pk for row in rows)), links)
        offset, limit = values['offset'], values['limit']
        return success_result({'total': records.count(), 'items': [merge_data(row) for row in records[offset:offset + limit]], 'group': group})

    def post(self, request, coll_id, merge_id=None, action=None):
        if merge_id:
            if action != 'withdraw':
                raise MethodNotAllowed('POST')
            serializer = WithdrawalInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            merge = get_object_or_404(FactorMerge.objects.select_related('comparison__left__report__entry',
                'comparison__right__report__entry'), anthology=self.collection, pk=merge_id)
            record = withdraw(self.collection, merge, serializer.validated_data)
        else:
            if action:
                raise MethodNotAllowed('POST')
            serializer = MergeInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            record = create_merge(self.collection, serializer.validated_data)
        return success_result(merge_data(FactorMerge.objects.select_related('comparison', 'withdrawal').get(pk=record.pk)))
