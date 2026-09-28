import random
from django.db.models import Q
from .travel_models import TravelDestination, TravelJourney


def candidates(agent, recent_count=3):
    history = TravelJourney.objects.filter(actor_id=agent.pk, arrived_at__isnull=False).filter(Q(snapshot__destination_scope__isnull=True) | ~Q(snapshot__destination_scope__in=['region', 'unconfirmed']))
    recent = list(history
                  .order_by('-arrived_at').values_list('destination_id', flat=True)[:recent_count])
    rows = list(TravelDestination.objects.filter(enabled=True).values('id', 'country_code', 'country', 'region', 'city', 'price'))
    visited = set(history.values_list('destination_id', flat=True))
    pools = {}
    for row in rows:
        if row['id'] not in recent:
            pools.setdefault(row['country_code'], []).append(row)
    selected = []
    affordable = [row for group in pools.values() for row in group if row['price'] <= agent.money]
    if not affordable:
        affordable = [row for row in rows if row['price'] <= agent.money]
    if affordable:
        selected.append(random.choice([row for row in affordable if row['id'] not in visited] or affordable))
    countries = list(pools)
    random.shuffle(countries)
    def price_band(row):
        return 0 if row['price'] < 5000 else 1 if row['price'] < 10000 else 2
    for country in countries:
        if len(selected) >= 5:
            break
        if any(row['country_code'] == country for row in selected):
            continue
        group = pools[country]
        group = [row for row in group if row['id'] not in visited] or group
        # 不让同一档位占满所有选项。
        bands = [[r for r in group if price_band(r) == index] for index in range(3)]
        used = {price_band(row) for row in selected}
        group = random.choice([band for index, band in enumerate(bands) if band and index not in used]
                              or [band for band in bands if band])
        selected.append(random.choice(group))
    fallback = [row for row in rows if row['id'] not in recent and row['id'] not in {r['id'] for r in selected}]
    while len(selected) < min(5, len(rows)) and fallback:
        first = [row for row in fallback if row['id'] not in visited] or [row for row in fallback if row['id'] not in recent] or fallback
        row = random.choice(first)
        selected.append(row)
        fallback.remove(row)
    return [{**row, 'price': str(row['price']), 'visited': row['id'] in visited} for row in selected]


def travelling_ids():
    return TravelJourney.objects.filter(departed_at__isnull=False, returned_at__isnull=True,
        status__in=['active', 'paused', 'waiting', 'manual']).values_list('actor_id', flat=True)
