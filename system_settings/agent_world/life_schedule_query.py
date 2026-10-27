"""Source filtering and full-range aggregates, independent of list pagination."""
from django.db.models import Count, DateTimeField, F, OuterRef, Subquery
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Coalesce
from .life_activities import main_items


def with_display_time(query):
    """Historical reservation items can have a drifted scheduled_at.

    Use the owner's reservation time in SQL so filtering, counting and ordering
    all use the same time displayed by the client. Missing references retain the
    original item time; no stored fact or synchronization field is rewritten.
    """
    from .combat.reservation_models import AdventureReservation
    reservation = AdventureReservation.objects.filter(
        pk=OuterRef('_reservation_key'), owner_id=OuterRef('owner_id'),
    ).values('prepare_at')[:1]
    return query.alias(_reservation_key=KeyTextTransform('adventure_reservation_id', 'context')).annotate(
        _display_at=Coalesce(Subquery(reservation), F('scheduled_at'), output_field=DateTimeField()))


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
