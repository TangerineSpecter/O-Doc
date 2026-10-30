"""Project the score of the default report without loading every report body."""
from django.db.models import Case, IntegerField, OuterRef, Subquery, TextField, Value, When
from django.db.models.functions import Cast
from quant.models import ResearchReport


def with_default_report_score(entries):
    reports = (ResearchReport.objects.filter(entry_id=OuterRef('pk'))
        .annotate(report_priority=Case(
            When(schema_version__in=(4, 5), then=Value(1)),
            default=Value(0), output_field=IntegerField(),
        ))
        .annotate(score_text=Cast('data__total_score', output_field=TextField()))
        .order_by('report_priority', '-created_at', '-id'))
    return entries.annotate(default_report_score=Subquery(reports.values('score_text')[:1]))
