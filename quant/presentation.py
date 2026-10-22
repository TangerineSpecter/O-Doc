from .models import AIRun, Job
from .serializers import AttachmentSerializer, BacktestSerializer, EntrySerializer, ImplementationSerializer


def run_data(run: AIRun) -> dict:
    fields = ('id', 'entry_id', 'kind', 'source_version_id', 'target_language', 'target_version', 'requirements',
              'model_id', 'model_name', 'status', 'result', 'error', 'adopted_implementation_id', 'created_at', 'updated_at')
    data = {field: getattr(run, field) for field in fields}
    data['preview'] = Job.objects.filter(run=run).values_list('preview', flat=True).first() or ''
    return data


def entry_detail(entry) -> dict:
    data = dict(EntrySerializer(entry).data)
    data.update(implementations=ImplementationSerializer(entry.implementations.prefetch_related('versions'), many=True).data,
        backtests=BacktestSerializer(entry.backtests.filter(is_valid=True), many=True).data,
        attachments=AttachmentSerializer(entry.attachments.select_related('asset'), many=True).data,
        runs=[run_data(run) for run in entry.runs.all()])
    return data
