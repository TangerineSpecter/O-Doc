from django.shortcuts import get_object_or_404
from utils.response_utils import success_result
from quant.models import SourceRevision
from quant.presentation import entry_detail
from quant.views import QuantView
from .services import supplement


class SourceSupplementView(QuantView):
    def post(self, request, coll_id, entry_id, source_id):
        source = get_object_or_404(SourceRevision,pk=source_id,material__entry=self.entry)
        created,notice = supplement(source,request.data)
        self.entry.refresh_from_db()
        return success_result({'entry':entry_detail(self.entry),'source_id':created.pk,'notice':notice})
