"""以胜出的完整农场校准流水和体力，背包沿用共享库存同步，拒绝半份经营快照。"""
import hashlib
from decimal import Decimal
from system_settings.models import WorldAction
from .farm_models import AgentFarm, FarmOperation, FarmCatalog
from .models import WorldLedger


def reconcile_farms():
    from utils.sync_manager import SyncError
    for farm in AgentFarm.objects.all():
        if not FarmCatalog.objects.filter(pk=farm.owner_id).exists():
            raise SyncError('农场目录缺失，已拒绝恢复不完整快照')
        keys = farm.state.get('operation_keys', [])
        operations = {o.pk: o for o in FarmOperation.objects.filter(farm=farm)}
        if any(k not in operations for k in keys):
            raise SyncError('农场经营记录缺失，已拒绝恢复不完整快照')
        from .farm_quality_sync import validate_chain
        validate_chain(farm, [operations[k] for k in keys])
        from .farm_bonus import validate_bonus_chain
        validate_bonus_chain(farm.state, [operations[k] for k in keys])
        losers = set(operations)-set(keys)
        FarmOperation.objects.filter(pk__in=losers).delete()
        WorldAction.objects.filter(snapshot__farm_energy=True, result__operation_id__in=list(losers)).delete()
        WorldLedger.objects.filter(kind='farm', snapshot__farm_id=farm.pk).exclude(pk__in=['farm:'+k for k in keys]).delete()
        for key in keys:
            op = operations[key]
            amount = Decimal(op.result['amount'])
            if amount:
                WorldLedger.objects.update_or_create(pk='farm:'+key, defaults={'agent_id': farm.pk, 'agent_name': farm.actor_name,
                    'kind': 'farm', 'amount': amount, 'created_at': op.created_at,
                    'snapshot': {'farm_id': farm.pk, 'operation_id': key, 'operation': op.operation, 'reason': op.reason}})
            energy_id = hashlib.sha256(f'farm-energy:{key}'.encode()).hexdigest()
            # Existing FK snapshots remain; rebuild only the immutable consumption fact.
            WorldAction.objects.update_or_create(pk=energy_id, defaults={'actor_id': farm.pk, 'status': 'success',
                'energy_cost': 2, 'consumed_at': op.created_at, 'effects_done': True,
                'snapshot': {'farm_energy': True}, 'result': {'operation_id': key}})
        # 背包由 AgentInventoryItem 的共用快照恢复，不能用农场旧库存覆盖市场等来源。
        if 'inventory_snapshot' in farm.state:
            farm.state.pop('inventory_snapshot')
            farm.save(update_fields=['state'])
