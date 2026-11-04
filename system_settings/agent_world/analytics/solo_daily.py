"""Read verified legacy solo kills from compact completed-run outcomes."""
from datetime import time

from ..combat.analytics_models import CombatSoloSettlement
from ..combat.models import Exploration
from ..combat.party_daily import _timestamp
from ..combat.solo_settlement import matches_run
from ..life_time import local_time
from .combat_kills import CombatKill


def load_solo_kills(owner, run_ids, *, start=None, end=None, include_monster=True):
    if not run_ids:
        return set(), []
    first = last = None
    if start is not None and end is not None:
        first, last = local_time(start), local_time(end)
        if first.time() != time.min or last.time() != time.min or first >= last:
            # Synced datetimes are stored at millisecond precision; arbitrary
            # sub-day windows must keep using their original encounter times.
            return set(), []
    markers = list(CombatSoloSettlement.objects.filter(owner_id=owner, pk__in=run_ids))
    runs = {row.pk: row for row in Exploration.objects.filter(pk__in=[item.pk for item in markers], owner_id=owner)
            .only('id', 'owner_id', 'actor_id', 'catalog_id', 'status', 'ended_at', 'elapsed_seconds', 'snapshot', 'result')}
    covered, kills = set(), []
    for marker in markers:
        run = runs.get(marker.pk)
        if not run or not matches_run(marker, run):
            continue
        covered.add(marker.pk)
        for item in marker.content['kills']:
            at = _timestamp(item['occurred_at'])
            if first is not None and not first <= at < last:
                continue
            kills.append(CombatKill(run.actor_id, run.pk, 'solo:' + item['encounter_id'],
                                    item['monster'] if include_monster else {}, 1, (1, item['encounter_id'])))
    return covered, kills
