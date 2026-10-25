from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import MethodNotAllowed
from utils.response_utils import success_result
from quant.models import IntakeBatch
from quant.views import QuantView
from .contracts import BatchInput, RetryInput
from .presentation import batch_data
from .services import start, retry, cancel


class BatchView(QuantView):
    def get(self, request, coll_id, batch_id=None, action=None):
        if action:
            raise MethodNotAllowed('GET')
        records = IntakeBatch.objects.filter(anthology=self.collection)
        if batch_id:
            return success_result(batch_data(get_object_or_404(records, pk=batch_id)))

        class Query(serializers.Serializer):
            offset = serializers.IntegerField(min_value=0, default=0)
            limit = serializers.IntegerField(min_value=1, max_value=10, default=10)

        form = Query(data=request.query_params)
        form.is_valid(raise_exception=True)
        offset, limit = form.validated_data['offset'], form.validated_data['limit']
        return success_result({'total': records.count(), 'items': [batch_data(row) for row in records[offset:offset + limit]]})

    def post(self, request, coll_id, batch_id=None, action=None):
        if batch_id:
            batch = get_object_or_404(IntakeBatch, pk=batch_id, anthology=self.collection)
            if action == 'retry':
                form = RetryInput(data=request.data)
                form.is_valid(raise_exception=True)
                batch = retry(batch, dict(form.validated_data))
            elif action == 'cancel':
                cancel(batch)
            else:
                raise MethodNotAllowed('POST')
        else:
            form = BatchInput(data=request.data)
            form.is_valid(raise_exception=True)
            batch = start(self.collection, dict(form.validated_data))
        return success_result(batch_data(batch))
