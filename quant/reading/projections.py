"""Small metadata projections, separate from explicitly requested bodies."""
import hashlib
import json
from django.db.models import BooleanField, Case, Count, F, IntegerField, Max, Q, Value, When
from django.db.models.functions import Length, Substr
from django.db.models.fields.json import KeyTextTransform
from quant.models import ResearchReport, SourceRevision
from quant.workflows.presentation import summary as workflow_summary

REPORT_FIELDS = ('id', 'source_id', 'run_id', 'schema_version', 'current_revision_id', 'created_at', 'content_hash')
RUN_FIELDS = ('id', 'entry_id', 'kind', 'source_version_id', 'source_id', 'resolved_source_id', 'status', 'error',
              'model_id', 'model_name', 'target_language', 'target_version', 'adopted_implementation_id',
              'created_at', 'updated_at', 'workflow_version', 'feedback_workflow_version', 'resume_run_id', 'restart_stage',
              'audit_report_id', 'native_resume_run_id', 'review_version','experiment_result_id','validation_result_id')


def reports(entry):
    return entry.reports.order_by('-created_at', '-id')


def default_report_id(entry):
    return reports(entry).annotate(priority=Case(When(schema_version__in=(4, 5), then=Value(1)),
        default=Value(0), output_field=IntegerField())).order_by('priority', '-created_at', '-id').values_list('id', flat=True).first()


def report_headers(entry):
    return reports(entry).values(*REPORT_FIELDS, 'data__title', 'data__total_score')


def report_header(row):
    return {key: value for key, value in row.items() if not key.startswith('data__')} | {
        'title': row['data__title'] or '', 'total_score': row['data__total_score']}


def source_headers(entry):
    from django.db.models import OuterRef, Subquery
    from quant.models import AIRun
    return SourceRevision.objects.filter(material__entry=entry).annotate(
        latest_run_id=Subquery(AIRun.objects.filter(source_id=OuterRef('pk')).order_by('-created_at','-id').values('id')[:1]),
        latest_report_id=Subquery(ResearchReport.objects.filter(source_id=OuterRef('pk')).order_by('-created_at','-id').values('id')[:1]),
        code_length=Length(KeyTextTransform('code','payload'))).annotate(has_code=Case(When(code_length__gt=0,then=Value(True)),default=Value(False),output_field=BooleanField())).order_by('-created_at', '-id').values(
        'has_code', 'latest_run_id', 'latest_report_id',
        'id', 'material_id', 'code_version_id', 'content_hash', 'created_at', 'material__current_revision_id',
        'payload__title', 'payload__language', 'payload__provenance', 'payload__target_source_id')


def source_header(row):
    return {key: value for key, value in row.items() if '__' not in key} | {
        'material_current_source_id': row['material__current_revision_id'], 'title': row['payload__title'] or '',
        'language': row['payload__language'] or '', 'provenance': row['payload__provenance'] or '',
        'target_source_id': row['payload__target_source_id']}


def overview(entry):
    from quant.models import Entry
    row = Entry.objects.filter(pk=entry.pk).annotate(note_length=Length('content')).values(
        'id', 'anthology_id', 'title', 'kind', 'source_url', 'tags', 'is_valid', 'created_at', 'updated_at', 'note_length').get()
    row['coll_id'] = row.pop('anthology_id')
    row['has_notes'] = bool(row.pop('note_length'))
    row['default_report_id'] = default_report_id(entry)
    sources=SourceRevision.objects.filter(material__entry=entry).filter(Q(payload__provenance__isnull=True)|~Q(payload__provenance='external_feedback')).order_by('-created_at','-id')
    row['current_source_id']=sources.filter(material__current_revision_id=F('pk')).values_list('id',flat=True).first() or sources.values_list('id',flat=True).first()
    row['counts'] = {'reports': entry.reports.count(), 'sources': entry.materials.values('revisions').exclude(revisions=None).count(),
        'implementations': entry.implementations.count(), 'backtests': entry.backtests.filter(is_valid=True).count(),
        'attachments': entry.attachments.count(), 'runs': entry.runs.count(),
        'feedback': SourceRevision.objects.filter(material__entry=entry, payload__provenance='external_feedback').count()}
    row['active_run_ids'] = list(entry.runs.filter(status__in=['pending', 'running']).values_list('id', flat=True))
    return row


def run_summary(run, workflow=True, requirements=True):
    data = {key: getattr(run, key) for key in RUN_FIELDS}
    from quant.models import Job
    if workflow and requirements:
        data['requirements'] = type(run).objects.filter(pk=run.pk).values_list('requirements', flat=True).get()
    data['preview'] = Job.objects.filter(run_id=run.pk).annotate(bounded_preview=Substr('preview',1,500)).values_list('bounded_preview', flat=True).first() or ''
    if workflow:
        data['workflow'] = workflow_summary(run)
        from quant.native_reviews.presentation import summary as native_summary
        data['native_review_workflow'] = native_summary(run)
    return data


def status(entry):
    # Only active runs may require recovery. This is deliberately the writable
    # status boundary; browsing metadata never recovers or dispatches a task.
    from quant import worker
    for run in entry.runs.filter(status__in=['pending', 'running']).only(*RUN_FIELDS):
        worker.recover(run)
    metadata = {
        'reports': entry.reports.aggregate(count=Count('pk'), changed=Max('updated_at')),
        'sources': SourceRevision.objects.filter(material__entry=entry).aggregate(count=Count('pk'), changed=Max('updated_at')),
        'materials': entry.materials.aggregate(count=Count('pk'), changed=Max('updated_at')),
        'runs': entry.runs.aggregate(count=Count('pk'), changed=Max('updated_at')),
        'entry': type(entry).objects.filter(pk=entry.pk).values_list('updated_at', flat=True).get(),
    }
    marker = hashlib.sha256(json.dumps(metadata, default=str, sort_keys=True).encode()).hexdigest()
    active = entry.runs.filter(status__in=['pending', 'running']).only(*RUN_FIELDS)
    return {'change_marker': marker, 'active_runs': [run_summary(run, requirements=False) for run in active],
            'default_report_id': default_report_id(entry)}


def report_body(report):
    from quant.research.presentation import report_data
    # Keep domain callers' complete historical serializer intact. Reading a
    # selected report explicitly opts out of all original/revision bodies.
    return report_data(report, include_history=False)


def implementation_receipt(implementation):
    fields=('id','entry_id','name','language','current_version_id','created_at','updated_at')
    return {key:getattr(implementation,key) for key in fields}
