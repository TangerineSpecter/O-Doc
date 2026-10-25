from utils.response_utils import success_result
from quant.views import QuantView
from quant.research.presentation import source_data
from .services import collect
from .execution import ExecutionPreviewInput, preview


class FeedbackView(QuantView):
    def post(self, request, coll_id, entry_id):
        source, notice = collect(self.entry, request.data)
        return success_result({'source': source_data(source), 'notice': notice})


class ExecutionPreviewView(QuantView):
    def post(self, request, coll_id, entry_id):
        import json
        serializer = ExecutionPreviewInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return success_result({'preview_json': json.dumps(preview(serializer.validated_data),
                              ensure_ascii=False, allow_nan=False)})
