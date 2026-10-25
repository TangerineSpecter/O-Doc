from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import MethodNotAllowed
from utils.response_utils import success_result
from quant.views import QuantView
from quant.models import MarketDataset
from .data import MAX_BYTES
from .datasets import create_dataset, dataset_data


class DatasetInput(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    csv_text = serializers.CharField(max_length=MAX_BYTES, trim_whitespace=False)
    symbol = serializers.CharField(max_length=300)
    timeframe = serializers.CharField(max_length=300)
    timezone = serializers.CharField(max_length=300)
    price_adjustment = serializers.CharField(max_length=300, allow_blank=True, default='')
    source = serializers.CharField(max_length=300, allow_blank=True, default='')


class DatasetView(QuantView):
    def get(self, request, coll_id, dataset_id=None):
        datasets = MarketDataset.objects.filter(anthology=self.collection)
        if dataset_id:
            return success_result(dataset_data(get_object_or_404(datasets, pk=dataset_id), detail=True))
        class Query(serializers.Serializer):
            offset = serializers.IntegerField(min_value=0, default=0)
            limit = serializers.IntegerField(min_value=1, max_value=40, default=20)
        query = Query(data=request.query_params)
        query.is_valid(raise_exception=True)
        offset, limit = (query.validated_data[key] for key in ('offset', 'limit'))
        return success_result({'total': datasets.count(), 'items': [dataset_data(row) for row in datasets.defer('raw_csv')[offset:offset + limit]]})

    def post(self, request, coll_id, dataset_id=None):
        if dataset_id:
            raise MethodNotAllowed('POST')
        serializer = DatasetInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        dataset = create_dataset(self.collection, serializer.validated_data)
        return success_result(dataset_data(dataset, detail=True))


class ExperimentView(QuantView):
    def get(self, request, coll_id, experiment_id=None, action=None):
        from quant.models import ExperimentRequest
        from .jobs import request_data
        if action:
            raise MethodNotAllowed('GET')
        records = ExperimentRequest.objects.filter(anthology=self.collection)
        if experiment_id:
            return success_result(request_data(get_object_or_404(records, pk=experiment_id), detail=True))
        class Query(serializers.Serializer):
            offset = serializers.IntegerField(min_value=0, default=0)
            limit = serializers.IntegerField(min_value=1, max_value=40, default=20)
        query = Query(data=request.query_params)
        query.is_valid(raise_exception=True)
        offset, limit = (query.validated_data[key] for key in ('offset', 'limit'))
        return success_result({'total': records.count(), 'items': [request_data(row) for row in records[offset:offset + limit]]})

    def post(self, request, coll_id, experiment_id=None, action=None):
        from quant.models import ExperimentRequest
        from .contracts import StartInput
        from .jobs import start, cancel, request_data
        if experiment_id:
            if action != 'cancel':
                raise MethodNotAllowed('POST')
            experiment = get_object_or_404(ExperimentRequest, pk=experiment_id, anthology=self.collection)
            cancel(experiment)
        else:
            serializer = StartInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            experiment = start(self.collection, serializer.validated_data)
        return success_result(request_data(experiment, detail=True))
