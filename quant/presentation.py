from .models import AIRun, Job
from .serializers import AttachmentSerializer, BacktestSerializer, EntrySerializer, ImplementationSerializer


def run_data(run: AIRun) -> dict:
    fields = ('id', 'entry_id', 'kind', 'source_version_id', 'source_id', 'resolved_source_id', 'experiment_result_id', 'validation_result_id', 'target_language', 'target_version', 'requirements',
              'model_id', 'model_name', 'status', 'result', 'error', 'adopted_implementation_id', 'created_at', 'updated_at')
    data = {field: getattr(run, field) for field in fields}
    if run.kind in ('analyze', 'experiment_review', 'feedback_review'):
        data['result'] = {({'experiment_review': 'review', 'feedback_review': 'feedback'}.get(run.kind, 'analysis')): run.result} if run.result else {}
        if run.kind == 'feedback_review' and run.result:
            from .feedback.execution import analysis_presentation
            data['result'] = {'feedback': analysis_presentation(run.result)}
    from .experiments.library_contract import summary
    data['library_retrieval'] = summary(run.planning_context) if run.review_version in (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17) else None
    data['feedback_memory'] = ({key: run.planning_context[key] for key in ('candidate_ids', 'history_ids')}
                               if run.kind == 'feedback_review' and run.planning_context else None)
    import json
    memory = run.planning_context.get('research_memory') if run.kind == 'experiment_review' else run.planning_context.get('library_memory') if run.kind == 'feedback_review' else None
    if run.kind=='analyze': memory=run.result.get('research_memory')
    if run.kind=='analyze' and run.result: data['result']={'analysis':{key:value for key,value in run.result.items() if key!='research_memory'}}
    data['research_memory_json'] = json.dumps(memory, ensure_ascii=False, allow_nan=False) if memory is not None else None
    data['output_associations_json'] = (json.dumps(run.planning_context['output_associations'], ensure_ascii=False, allow_nan=False)
        if run.kind == 'experiment_review' and run.review_version == 17 else None)
    from .workflows.presentation import summary as workflow_summary
    data['workflow'] = workflow_summary(run)
    from .native_reviews.presentation import summary as native_review_summary
    data['native_review_workflow']=native_review_summary(run)
    data['preview'] = Job.objects.filter(run=run).values_list('preview', flat=True).first() or ''
    return data


def entry_detail(entry) -> dict:
    data = dict(EntrySerializer(entry).data)
    from .research.presentation import source_data, report_data
    from .models import SourceRevision
    data.update(sources=[source_data(row) for row in SourceRevision.objects.filter(material__entry=entry).select_related('material').order_by('-created_at', '-id')],
        reports=[report_data(row) for row in entry.reports.prefetch_related('revisions')],
        implementations=ImplementationSerializer(entry.implementations.prefetch_related('versions'), many=True).data,
        backtests=BacktestSerializer(entry.backtests.filter(is_valid=True), many=True).data,
        attachments=AttachmentSerializer(entry.attachments.select_related('asset'), many=True).data,
        runs=[run_data(run) for run in entry.runs.all()])
    return data
