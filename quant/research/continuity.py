"""Keep the accepted reading text when only downstream analysis is resumed."""
from django.db import transaction
from quant.models import ReportRevision, ResearchReport
from .contracts import digest

READING_FIELDS = ('title', 'kind', 'summary', 'principle', 'formula', 'usage',
                  'parameters', 'factors', 'factor_repair', 'assumptions', 'validation_plan')
DOWNSTREAM_STAGES = ('compare', 'review', 'plan', 'publish')


@transaction.atomic
def preserve_reading(report) -> bool:
    """Copy an existing revision through the normal revision contract, once.

    Source and all reading/algorithm facts must match. Full reanalysis and a
    changed source never inherit stale prose. Original model results stay exact.
    """
    report = ResearchReport.objects.select_for_update().select_related('run').get(pk=report.pk)
    if (report.current_revision_id or report.schema_version not in (2, 3)
            or not report.run.resume_run_id or report.run.restart_stage not in DOWNSTREAM_STAGES):
        return False
    previous = ResearchReport.objects.filter(entry_id=report.entry_id, source_id=report.source_id,
        schema_version__in=(2, 3), created_at__lt=report.created_at).exclude(current_revision_id='')
    for old in previous.order_by('-created_at', '-id').iterator():
        if any(old.data.get(key) != report.data.get(key) for key in READING_FIELDS):
            continue
        accepted = old.revisions.filter(pk=old.current_revision_id).first()
        if not accepted:
            continue
        revision = ReportRevision.objects.create(report=report, parent_id='', markdown=accepted.markdown,
            content_hash=digest(accepted.markdown))
        report.current_revision_id = revision.pk
        report.save(update_fields=['current_revision_id', 'updated_at'])
        return True
    return False
