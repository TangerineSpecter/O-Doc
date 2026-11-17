"""Build one mergeable Shanghai-day contribution from an authoritative snapshot."""
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal

from ..life_time import SHANGHAI, storage_time
from .queries import load_facts
from .combat_statistics import load_combat_statistics
from .fishing_statistics import InvalidFishingStatisticsSource, load_fishing_statistics
from .archived_combat import InvalidCombatStatisticsSource
from .lottery_statistics import load_lottery_statistics


def day_bounds(day):
    start = datetime.combine(day, time.min, SHANGHAI)
    return storage_time(start), storage_time(start + timedelta(days=1))


def project_day(request, owner, day, include_daily):
    start, end = day_bounds(day)
    errors = {}
    articles = {}
    facts = load_facts(request, owner, start, end, include_daily=include_daily, combat_errors=errors,
                       article_archive=articles)
    # Counts keep both ends of an interaction so inbound activity and top peers
    # can be calculated for any resident after several days have been combined.
    events, seen, keyed = Counter(), set(), []
    for event in facts.events:
        if event.key not in seen:
            seen.add(event.key)
            fields = (event.actor or '', event.category, event.peer or '', event.peer_name or '', event.name or '')
            # A post/interaction and its activity mirror can fall on different
            # days. Tickets from one purchase can also straddle midnight.
            if event.category in ('social', 'publication', 'lottery') and not event.key.startswith('moment'):
                keyed.append([event.key, event.priority, *fields])
            else:
                events[fields] += 1
    ledger = defaultdict(Decimal)
    for row in facts.ledger:
        ledger[row.agent_id, row.kind, row.amount > 0] += row.amount
    destinations = defaultdict(set)
    for row in facts.journeys:
        if row.destination_id:
            destinations[row.actor_id].add(row.destination_id)
    kills = defaultdict(dict)
    for row in facts.wins:
        kills[''][row.identity] = row.count
        kills[row.actor_id][row.identity] = row.count
    def fishing_for(residents):
        return load_fishing_statistics(owner, start, end, residents, include_daily=include_daily)

    def combat_for(residents):
        return load_combat_statistics(owner, start, end, residents, include_daily=include_daily,
                                      departure_ids=facts.departure_ids, finished_departure_ids=facts.finished_departure_ids,
                                      contributions=True)
    try:
        fishing = fishing_for(facts.residents)
    except InvalidFishingStatisticsSource:
        fishing = []
        for actor, resident in facts.residents.items():
            try:
                fishing.extend(fishing_for({actor: resident}))
            except InvalidFishingStatisticsSource as exc:
                from system_logs.capture import capture
                errors[actor] = 'invalid_fishing_statistics_source'
                capture('钓鱼统计来源无效', module='agent_world', error_type=errors[actor], user_id=owner,
                        resource_id=exc.trip_id, fishing_trip_id=exc.trip_id, fishing_event_id=exc.event_id,
                        reason=exc.reason)
    try:
        combat = combat_for(facts.residents)
    except InvalidCombatStatisticsSource:
        combat = {}
        for actor, resident in facts.residents.items():
            try:
                combat.update(combat_for({actor: resident}))
            except InvalidCombatStatisticsSource:
                errors[actor] = 'invalid_combat_statistics_source'
    # Social records can supply different display names for the same external
    # peer. Keep their source order, with ties resolved by the source primary key.
    event_rows = [[*fields, count] for fields, count in events.items()]
    event_rows.sort(key=lambda row: (row[1], row if row[1] != 'social' else []))
    keyed.sort(key=lambda row: (row[3], row[0] if row[3] != 'social' else ''))
    return {
        # Keep the v2 shape for older readers. Current backlog is read per account.
        'backlog': [0, 0],
        'errors': errors,
        'residents': facts.residents,
        'events': event_rows,
        'keyed': keyed,
        'articles': articles,
        'ledger': [[actor, kind, str(amount)] for (actor, kind, _), amount in sorted(ledger.items())],
        'outcomes': {'harvests': dict(Counter(facts.harvests)), 'collections': dict(Counter(facts.collections)),
                     'journeys': dict(Counter(r.actor_id for r in facts.journeys)),
                     'explorations': dict(Counter(r.actor_id for r in facts.explorations))},
        'destinations': {actor: sorted(ids) for actor, ids in destinations.items()},
        'wins': {actor: sum(rows.values()) for actor, rows in kills.items()},
        'notes': sorted(facts.unknown),
        'fishing': sorted(fishing, key=lambda row: row['id']),
        'lottery': load_lottery_statistics(owner, start, end, facts.residents, contributions=True),
        'combat': combat,
    }
