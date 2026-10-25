from django.shortcuts import get_object_or_404
from rest_framework import serializers
from utils.response_utils import success_result
from quant.views import QuantView
from quant.models import ExperimentRequest, StrategyArtifact
from .service import preview, archive, present


class StrategyExportView(QuantView):
    def selected(self, experiment_id):
        return get_object_or_404(ExperimentRequest.objects.select_related('dataset', 'result'),
            pk=experiment_id, anthology=self.collection)

    def get(self, request, coll_id, experiment_id):
        class Query(serializers.Serializer):
            attempt_id=serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
        query=Query(data=request.query_params); query.is_valid(raise_exception=True)
        selected=self.selected(experiment_id)
        return success_result({**preview(selected, query.validated_data['attempt_id']),
            'artifacts': [present(row) for row in StrategyArtifact.objects.filter(request=selected).select_related('version__implementation')[:40]]})

    def post(self, request, coll_id, experiment_id):
        class Input(serializers.Serializer):
            attempt_id=serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
        values=Input(data=request.data); values.is_valid(raise_exception=True)
        return success_result(present(archive(self.selected(experiment_id), values.validated_data['attempt_id'])))
