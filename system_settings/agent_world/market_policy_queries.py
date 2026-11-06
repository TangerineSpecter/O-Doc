"""Read-only policy and shared protection projection for compact/full market views."""
import logging
from collections import defaultdict
from django.utils import timezone
from .inventory_policy import is_current
from .inventory_protection import projection
from .life_time import local_time
from .market_listing_expiry import expired_return_trade_ids
from .market_disposition import rows_for

logger = logging.getLogger(__name__)


def policy_payload(policy, context=None, *, rows=None, expired_returns=None, protection_error=False) -> dict:
    current = is_current(policy)
    row = {key: getattr(policy, key) for key in ('sku', 'target_hold', 'sell_ratio', 'list_ratio',
             'star_order', 'status', 'source', 'reason')}
    row.update(strategy=policy.strategy, list_price_ratio=str(policy.list_price_ratio),
               reviewed_date=(policy.strategy or {}).get('reviewed_date'),
               review_status='current' if current and policy.strategy['reviewed_date'] == local_time(timezone.now()).date().isoformat()
               else 'review')
    rows = rows_for(policy.owner_id, policy.actor_id, policy.sku) if rows is None else rows
    try:
        if protection_error:
            raise ValueError('制作预留无法解释')
        state = projection(policy.owner_id, policy.actor_id, policy.sku, policy.strategy if current else None, context=context)
        expired = (expired_return_trade_ids(policy.owner_id, policy.actor_id, rows)
                   if expired_returns is None else expired_returns)
        blocked_rows = {r.pk for r in rows if str((r.source or {}).get('market_trade_id') or '') in expired}
        blocked = sum(n for key, n in state['free_rows'].items() if key in blocked_rows)
        row['protection'] = {k: v for k, v in state.items() if k != 'free_rows'}
        row['protection']['disposable'] = state['disposable'] if current else 0
        row['protection']['blocked_listing'] = blocked
        row['protection']['blocked_reason'] = ('尚无完整用途策略，保留库存等待复核' if not current else
            '已确认用途需求尚有缺口' if state['missing'] else '到期返还库存暂不能再次挂牌' if blocked else '')
    except (ValueError, KeyError, TypeError):
        if not protection_error:
            logger.exception('库存保护投影失败 actor=%s sku=%s', policy.actor_id, policy.sku)
        row['protection'] = {'total': sum(r.quantity for r in rows),
                             'protected': None, 'required': None, 'missing': None, 'disposable': 0,
                             'uses': {}, 'blocked_listing': 0, 'blocked_reason': '制作预留无法解释，已暂停自动处置'}
    if not current:
        row['status'] = 'review'
    return row


def policies_payload(owner: str, actor_id: str) -> list[dict]:
    from types import SimpleNamespace
    from .market_plan_models import MarketDisposition
    from .inventory_protection import read_context
    from .inventory_stock import inventory_items
    from .market_disposition import disposable
    inventory = list(inventory_items(actor_id, owner))
    protection_error = False
    try:
        context = read_context(owner, actor_id, inventory=inventory)
    except (ValueError, KeyError, TypeError):
        logger.exception('库存预留读取失败 actor=%s', actor_id)
        context = {'stock': [], 'demands': []}
        protection_error = True
    policies = {p.sku: p for p in MarketDisposition.objects.filter(owner_id=owner, actor_id=actor_id)}
    skus = {r.source.get('sku', '') for r in inventory if disposable(r.source.get('sku', ''))}
    if context:
        skus.update(r['sku'] for r in context['demands'] if disposable(r['sku']))
    for sku in skus - set(policies):
        policies[sku] = SimpleNamespace(owner_id=owner, actor_id=actor_id, sku=sku, strategy={},
            target_hold=0, sell_ratio=0, list_ratio=0, star_order='low', status='review',
            source='default', reason='等待首次制定用途目标', list_price_ratio='1.20')
    rows_by_sku, stock_by_sku, demands_by_sku = defaultdict(list), defaultdict(list), defaultdict(list)
    for item in inventory:
        rows_by_sku[(item.source or {}).get('sku', '')].append(item)
    for item in context['stock']:
        stock_by_sku[item['sku']].append(item)
    for demand in context['demands']:
        demands_by_sku[demand['sku']].append(demand)
    expired = expired_return_trade_ids(owner, actor_id, inventory)
    return [policy_payload(policies[sku], {'stock': stock_by_sku[sku], 'demands': demands_by_sku[sku]},
                           rows=rows_by_sku[sku], expired_returns=expired, protection_error=protection_error)
            for sku in sorted(policies)]
