"""SQL filtering/pagination without materializing note or report bodies."""
import re
from django.db.models import BooleanField, Count, Exists, OuterRef, Q
from django.db.models.functions import Substr
from rest_framework import serializers
from quant.models import Entry, Implementation, SourceRevision
from quant.research.list_scores import with_default_report_score, normalized_score


class PageQuery(serializers.Serializer):
    offset = serializers.IntegerField(min_value=0, default=0)
    limit = serializers.IntegerField(min_value=1, max_value=100, default=20)


def page(queryset, params, project=lambda row: row, default=20):
    query = PageQuery(data={'limit': default, **params.dict()})
    query.is_valid(raise_exception=True)
    start, limit = query.validated_data['offset'], query.validated_data['limit']
    total = queryset.count()
    return {'items': [project(row) for row in queryset[start:start + limit]], 'total': total,
            'has_more': start + limit < total}


class DirectoryQuery(PageQuery):
    limit = serializers.IntegerField(min_value=1, max_value=100, default=50)
    q = serializers.CharField(max_length=200, required=False, default='', allow_blank=True)
    kind = serializers.ChoiceField(choices=['', *Entry.KINDS], default='')
    language = serializers.ChoiceField(choices=['', *Implementation.LANGUAGES, 'tongdaxin', 'text'], default='')
    sort = serializers.ChoiceField(choices=['updated', 'title'], default='updated')


def preview(text):
    return re.sub(r'\s+', ' ', re.sub(r'[#>*`~_-]+', ' ', text or '')).strip()[:160]


def directory(collection, params):
    query = DirectoryQuery(data=params)
    query.is_valid(raise_exception=True)
    values = query.validated_data
    rows = Entry.objects.filter(anthology=collection, is_valid=True)
    if values['q']:
        # Text cast of JSON is not portable for escaped Unicode. Extract individual
        # tag strings in SQL on both supported backends, never fetch all tags to Python.
        from django.db import connection
        from django.db.models.expressions import RawSQL
        term = '%' + connection.ops.prep_for_like_query(values['q']) + '%'
        if connection.vendor == 'postgresql':
            tags = RawSQL("EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) t(value) WHERE UPPER(t.value) LIKE UPPER(%s))", [term], output_field=BooleanField())
        else:
            tags = RawSQL("EXISTS (SELECT 1 FROM json_each(tags) t WHERE t.value LIKE %s ESCAPE '\\')", [term], output_field=BooleanField())
        rows = rows.alias(tag_match=tags).filter(Q(title__icontains=values['q']) | Q(content__icontains=values['q']) | Q(tag_match=True))
    if values['language']:
        rows = rows.alias(
            has_impl=Exists(Implementation.objects.filter(entry_id=OuterRef('pk'), language=values['language'])),
            has_source=Exists(SourceRevision.objects.filter(material__entry_id=OuterRef('pk'), payload__language=values['language']))
        ).filter(Q(has_impl=True) | Q(has_source=True))
    counts = {kind: 0 for kind in Entry.KINDS}
    counts.update({row['kind']: row['n'] for row in rows.order_by().values('kind').annotate(n=Count('id'))})
    if values['kind']:
        rows = rows.filter(kind=values['kind'])
    total = rows.count()
    rows = rows.order_by('title', 'id') if values['sort'] == 'title' else rows.order_by('-updated_at', '-id')
    rows = with_default_report_score(rows).annotate(note_preview=Substr('content', 1, 640))
    start, limit = values['offset'], values['limit']
    fields = ('id', 'title', 'kind', 'created_at', 'updated_at', 'default_report_score', 'note_preview')
    items = []
    for row in rows.values(*fields)[start:start + limit]:
        score = normalized_score(row.pop('default_report_score'))
        note_preview = preview(row.pop('note_preview'))
        items.append({**row, 'preview': note_preview, 'research_score': score})
    return {'items': items, 'total': total, 'kind_counts': counts, 'has_more': start + limit < total}
