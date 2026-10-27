from rest_framework.views import APIView
from utils.response_utils import success_result
from quant.access import owned_collection
from quant.views import QuantView
from .correlation import create, present


class CorrelationView(QuantView):
    def initial(self, request, *args, **kwargs):
        APIView.initial(self, request, *args, **kwargs)
        self.collection = owned_collection(request, kwargs['coll_id'])

    def post(self, request, coll_id, comparison_id):
        if request.data:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('统计分析只使用已冻结的对照，不接受覆盖参数或行情')
        return success_result(present(create(self.collection, comparison_id)))
