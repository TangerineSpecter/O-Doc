"""Persistent per-day work and verified reads for the resident report."""
from datetime import timedelta
from hashlib import sha256
from django.db import connection, transaction
from django.db.models import F, OuterRef, Subquery
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from system_settings.sync_state import canonical_hash
from .consistency import analytics_snapshot
from .day_report import combine
from .models import ARCHIVE_VERSION as VERSION, ResidentAnalyticsDay, ResidentAnalyticsWork


def days_between(first, last):
    return [first + timedelta(days=i) for i in range((last-first).days + 1)]


def identity(owner, day):
    return sha256(f'{owner}:{day.isoformat()}'.encode()).hexdigest()


def enqueue(owner, days):
    work = ResidentAnalyticsWork.objects.filter(owner_id=owner, day__in=days)
    missing = set(days) - set(work.values_list('day', flat=True))
    if not missing:
        return
    with transaction.atomic():
        if connection.vendor == 'postgresql':
            # Even a trigger UPDATE matching zero rows holds ROW EXCLUSIVE to
            # commit. Finish those writers before making a new day claimable.
            table = connection.ops.quote_name(ResidentAnalyticsWork._meta.db_table)
            with connection.cursor() as cursor:
                cursor.execute(f'LOCK TABLE {table} IN SHARE ROW EXCLUSIVE MODE')
        ResidentAnalyticsWork.objects.bulk_create(
            [ResidentAnalyticsWork(pk=identity(owner, day), owner_id=owner, day=day) for day in sorted(missing)],
            ignore_conflicts=True)


def read_report(owner, first, last, actor):
    days = days_between(first, last)
    enqueue(owner, days)
    work = ResidentAnalyticsWork.objects.filter(owner_id=owner, day__range=(first, last))
    with analytics_snapshot():
        errors = set(work.exclude(error='').values_list('error', flat=True))
        if errors:
            return {'archiveError': sorted(errors)[0]}
        verified = work.filter(pk=OuterRef('pk'), day=OuterRef('day'))
        ready = (ResidentAnalyticsDay.objects.filter(owner_id=owner, day__range=(first, last), version=VERSION)
                 .alias(proof=Subquery(verified.values('verified_digest')[:1])).filter(digest=F('proof')))
        ready_count = ready.count()
        if ready_count == len(days):
            rows = list(ready.order_by('day').values_list('day', 'contribution'))
            return complete_report(owner, rows, first, last, actor, work.filter(dirty=True).exists())
    # A missing/replaced synchronized summary can coexist with a clean local
    # queue entry. Re-enqueue only if it is still missing after the snapshot.
    from django.db.models import Exists
    matching = ResidentAnalyticsDay.objects.filter(pk=OuterRef('pk'), owner_id=owner, day=OuterRef('day'),
                                                   version=VERSION, digest=OuterRef('verified_digest'))
    work.filter(dirty=False).filter(~Exists(matching)).update(dirty=True, verified_digest='', after=timezone.now())
    return {'archivePending': True, 'readyDays': ready_count, 'totalDays': len(days)}


def complete_report(owner, rows, first, last, actor, updating):
    from .combat_daily import pending_daily_parties
    from .combat_statistics import current_jobs
    residents = {}
    for _, contribution in rows:
        residents.update(contribution['residents'])
    if actor and actor not in residents:
        raise PermissionDenied('无法查看该居民的数据。')
    for _, contribution in rows:
        errors = contribution.get('errors', {})
        if actor in errors:
            return {'archiveError': errors[actor]}
        if not actor and errors:
            return {'archiveError': sorted(errors.values())[0]}
    report = combine(rows, first, last, residents, actor)
    jobs = current_jobs([row['id'] for row in report['combatComparison']])
    for row in report['combatComparison']:
        row.update(jobs.get(row['id'], {}))
    total, pending = pending_daily_parties(owner)
    if pending:
        report['notes'].append(f'战斗历史统计已生成 {total-pending}/{total} 场；其余已结束场次仍会计入，加载可能较慢。')
    if updating:
        report['notes'].append('有新的活动正在汇总，当前显示最近一次已完成的统计。')
    return report


def publish(work, data):
    digest = canonical_hash([VERSION, work.owner_id, work.day.isoformat(), data])
    from ..farm_gate import farm_gate
    with farm_gate(), transaction.atomic():
        current = ResidentAnalyticsWork.objects.select_for_update().filter(pk=work.pk, after=work.after).first()
        if not current:
            return
        if current.scope_generation != work.scope_generation:
            current.after = timezone.now()
            current.save(update_fields=['after'])
            return
        if not ResidentAnalyticsDay.objects.filter(pk=work.pk, digest=digest, version=VERSION).exists():
            ResidentAnalyticsDay.objects.update_or_create(pk=work.pk, defaults={
                'owner_id': work.owner_id, 'day': work.day, 'version': VERSION,
                'digest': digest, 'contribution': data})
        current.verified_digest = digest
        current.dirty = current.generation != work.generation
        current.error = ''
        current.after = timezone.now() + timedelta(seconds=5)
        current.save(update_fields=['verified_digest', 'dirty', 'error', 'after'])
