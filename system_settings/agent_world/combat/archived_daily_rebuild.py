"""Rebuild derived party-day records from verified retained settlements."""
from collections import defaultdict
import time

from django.db import transaction

from utils.sync_policy import SyncError
from ..farm_gate import guarded
from .analytics_models import CombatPartyCoverage, CombatPartyDay, CombatPartySettlement
from .migration_guard import is_protected
from .party_daily_coverage import valid_days
from .party_daily_sync import DAY, records
from .party_models import AdventureMember, AdventureParty
from .party_settlement_archive import validate_settlement
from .store import digest
from .summary_verification import verify_actors


def _matches(marker, party, coverage, days):
    try:
        content = marker.content
        if (marker.version != 1 or marker.digest != digest(content) or not coverage or not party
                or coverage.owner_id != marker.owner_id or party.owner_id != marker.owner_id
                or coverage.source != content['origin']):
            return False
        return valid_days(coverage, party, days, marker.owner_id) == validate_settlement(content)
    except (ValueError, KeyError, TypeError, AttributeError, IndexError, SyncError):
        return False


def rebuild_one(marker, *, verified=None):
    """Run under the caller's gate/transaction; reject unprovable settlements."""
    from .retention_cleanup import _snapshot
    from .retention_sync import archive_index
    from .sync import metadata

    data = _snapshot()
    content = archive_index(data, metadata(data))['parties'].get(marker.pk)
    if not content or content['owner_id'] != marker.owner_id:
        raise ValueError('已归档战斗缺少可核验的结算来源')
    actors = set(AdventureMember.objects.filter(party_id=marker.pk).values_list('actor_id', flat=True))
    newly_verified = verify_actors(marker.owner_id, actors, None, verified or set())
    expected = records({'source': content['origin'], 'days': validate_settlement(content)})
    coverage, *days = expected
    if (CombatPartyCoverage.objects.filter(pk=marker.pk).exclude(owner_id=marker.owner_id).exists()
            or CombatPartyDay.objects.filter(party_id=marker.pk).exclude(owner_id=marker.owner_id).exists()):
        raise ValueError('归档统计与其他账号的已有记录冲突')
    for row in days:
        if CombatPartyDay.objects.filter(pk=row['pk']).exclude(party_id=marker.pk, owner_id=marker.owner_id).exists():
            raise ValueError('归档统计的每日身份已被其他来源占用')
    CombatPartyCoverage.objects.update_or_create(pk=marker.pk, defaults=coverage['fields'])
    day_ids = [row['pk'] for row in days]
    CombatPartyDay.objects.filter(party_id=marker.pk).exclude(pk__in=day_ids).delete()
    for row in days:
        if row['model'] == DAY:
            CombatPartyDay.objects.update_or_create(pk=row['pk'], defaults=row['fields'])
    return newly_verified


@guarded
@transaction.atomic
def automatic_batch(*, after='', limit=50, max_seconds=2):
    """Scan a bounded page; regenerate missing or damaged derived rows safely."""
    if is_protected():
        raise ValueError('回填保护期间暂停归档统计重建')
    if not 1 <= limit <= 100 or not 1 <= max_seconds <= 60:
        raise ValueError('归档统计检查批量或时间无效')
    query = CombatPartySettlement.objects.filter(content__has_key='archive', pk__gt=after).order_by('pk')
    markers = list(query[:limit])
    identities = [marker.pk for marker in markers]
    parties = AdventureParty.objects.filter(pk__in=identities).in_bulk()
    coverage = CombatPartyCoverage.objects.filter(pk__in=identities).in_bulk()
    days = defaultdict(list)
    for row in CombatPartyDay.objects.filter(party_id__in=identities).order_by('party_id', 'day'):
        days[row.party_id].append(row)
    processed, rebuilt, failures, verified = 0, 0, [], set()
    cursor, started = after, time.monotonic()
    for marker in markers:
        if processed and time.monotonic() - started >= max_seconds:
            break
        if not _matches(marker, parties.get(marker.pk), coverage.get(marker.pk), days[marker.pk]):
            try:
                with transaction.atomic():
                    locked = CombatPartySettlement.objects.select_for_update().get(pk=marker.pk)
                    newly_verified = rebuild_one(locked, verified=verified)
                verified.update(newly_verified)
                rebuilt += 1
            except (ValueError, KeyError, TypeError, AttributeError, IndexError, SyncError) as exc:
                failures.append({'party_id': marker.pk, 'reason': str(exc)})
        processed += 1
        cursor = marker.pk
    return {'processed': processed, 'rebuilt': rebuilt, 'failures': failures, 'next_after': cursor,
            'has_more': query.filter(pk__gt=cursor).exists() if processed else bool(markers)}
