from rest_framework import serializers
from utils.response_utils import success_result
from quant.views import QuantView
from .services import initialize, change
from .presentation import present


class DocumentView(QuantView):
    # GET may initialize the one-document state for an existing research entry.
    def get(self, request, coll_id, entry_id):
        return success_result(present(initialize(self.entry), request.query_params.get('compare_id', ''),
                                      request.query_params.get('history_id', '')))

    def post(self, request, coll_id, entry_id):
        class Operation(serializers.Serializer):
            expected_revision = serializers.IntegerField(min_value=1)
            action = serializers.ChoiceField(choices=['adopt', 'restore', 'discard', 'delete_history', 'clear_history'])
            identity = serializers.CharField(max_length=40, allow_blank=True, default='')
            sections = serializers.ListField(child=serializers.CharField(), default=list, max_length=5)
        value = Operation(data=request.data)
        value.is_valid(raise_exception=True)
        document = change(self.entry, **value.validated_data)
        return success_result(present(document))
