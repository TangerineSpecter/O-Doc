from rest_framework import serializers
from utils.response_utils import success_result
from quant.views import QuantView
from .contracts import Term
from .services import presentation, revise


class VocabularyView(QuantView):
    def get(self, request, coll_id):
        class Query(serializers.Serializer):
            offset = serializers.IntegerField(min_value=0, default=0)
            limit = serializers.IntegerField(min_value=1, max_value=40, default=20)
            selected_revision_id = serializers.CharField(max_length=40, allow_blank=True, default='')
        query = Query(data=request.query_params); query.is_valid(raise_exception=True)
        return success_result(presentation(self.collection.pk, **query.validated_data))

    def post(self, request, coll_id):
        class Input(serializers.Serializer):
            term = Term()
            request_key = serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
            expected_revision_id = serializers.CharField(max_length=40, allow_blank=True)
            reason = serializers.CharField(max_length=3000)
        value = Input(data=request.data); value.is_valid(raise_exception=True)
        revise(self.collection, **value.validated_data)
        return success_result(presentation(self.collection.pk))
