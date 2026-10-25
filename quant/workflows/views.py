from django.shortcuts import get_object_or_404
from utils.response_utils import success_result
from quant.views import QuantView
from quant.models import WorkflowStep
from .presentation import evidence


class WorkflowEvidenceView(QuantView):
    def get(self, request, coll_id, entry_id, run_id, stage):
        step = get_object_or_404(WorkflowStep.objects.select_related('outcome', 'run__source', 'run__resolved_source'),
            run_id=run_id, run__entry=self.entry, stage=stage)
        return success_result(evidence(step))
