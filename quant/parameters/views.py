from rest_framework import serializers
from quant.views import QuantView
from quant.feedback.evidence import linked
from utils.response_utils import success_result
from .mql_set import parse
from .comparison import compare


class ConfigurationPreview(serializers.Serializer):
    target_source_id = serializers.CharField(max_length=40)
    document = serializers.CharField(max_length=60000, trim_whitespace=False)


class ConfigurationPreviewView(QuantView):
    def post(self, request, coll_id, entry_id):
        serializer = ConfigurationPreview(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        target, _, _ = linked(self.entry, {'target_source_id': data['target_source_id'], 'factor_id': '', 'experiment_result_id': ''})
        configuration = parse(data['document'])
        comparison = compare(configuration, {'id': target.pk, 'content_hash': target.content_hash, 'payload': target.payload})
        return success_result({'configuration': configuration, 'comparison': comparison})
