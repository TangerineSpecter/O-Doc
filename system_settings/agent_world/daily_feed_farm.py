"""一次时间线请求只读取一份种植队列；轮询和恢复状态不产生历史活动日。"""
from collections import defaultdict
from datetime import datetime

from .farm_models import AgentFarm
from .life_time import SHANGHAI, local_time, storage_time

QUIET_CODES = {
    'busy', 'recovered', 'resumed', 'activated', 'land', 'seeds', 'fertilizer',
    'stamina', 'travel', 'paused', 'mcp-disabled', 'investment-stamina', 'investment-protected',
}


class FarmQueueDays:
    def __init__(self, owner):
        self.owner = owner
        self._by_day = None

    @property
    def by_day(self):
        if self._by_day is None:
            grouped = defaultdict(list)
            for actor, name, plans in AgentFarm.objects.filter(owner_id=self.owner).values_list(
                    'pk', 'actor_name', 'state__planting_plans'):
                for plan in (plans or {}).values():
                    for row in plan.get('events', []):
                        if row['code'] not in QUIET_CODES:
                            when = datetime.fromtimestamp(row['at'], SHANGHAI)
                            reason = (plan.get('versions') or [{}])[0].get('reason', '') if row['code'] == 'planned' else ''
                            grouped[when.date()].append((actor, name, when, row, reason))
            self._by_day = dict(sorted(grouped.items(), reverse=True))
        return self._by_day

    def latest_before(self, before, actor):
        last_day = local_time(before).date()
        for day, events in self.by_day.items():
            if day > last_day:
                continue
            times = (storage_time(when) for identity, _, when, _, _ in events if not actor or actor == identity)
            latest = max((when for when in times if when < before), default=None)
            if latest is not None:
                return latest
        return None
