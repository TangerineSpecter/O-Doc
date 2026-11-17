"""Combine daily counts and distinct identities without reading business tables."""
from collections import Counter
from decimal import Decimal
from types import SimpleNamespace

from .articles import resolve_article
from .combat_statistics import finish_combat
from .day_projection import day_bounds
from .fishing_statistics import finish_fishing
from .lottery_statistics import COUNT_FIELDS, MONEY_FIELDS, empty, serialize
from .queries import Event, Facts
from .service import aggregate

FISH_COUNTS = ('trips', 'casts', 'catches', 'kings', 'escaped', 'empty', 'junk', 'experience', 'ordinaryCatches')
COMBAT_COUNTS = ('explorations', 'settled', 'completed', 'ongoing', 'fallen', 'recalled', 'exhausted', 'otherEnded',
                 'kills', 'bossKills', 'experience', 'elapsedSeconds', 'energy', 'potions')


def add_lottery(target, source, actor):
    for key in COUNT_FIELDS:
        target[key] += source[key]
    for key in MONEY_FIELDS:
        target[key] += Decimal(source[key])
    target['maxPrize'] = max(target['maxPrize'], Decimal(source['maxPrize']))
    for key in ('roundIds', 'winningRoundIds'):
        target[key].update(source[key])
    target['purchaseKeys'].update((actor, key) for key in source['purchaseKeys'])


def combine(days, first, last, residents, actor=''):
    facts = Facts(residents=residents)
    selected = {actor: residents[actor]} if actor else residents
    fishing = {k: {**row, **dict.fromkeys(FISH_COUNTS, 0)} for k, row in selected.items()}
    combat = {k: {**row, **dict.fromkeys(COMBAT_COUNTS, 0), 'job': None, 'jobName': None, 'jobLevel': None,
                  'longestSeconds': 0, 'destinations': set(), 'monsters': {}} for k, row in selected.items()}
    lottery = {k: {**row, **empty()} for k, row in selected.items()}
    total = empty()
    outcomes, destinations = Counter(), set()
    keyed = {}
    authors, senders = {}, {}
    for _, data in days:
        authors.update(data['articles']['authors'])
        senders.update(data['articles']['senders'])
    for day, data in days:
        at, _ = day_bounds(day)
        for index, (sender, category, peer, peer_name, name, count) in enumerate(data['events']):
            facts.events.append(Event((day, index), sender, at, category, peer, peer_name, name, count))
        for identity, priority, sender, category, peer, peer_name, name in data['keyed']:
            if identity not in keyed or priority < keyed[identity].priority:
                keyed[identity] = Event(identity, sender, at, category, peer, peer_name, name, priority=priority)
        for row in data['articles']['rows']:
            resolved = resolve_article(row, authors, senders, residents)
            if resolved:
                identity, sender, category, name, peer, peer_name = resolved
                keyed[identity] = Event(identity, sender, at, category, peer, peer_name, name, priority=0)
        for sender, kind, amount in data['ledger']:
            facts.ledger.append(SimpleNamespace(agent_id=sender, created_at=at, kind=kind, amount=Decimal(amount)))
        facts.unknown.update(data['notes'])
        for name, counts in data['outcomes'].items():
            outcomes[name] += sum(n for k, n in counts.items() if k in selected)
        outcomes['wins'] += data['wins'].get(actor, 0)
        for k, ids in data['destinations'].items():
            if k in selected:
                destinations.update(ids)
        for source in data['fishing']:
            if source['id'] in selected:
                for key in FISH_COUNTS:
                    fishing[source['id']][key] += source[key]
        for k, source in data['lottery'].items():
            if k in selected:
                add_lottery(lottery[k], source, k)
                add_lottery(total, source, k)
        for k, source in data['combat'].items():
            if k not in selected:
                continue
            target = combat[k]
            if source.get('jobName'):
                for field in ('job', 'jobName', 'jobLevel'):
                    target[field] = source[field]
            for key in COMBAT_COUNTS:
                target[key] += source[key]
            target['longestSeconds'] = max(target['longestSeconds'], source['longestSeconds'])
            target['destinations'].update(source['destinations'])
            for monster, values in source['monsters'].items():
                detail = target['monsters'].setdefault(monster, {**values, 'kills': 0})
                detail['kills'] += values['kills']
                detail['highestLevel'] = max(detail['highestLevel'], values['highestLevel'])
    facts.events.extend(keyed.values())
    summary = aggregate(facts, first, last, actor)
    summary['outcomes'].update(outcomes, destinations=len(destinations))
    ordered = sorted(lottery.values(), key=lambda r: (-(r['prizes'] - r['expense']), -r['winningTickets'], r['id']))
    return {**summary, 'startDate': first.isoformat(), 'endDate': last.isoformat(), 'actorId': actor,
            'lotteryStatistics': {'overview': serialize(total), 'residents': [serialize(row) for row in ordered]},
            'combatComparison': finish_combat(combat), 'fishingComparison': finish_fishing(fishing)}
