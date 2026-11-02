"""Validate legacy bait returns that were labelled with a non-market transfer ID."""
from collections import defaultdict

from utils.sync_policy import SyncError
from .models import FishingEvent, FishingTrip

PREFIX = 'fishing-return:'


def validate_legacy_returns(items):
    trip_ids = sorted({str(item.source.get('market_trade_id', ''))[len(PREFIX):] for item in items
                       if str(item.source.get('market_trade_id', '')).startswith(PREFIX)})
    trips = {}
    returns = defaultdict(list)
    for offset in range(0, len(trip_ids), 500):
        batch = trip_ids[offset:offset + 500]
        trips.update({row.pk: row for row in FishingTrip.objects.filter(pk__in=batch, ended_at__isnull=False).only(
            'id', 'owner_id', 'actor_id', 'ended_at')})
        for trip_id, data in FishingEvent.objects.filter(trip_id__in=batch, kind='return').values_list('trip_id', 'data'):
            returns[trip_id].append(data)
    for item in items:
        ref = item.source.get('market_trade_id')
        if not isinstance(ref, str) or not ref.startswith(PREFIX):
            raise SyncError('背包物品缺失市场转移依据')
        trip_id = ref[len(PREFIX):]
        trip = trips.get(trip_id)
        events = returns.get(trip_id, [])
        sku = item.source.get('sku')
        if (not trip or trip.owner_id != item.owner_id or trip.actor_id != item.actor_id
                or not isinstance(sku, str) or not sku.startswith('bait.') or len(events) != 1):
            raise SyncError('背包物品缺失市场转移或钓鱼返还依据')
        payloads = events[0].get('remaining', []) if isinstance(events[0], dict) else []
        if not any(isinstance(payload, dict) and type(payload.get('quantity')) is int and payload['quantity'] > 0
                   and isinstance(payload.get('source'), dict) and payload['source'].get('sku') == sku
                   for payload in payloads):
            raise SyncError('背包鱼饵缺少对应的钓鱼返还事实')
