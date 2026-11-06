"""Validate portable policy choices before source merge/import and after restoration."""
from .inventory_policy import validate


def metadata(data: list[dict] | None = None) -> dict:
    if data is None:
        from .market_plan_models import MarketDisposition
        from .market_plan_models import MarketPlan
        return {'market_strategy_schema_version': int(MarketDisposition.objects.exclude(strategy={}).exists() or
            MarketPlan.objects.filter(context__has_key='inventory_policy_reviews').exists())}
    return {'market_strategy_schema_version': 1 if any(
        row['model'] == 'system_settings.marketdisposition' and row['fields'].get('strategy')
        or row['model'] == 'system_settings.marketplan' and (row['fields'].get('context') or {}).get('inventory_policy_reviews')
        for row in data) else 0}


def validate_version(meta) -> None:
    if meta and (type(meta.get('market_strategy_schema_version', 0)) is not int
                 or not 0 <= meta.get('market_strategy_schema_version', 0) <= 1):
        from utils.sync_manager import SyncError
        raise SyncError('库存策略快照版本过新或无效，请升级所有设备')


def validate_source(data: list[dict], meta=None) -> None:
    from utils.sync_manager import SyncError
    from .inventory_policy import purposes
    from .market_disposition import can_shop_sell, can_list
    validate_version(meta)
    if meta is not None and meta.get('market_strategy_schema_version', 0) < metadata(data)['market_strategy_schema_version']:
        raise SyncError('库存策略版本声明缺失或与数据不一致')
    validate_checkpoints(data)
    plans = {str(r['pk']): r['fields'] for r in data if r['model'] == 'system_settings.marketplan'}
    for row in data:
        fields = row['fields']
        try:
            if row['model'] == 'system_settings.marketdisposition' and fields.get('strategy'):
                strategy = validate(fields['strategy'], sell_ratio=fields['sell_ratio'], list_ratio=fields['list_ratio'])
                if set(strategy['targets']) != set(purposes(fields['sku'])):
                    raise ValueError('保留用途不适用于该物品')
                from decimal import Decimal
                if Decimal(str(fields.get('list_price_ratio'))) not in (Decimal('1'), Decimal('1.2'), Decimal('1.5'), Decimal('2')):
                    raise ValueError('挂牌价格策略无效')
                if fields.get('star_order') not in ('high', 'low'):
                    raise ValueError('处置星级顺序无效')
                if fields['sell_ratio'] and not can_shop_sell(fields['sku']):
                    raise ValueError('该物品不能商店回收')
                if fields['list_ratio'] and not can_list(fields['sku']):
                    raise ValueError('该物品不能挂牌')
            if row['model'] == 'system_settings.marketgoal':
                plan = plans.get(str(fields['plan']))
                if not plan or any(plan[k] != fields[k] for k in ('owner_id', 'actor_id')):
                    raise ValueError('采购目标归属与计划不一致')
            if row['model'] == 'system_settings.marketplan':
                reviews = (fields.get('context') or {}).get('inventory_policy_reviews', {})
                if not isinstance(reviews, dict):
                    raise ValueError('复核进度格式无效')
                for sku, progress in reviews.items():
                    if (not isinstance(sku, str) or not can_list(sku) or not isinstance(progress, dict)
                            or progress.get('status') not in ('pending', 'done', 'review')
                            or not isinstance(progress.get('signature'), str)
                            or len(progress['signature']) != 64 or not isinstance(progress.get('answers'), dict)
                            or any(not isinstance(k, str) or not isinstance(v, str) for k, v in progress['answers'].items())):
                        raise ValueError('复核步骤或缓存答案无效')
        except (ValueError, TypeError, KeyError, ArithmeticError) as exc:
            raise SyncError(f'库存策略快照无效：{exc}') from exc


def validate_checkpoints(data: list[dict]) -> None:
    """Check raw owner aggregates before merge/import; do not repair source hashes."""
    import hashlib
    import json
    from django.apps import apps
    from django.core.serializers.json import DjangoJSONEncoder
    from django.db import models
    from utils.sync_datetime import SyncJSONEncoder
    from utils.sync_manager import SyncError
    names = ('MarketBatch', 'MarketListing', 'MarketSession', 'MarketTransaction', 'AgentFarm',
             'AgentInventoryItem', 'MarketPlan', 'MarketGoal', 'MarketDisposition', 'MarketNoBuy')
    for checkpoint in (r for r in data if r['model'] == 'system_settings.marketintegrity'):
        expected = checkpoint['fields']['hashes']
        for name in names:
            model = apps.get_model('system_settings', name)
            rows = [r for r in data if r['model'] == model._meta.label_lower
                    and r['fields'].get('owner_id') == str(checkpoint['pk'])]
            if name not in expected:
                if rows:
                    raise SyncError('市场来源检查点缺少资产分量')
                continue
            normalized = []
            for row in sorted(rows, key=lambda r: str(r['pk'])):
                values = {model._meta.pk.attname: row['pk']}
                for key, value in row['fields'].items():
                    field = model._meta.get_field(key)
                    values[field.attname] = field.to_python(value) if isinstance(field, (models.DateField, models.DecimalField)) else value
                if name == 'MarketBatch' and not values.get('supplies'):
                    values.pop('supplies', None)
                normalized.append(values)
            hashes = [hashlib.sha256(json.dumps(normalized, cls=encoder, sort_keys=True,
                                               separators=(',', ':')).encode()).hexdigest()
                      for encoder in (SyncJSONEncoder, DjangoJSONEncoder)]
            if expected[name] not in hashes:
                raise SyncError('市场来源资产检查点不一致，拒绝合并或恢复')
