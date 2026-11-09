"""Read-only local inventory for planning a protected combat-history backfill."""
from datetime import timedelta

from django.db.models import Count, Max, Q
from django.utils import timezone

from .history_snapshot import OPEN
from .retention_policy import retention_window
from .migration_guard import is_protected
from .models import CombatFact, CombatIntegrity, Exploration
from .party_models import AdventureEvent, AdventureParty


def inventory(owner=None, *, now=None):
    """Count sources and known archive boundaries without loading round payloads.

    The counts are observations from one database, not a proof that other
    devices are isolated, that source chains are complete, or that deletion is
    safe. The protection flag describes this command's process only.
    """
    observed_at = now or timezone.now()
    cutoff = observed_at - timedelta(days=7)
    days, retention_cutoff = retention_window(observed_at)
    accounts = {}

    def scoped(model):
        query = model.objects.all().order_by()
        return query.filter(owner_id=owner) if owner else query

    def entry(value):
        return accounts.setdefault(value, {
            'owner': value,
            'explorations': {}, 'personal_facts': {}, 'shared_events': {},
            'parties': {}, 'old_archive_boundaries': {},
        })

    runs = scoped(Exploration).values('owner_id').annotate(
        total=Count('pk'),
        open=Count('pk', filter=Q(status__in=OPEN)),
        ended_older_than_seven_days=Count('pk', filter=~Q(status__in=OPEN) & Q(ended_at__lte=cutoff)),
        ended_without_time=Count('pk', filter=~Q(status__in=OPEN) & Q(ended_at__isnull=True)),
    )
    for row in runs:
        entry(row.pop('owner_id'))['explorations'] = row

    for row in scoped(CombatFact).values('owner_id', 'kind').annotate(count=Count('pk')):
        entry(row['owner_id'])['personal_facts'][row['kind']] = row['count']
    for row in scoped(AdventureEvent).values('owner_id', 'kind').annotate(count=Count('pk')):
        entry(row['owner_id'])['shared_events'][row['kind']] = row['count']
    for row in scoped(AdventureParty).values('owner_id', 'status').annotate(count=Count('pk')):
        entry(row['owner_id'])['parties'][row['status']] = row['count']
    for row in scoped(CombatIntegrity).values('owner_id').annotate(
        residents=Count('pk'), archived_residents=Count('pk', filter=Q(archive_sequence__gt=0)),
        largest_sequence=Max('archive_sequence'),
    ):
        entry(row.pop('owner_id'))['old_archive_boundaries'] = row

    return {
        'observed_at': observed_at.isoformat(),
        'seven_day_cutoff': cutoff.isoformat(),
        'retention_days': days, 'retention_cutoff': retention_cutoff.isoformat(),
        'this_process_protected': is_protected(),
        'protection_scope': '仅本命令进程；不能证明应用进程或其他设备受保护。',
        'cleanup_ready': False,
        'cleanup_reason': '只读盘点不核验完整来源、资产和压缩结果；以上计数不是可删除数量。',
        'accounts': sorted(accounts.values(), key=lambda row: row['owner']),
    }
