"""Background backfill, independent of world execution and active residents."""
import logging
from datetime import timedelta
from time import monotonic
from types import SimpleNamespace

from django.db import close_old_connections, connection, transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone
from user.models import UserProfile
from ..life_time import local_time
from .archive import enqueue, days_between, publish
from .archived_combat import InvalidCombatStatisticsSource
from .consistency import analytics_snapshot
from .day_projection import project_day
from .fishing_statistics import InvalidFishingStatisticsSource
from .models import ResidentAnalyticsWork

logger = logging.getLogger(__name__)


def seed(earliest=None):
    today = local_time().date()
    days = days_between(today - timedelta(days=29), today)
    for owner in UserProfile.objects.exclude(userid='').values_list('userid', flat=True).distinct():
        enqueue(owner, days)
        if earliest is not None:
            from .archive_history import enqueue_history
            enqueue_history(owner, earliest, today)


def process_one():
    with transaction.atomic():
        work = (ResidentAnalyticsWork.objects.select_for_update(skip_locked=True)
                .filter(dirty=True, after__lte=timezone.now()).order_by('after', '-day', 'pk').first())
        if not work:
            return False
        # Expiring claim allows another server process to resume a crashed build.
        work.after = timezone.now() + timedelta(minutes=3)
        work.save(update_fields=['after'])
    try:
        with analytics_snapshot() as include_daily:
            profile = UserProfile.objects.select_related('user').filter(userid=work.owner_id).first()
            if profile is not None:
                data = project_day(SimpleNamespace(user=profile.user), work.owner_id, work.day, include_daily)
        if profile is None:
            # The restore may remove an account while preserving its device-local
            # queue. Recheck membership in the deletion statement after the snapshot.
            profile_exists = UserProfile.objects.filter(userid=OuterRef('owner_id'))
            ResidentAnalyticsWork.objects.filter(owner_id=work.owner_id).filter(~Exists(profile_exists)).delete()
        else:
            publish(work, data)
    except Exception as exc:
        if isinstance(exc, InvalidFishingStatisticsSource):
            reason = 'invalid_fishing_statistics_source'
        elif isinstance(exc, InvalidCombatStatisticsSource):
            reason = 'invalid_combat_statistics_source'
        else:
            reason = 'analytics_archive_unavailable'
        ResidentAnalyticsWork.objects.filter(pk=work.pk, after=work.after, generation=work.generation).update(
            error=reason, verified_digest='', after=timezone.now() + timedelta(minutes=1))
        logger.exception('居民每日统计生成失败 day=%s', work.day)
    return True


def run_loop(stop):
    if connection.vendor != 'postgresql':
        stop.wait()
        return
    next_seed = 0
    checked_day, earliest = None, None
    try:
        while not stop.is_set():
            close_old_connections()
            if monotonic() >= next_seed:
                from .archive_history import history_start
                today = local_time().date()
                if checked_day != today:
                    earliest = history_start(today)
                    checked_day = today
                seed(earliest)
                next_seed = monotonic() + 300
            stop.wait(0.05 if process_one() else 2)
    finally:
        close_old_connections()
