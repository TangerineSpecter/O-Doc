"""Source filtering and full-range aggregates, independent of list pagination."""
from django.db.models import Count
from .life_activities import main_items


def select_source(query, source):
    if source not in ('all', 'main', 'interleaved', 'reservation'):
        raise ValueError('日程来源无效')
    if source == 'reservation':
        return query.filter(context__adventure_reservation_id__isnull=False)
    if source == 'interleaved':
        return query.filter(context__interleaving__version=1)
    if source == 'main':
        return main_items(query).exclude(activity__in=('market', 'market_prepare'))
    return query


def source_counts(query):
    counts = {source: select_source(query, source).count() for source in ('main', 'interleaved')}
    booked = select_source(query, 'reservation').count()
    if booked:
        counts['reservation'] = booked
    return counts


def status_summary(query):
    result = {}
    for row in query.values('status', '_settled_exploration').annotate(count=Count('pk')):
        status = 'completed' if row['_settled_exploration'] else row['status']
        result[status] = result.get(status, 0) + row['count']
    result['total'] = sum(result.values())
    return result
