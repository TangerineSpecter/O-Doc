"""Deterministic aggregation; money remains Decimal until serialization."""
from collections import Counter, defaultdict
from datetime import timedelta
from decimal import Decimal
from ..life_time import local_time

CATEGORIES = {'work': '工作', 'publication': '创作', 'social': '社交', 'farm': '农场',
              'cooking': '烹饪', 'travel': '旅行', 'market': '市场', 'investment': '投资', 'exploration': '冒险', 'fishing': '钓鱼', 'lottery': '大乐透'}


def money(value):
    return format(value, '.2f')


def aggregate(facts, first, last, actor=''):
    selected = {actor} if actor else set(facts.residents)
    days = {}
    for offset in range((last-first).days+1):
        day = (first+timedelta(days=offset)).isoformat()
        days[day] = {'date': day, 'behaviors': 0, 'activeResidents': set(), 'income': Decimal(0), 'expense': Decimal(0)}
    residents = {key: {**value, 'days': set(), 'publications': 0, 'interactions': 0, 'received': 0,
                       'income': Decimal(0), 'expense': Decimal(0)} for key, value in facts.residents.items() if key in selected}
    categories = Counter()
    peers = Counter()
    peer_names = {}
    seen = set()
    for event in facts.events:
        if event.key in seen:
            continue
        seen.add(event.key)
        date = local_time(event.at).date().isoformat()
        if date not in days:
            continue
        if event.actor in residents:
            resident = residents[event.actor]
            resident['days'].add(date)
            days[date]['activeResidents'].add(event.actor)
            days[date]['behaviors'] += 1
            categories[event.category] += 1
            if event.category == 'publication': resident['publications'] += 1
            if event.category == 'social':
                resident['interactions'] += 1
                if event.peer and event.peer != event.actor:
                    peers[event.peer] += 1
                    peer_names[event.peer] = event.peer_name
        if event.category == 'social' and event.peer in residents and event.peer != event.actor:
            residents[event.peer]['received'] += 1
            # One world interaction contributes once to counterpart ranking; inbound external senders contribute too.
            if event.actor not in residents and event.actor:
                peers[event.actor] += 1
                peer_names[event.actor] = event.name
    sources = defaultdict(lambda: {'income': Decimal(0), 'expense': Decimal(0)})
    for entry in facts.ledger:
        if entry.agent_id not in residents:
            continue
        day = local_time(entry.created_at).date().isoformat()
        direction = 'income' if entry.amount > 0 else 'expense'
        amount = abs(entry.amount)
        residents[entry.agent_id][direction] += amount
        days[day][direction] += amount
        sources[entry.kind][direction] += amount
    rows = []
    for row in residents.values():
        active_days = len(row.pop('days'))
        row.update(activeDays=active_days, net=money(row['income']-row['expense']),
                   income=money(row['income']), expense=money(row['expense']))
        rows.append(row)
    rows.sort(key=lambda row: (-Decimal(row['net']), -row['activeDays'], row['id']))
    income = sum((day['income'] for day in days.values()), Decimal(0))
    expense = sum((day['expense'] for day in days.values()), Decimal(0))
    total = sum(categories.values())
    daily = [{**day, 'activeResidents': len(day['activeResidents']), 'income': money(day['income']),
              'expense': money(day['expense'])} for day in days.values()]
    destinations = {row.destination_id for row in facts.journeys if row.actor_id in selected and row.destination_id}
    return {
        'residents': sorted(facts.residents.values(), key=lambda row: (row['departed'], row['name'], row['id'])),
        'overview': {'activeResidents': sum(row['activeDays'] > 0 for row in rows),
                     'activeDays': sum(row['activeDays'] for row in rows),
                     'publications': sum(row['publications'] for row in rows),
                     'interactions': sum(row['interactions'] for row in rows),
                     'received': sum(row['received'] for row in rows),
                     'income': money(income), 'expense': money(expense), 'net': money(income-expense)},
        'daily': daily,
        'categories': [{'key': key, 'name': name, 'count': categories[key],
                        'percentage': round(100*categories[key]/total, 1) if total else 0} for key, name in CATEGORIES.items()],
        'peers': [{'id': key, 'name': facts.residents.get(key, {}).get('name') or peer_names.get(key) or '未记录',
                   'count': count} for key, count in sorted(peers.items(), key=lambda pair: (-pair[1], pair[0]))[:5]],
        'financeSources': [{'kind': kind, 'income': money(value['income']), 'expense': money(value['expense'])}
                           for kind, value in sorted(sources.items())],
        'outcomes': {'harvests': sum(key in selected for key in facts.harvests),
                     'collections': sum(key in selected for key in facts.collections),
                     'journeys': sum(row.actor_id in selected for row in facts.journeys),
                     'destinations': len(destinations),
                     'explorations': sum(row.actor_id in selected for row in facts.explorations),
                     'wins': len({row.identity for row in facts.wins if row.actor_id in selected})},
        'comparison': rows, 'notes': sorted(facts.unknown),
    }
