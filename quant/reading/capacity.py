"""Read-only logical UTF-8 statistics. Never returns stored content or changes it."""
from django.db import connection
from django.db.models import BigIntegerField, BinaryField, F, Func, Sum, TextField
from django.db.models.functions import Cast
from quant.models import Entry, CodeVersion, SourceRevision, ResearchReport, ReportRevision, AIRun, WorkflowStep, WorkflowOutcome


def logical_bytes(field):
    if connection.vendor == 'postgresql':
        return Func(Cast(field, TextField()), function='OCTET_LENGTH', output_field=BigIntegerField())
    return Func(Cast(Cast(field, TextField()), BinaryField()), function='LENGTH', output_field=BigIntegerField())


def capacity(collection_id):
    entries = Entry.objects.filter(anthology_id=collection_id)
    scopes = [
        ('notes', entries, ['content']),
        ('code_versions', CodeVersion.objects.filter(implementation__entry__in=entries), ['code']),
        ('source_snapshots', SourceRevision.objects.filter(material__entry__in=entries), ['payload']),
        ('reports', ResearchReport.objects.filter(entry__in=entries), ['markdown', 'data']),
        ('revisions', ReportRevision.objects.filter(report__entry__in=entries), ['markdown']),
        ('runs', AIRun.objects.filter(entry__in=entries), ['result', 'planning_context']),
        ('stage_inputs', WorkflowStep.objects.filter(run__entry__in=entries), ['input']),
        ('stage_outputs', WorkflowOutcome.objects.filter(step__run__entry__in=entries), ['data']),
    ]
    result = {}
    for name, rows, fields in scopes:
        values = rows.aggregate(**{field: Sum(logical_bytes(field)) for field in fields})
        result[name] = {'count': rows.count(), 'field_bytes': {key: int(value or 0) for key, value in values.items()}}
    from django.db.models.fields.json import KeyTextTransform
    source_rows = scopes[2][1].alias(source_code=KeyTextTransform('code', 'payload'))
    result['exact_duplicate_observations'] = {
        'code_snapshots_matching_linked_version': source_rows.filter(code_version__isnull=False, source_code=F('code_version__code')).count(),
        'report_json_matching_run_result': scopes[3][1].filter(data=F('run__result')).count(),
    }
    return {'collection_id': collection_id, 'database_backend': connection.vendor,
            'measurement': 'logical_utf8_not_compressed_database_or_backup_size', 'categories': result}
