"""Project the score of the default report without loading every report body."""
import json
from math import isfinite
from django.db.models import Case, IntegerField, OuterRef, Subquery, TextField, Value, When
from django.db.models.functions import Cast
from django.db.models.fields.json import KeyTextTransform
from quant.models import ResearchReport, ResearchDocument


def with_default_report_score(entries):
    reports = (ResearchReport.objects.filter(entry_id=OuterRef('pk'))
        .annotate(report_priority=Case(
            When(schema_version__in=(4, 5), then=Value(1)),
            default=Value(0), output_field=IntegerField(),
        ))
        .annotate(score_text=Cast('data__total_score', output_field=TextField()))
        .order_by('report_priority', '-created_at', '-id'))
    entries = entries.annotate(adopted_review_id=Subquery(ResearchDocument.objects.filter(entry_id=OuterRef('pk')).annotate(review_id=KeyTextTransform.from_lookup('sections__review__report_id')).values('review_id')[:1]))
    adopted = ResearchReport.objects.filter(pk=OuterRef('adopted_review_id')).annotate(score_text=Cast('data__total_score', output_field=TextField()))
    return entries.annotate(default_report_score=Case(When(adopted_review_id__isnull=False, then=Subquery(adopted.values('score_text')[:1])), default=Subquery(reports.values('score_text')[:1]), output_field=TextField()))


def normalized_score(score):
    """Shared numeric projection for both directory and current-entry overview."""
    if isinstance(score, str):
        try:
            score = json.loads(score)
        except (ValueError, TypeError):
            return None
    return score if isinstance(score, (int, float)) and not isinstance(score, bool) and isfinite(score) and 0 <= score <= 100 else None
