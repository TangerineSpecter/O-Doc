"""One bounded background runner; local world permission is checked again at commit."""
import logging
import threading
import time
from django.db import close_old_connections
from django.utils import timezone
from system_settings.models import WorldActionRuntime
from .execution import execution_lease
from .life_models import LifeConfig
from .combat.models import CombatProfile
from .life_time import local_time, storage_time
from .tournament_models import TournamentRuntime, TournamentRound, TournamentReward
from .tournament_service import create_due, match_input, commit_match, advance
from .tournament_rewards import roll, grant

logger = logging.getLogger(__name__)
_thread = None
_lock = threading.Lock()


def enabled() -> bool:
    return WorldActionRuntime.objects.filter(pk='world', enabled=True).exists()


def run(now=None, *, seconds=20):
    if not enabled():
        return
    with execution_lease(TournamentRuntime, {'pk': 'tournament-runner'}) as token:
        if not token:
            return

        def check():
            if not enabled() or not TournamentRuntime.objects.filter(
                    pk='tournament-runner', token=token, until__gt=timezone.now()).exists():
                raise ValueError('大会本机执行许可已停止')

        point, deadline = local_time(now), time.monotonic() + seconds
        owners = set(LifeConfig.objects.values_list('pk', flat=True)) | set(CombatProfile.objects.values_list('owner_id', flat=True))
        for owner in sorted(owners):
            check()
            create_due(owner, point, check)
        # Catch up already-created rounds in scheduled order. Each completed round
        # exposes its successor; a bounded pass leaves remaining work to the next tick.
        while time.monotonic() < deadline:
            rows = list(TournamentRound.objects.filter(status='pending', tournament__status='active',
                scheduled_at__lte=storage_time(point)).select_related('tournament').order_by('scheduled_at', 'pk')[:20])
            if not rows:
                break
            progressed = False
            for row in rows:
                try:
                    for match in row.matches.filter(status='pending').select_related('round__tournament').order_by('number'):
                        check()
                        report, result = match_input(match)
                        commit_match(match.pk, report, result, check, point)
                        progressed = True
                        if time.monotonic() >= deadline:
                            break
                    advance(row.pk, point, check)
                except Exception:
                    logger.exception('大会比赛待重试 tournament=%s round=%s', row.tournament_id, row.pk)
                if time.monotonic() >= deadline:
                    break
            if not progressed:
                break
        # Each place is independent, so a model failure never withholds bronze.
        for identity in TournamentReward.objects.filter(status__in=['pending', 'rolled']).order_by('-place', 'pk').values_list('pk', flat=True)[:20]:
            try:
                check()
                roll(identity, check)
                grant(identity, check, point)
            except Exception:
                logger.exception('大会奖励待重试 reward=%s', identity)
            if time.monotonic() >= deadline:
                break


def background():
    try:
        close_old_connections()
        run()
    except Exception:
        logger.exception('大会轮询失败，将在后续轮询重试')
    finally:
        close_old_connections()


def tick():
    global _thread
    if not enabled():
        return
    with _lock:
        if not _thread or not _thread.is_alive():
            _thread = threading.Thread(target=background, name='tournament-runner', daemon=True)
            _thread.start()
