"""Reclaim unreferenced report bodies; never cascade through algorithm evidence."""
from django.apps import apps
from django.db import models
from quant.models import ResearchReport, ReportRevision, ResearchDocument


def contains(value, identity):
    if isinstance(value, str):
        return identity in value
    if isinstance(value, list):
        return any(contains(item, identity) for item in value)
    if isinstance(value, dict):
        return any(contains(item, identity) for item in value.values())
    return False


def prune(entry):
    document = ResearchDocument.objects.get(entry=entry)
    refs = {'sections': document.sections, 'pending': document.pending, 'history': document.history}
    deleted = 0
    for report in ResearchReport.objects.filter(entry=entry, schema_version__in=(2, 3)):
        if contains(refs, report.pk) or report.factor_candidates.exists():
            continue
        # A completed planning contract may require this snapshot even without an executed experiment.
        if report.data.get('initial_proposal'):
            continue
        referenced = False
        for model in apps.get_app_config('quant').get_models():
            if model in (ResearchReport, ReportRevision, ResearchDocument):
                continue
            fields = [f.name for f in model._meta.concrete_fields if isinstance(f, (models.JSONField, models.CharField, models.TextField)) and not f.primary_key]
            if not fields:
                continue
            query = models.Q()
            for field in fields:
                query |= models.Q(**{field+'__icontains': report.pk})
            if model.objects.filter(query).exists():
                referenced = True
                break
        # Other report payloads can retain provenance references too.
        if not referenced and not ResearchReport.objects.exclude(pk=report.pk).filter(data__icontains=report.pk).exists():
            report.delete()
            deleted += 1
    return deleted
