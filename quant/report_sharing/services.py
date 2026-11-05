"""Export a reading snapshot and import it without starting a task."""
from django.db import transaction
from rest_framework.exceptions import ValidationError
from quant.models import Entry, ImportedResearchReport
from quant.research.analysis import analysis_markdown
from quant.services import touch
from .contracts import FORMAT, VERSION, ShareFormatError, validate_package, validate_total_score

HISTORY_FIELDS = {
    'source_memory_version', 'memory_note', 'memory_assessment', 'research_memory',
    'source_change_review_version', 'source_change_facts_json', 'source_change_assessment',
}


def export_report(entry):
    try:
        return validate_package(_report_package(entry))
    except ShareFormatError as exc:
        raise ValidationError(str(exc)) from exc


def _report_package(entry):
    report = (
        entry.reports.filter(schema_version__in=(1, 2, 3), run__status='completed', source__material__entry=entry)
        .select_related('source', 'run').only('schema_version', 'markdown', 'data', 'source__payload', 'run__workflow_version')
        .order_by('-created_at', '-id').first()
    )
    if report is None:
        imported = ImportedResearchReport.objects.filter(entry=entry).first()
        if imported:
            return imported.package
        raise ValidationError('这条研究没有可导出的分析报告')

    data = {key: value for key, value in report.data.items() if key not in HISTORY_FIELDS}
    markdown = report.markdown
    if report.schema_version in (2, 3) and HISTORY_FIELDS.intersection(report.data):
        markdown = analysis_markdown(data, guided_reading=report.run.workflow_version in (39, 40, 41, 42))
    payload = report.source.payload
    return {'format': FORMAT, 'version': VERSION,
        'entry': {'title': entry.title, 'kind': entry.kind},
        'source': {'code': payload.get('code', ''), 'description': payload.get('description', ''),
                   'url': payload.get('url', ''), 'language': payload.get('language', ''), 'files': payload.get('files', []), 'related': []},
        'report': {'markdown': markdown, 'data': data}}


@transaction.atomic
def import_report(collection, package):
    try:
        value = validate_package(package)
        validate_total_score(value['report']['data'])
    except ShareFormatError as exc:
        raise ValidationError(str(exc)) from exc
    entry = Entry.objects.create(anthology=collection, title=value['entry']['title'], kind=value['entry']['kind'])
    ImportedResearchReport.objects.create(id=entry.pk, entry=entry, package=value)
    touch(entry)
    return entry
