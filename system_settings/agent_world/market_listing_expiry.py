"""挂牌有效期：只有实际降价才重置期限。"""
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.utils.dateparse import parse_datetime

from .life_time import local_time, storage_time


LISTING_LIFETIME = timedelta(days=2)
EXPIRY_REASON = 'listing_expired'


def expires_at(created_at: datetime, history) -> datetime:
    """从已有上架时间和完整改价历史推导期限，不新增同步字段。"""
    anchor = local_time(created_at)
    for entry in history if isinstance(history, list) else []:
        if not isinstance(entry, dict):
            continue
        try:
            before, after = Decimal(str(entry['from'])), Decimal(str(entry['to']))
            changed = parse_datetime(entry['at'])
            if not before.is_finite() or not after.is_finite() or not changed:
                continue
            changed = local_time(changed)
            if after > 0 and after < before and changed >= local_time(created_at):
                anchor = max(anchor, changed)
        except (KeyError, TypeError, ValueError, InvalidOperation):
            continue
    return storage_time(anchor + LISTING_LIFETIME)


def is_expired(listing, now) -> bool:
    return local_time(expires_at(listing.created_at, listing.history)) <= local_time(now)


def expired_return_trade_ids(owner: str, actor_id: str, rows) -> set[str]:
    """查已有撤单事实，避免把到期返还的库存直接套旧策略重新挂牌。"""
    from .market_models import MarketTransaction

    identities = {str((row.source or {}).get('market_trade_id') or '') for row in rows}
    identities.discard('')
    if not identities:
        return set()
    return set(MarketTransaction.objects.filter(
        pk__in=identities, owner_id=owner, actor_id=actor_id,
        operation__kind='withdraw', operation__reason=EXPIRY_REASON,
    ).values_list('pk', flat=True))
