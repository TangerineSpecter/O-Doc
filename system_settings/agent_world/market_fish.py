"""进场统一回收普通鱼：鱼没有配方用途，鱼王与已挂牌鱼保留。

市场会话创建后立即执行，不询问模型、不占二十次市场调用。每行使用稳定
请求键，重复进场不会重复成交；单行失败只记录，不阻断进入市场。
"""
import hashlib
import logging
from decimal import Decimal

from .fishing.catalog import FISH_ROWS
from .inventory_stock import inventory_items
from .market_service import trade

logger = logging.getLogger(__name__)

FISH_PREFIX = 'fish.'
KING_SKUS = frozenset('fish.' + row[0] for row in FISH_ROWS if row[-1])


def is_king(row) -> bool:
    return row.kind == 'fish_king' or (row.source or {}).get('sku') in KING_SKUS


def sellable(owner: str, actor_id: str) -> list:
    """背包中的普通鱼；托管中的挂牌鱼不在背包行内，不在此处理。"""
    return [row for row in inventory_items(actor_id, owner)
            if (row.source or {}).get('sku', '').startswith(FISH_PREFIX) and not is_king(row)]


def clear(owner: str, session, agent, now=None) -> dict:
    sold, failed = [], []
    for row in sellable(owner, agent.pk):
        if row.quantity < 1:
            continue
        # 会话键每次进场唯一，重新钓到的鱼不会命中上一次成交的请求键。
        key = hashlib.sha256(
            f'fish-clear:{session.pk}:{row.pk}:{row.quantity}'.encode()).hexdigest()
        try:
            result = trade(session, agent, key, {
                'kind': 'sell', 'item_id': row.pk, 'quantity': row.quantity}, now)
        except Exception:  # noqa: BLE001 - 单条鱼失败不能阻断进场
            logger.exception('进场回收鱼失败 owner=%s actor=%s item=%s', owner, agent.pk, row.pk)
            failed.append({'item_id': row.pk, 'name': row.name, 'quantity': row.quantity})
            continue
        sold.append({'item_id': row.pk, 'name': result.get('name', row.name),
                     'quantity': result.get('quantity', row.quantity),
                     'total': result.get('total', '0')})
    return {'sold': sold, 'failed': failed,
            'total': str(sum((Decimal(row['total']) for row in sold), Decimal(0)))}
