"""完整成交链恢复；投资账户投影必须与成交事实一致。"""
import hashlib
import json
from decimal import Decimal
from django.core.serializers.json import DjangoJSONEncoder
from .investment_models import InvestmentAccount, InvestmentTrade, InvestmentIntegrity, InvestmentDecision, InvestmentNewsClaim
from .investment_service import apply_position, energy_action_id


def fingerprints(owner):
    return {model.__name__: hashlib.sha256(json.dumps(list(model.objects.filter(owner_id=owner).order_by('pk').values()),
            cls=DjangoJSONEncoder, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            for model in (InvestmentAccount, InvestmentTrade, InvestmentNewsClaim)}


def checkpoint(owner):
    InvestmentIntegrity.objects.update_or_create(pk=owner, defaults={'hashes': fingerprints(owner)})


def reconcile_investments():
    from utils.sync_manager import SyncError
    from system_settings.models import WorldAction
    from .models import WorldLedger
    owners = set(InvestmentIntegrity.objects.values_list('pk', flat=True))
    owners.update(InvestmentAccount.objects.values_list('owner_id', flat=True))
    owners.update(InvestmentTrade.objects.values_list('owner_id', flat=True))
    owners.update(InvestmentNewsClaim.objects.values_list('owner_id', flat=True))
    for owner in owners:
        check = InvestmentIntegrity.objects.filter(pk=owner).first()
        if not check or check.hashes != fingerprints(owner):
            raise SyncError('投资快照缺失成交或持仓事实，已拒绝恢复')
    for trade in InvestmentTrade.objects.all():
        if not InvestmentAccount.objects.filter(pk=trade.actor_id, owner_id=trade.owner_id).exists():
            raise SyncError('投资成交缺失对应账户')
    expected_ledger, expected_energy = [], []
    for account in InvestmentAccount.objects.all():
        positions, seen = {}, set()
        trades = {t.pk: t for t in InvestmentTrade.objects.filter(actor_id=account.pk, owner_id=account.owner_id).select_related('decision')}
        if set(account.trade_keys) != set(trades) or len(account.trade_keys) != len(trades):
            raise SyncError('投资账户缺失或重复成交')
        for key in account.trade_keys:
            t = trades[key]
            if t.decision.owner_id != account.owner_id or t.decision.actor_id != account.pk or t.operation['day'] != t.decision.execution_date.isoformat() or t.result['price_date'] != t.decision.reference_date.isoformat():
                raise SyncError('投资成交归属或参考日期不一致')
            if (t.decision_id, t.operation['code'], 'sell' if t.operation['side']=='buy' else 'buy') in seen:
                raise SyncError('投资机会存在反向交易')
            seen.add((t.decision_id,t.operation['code'],t.operation['side']))
            try:
                price = Decimal(t.result['price'])
                positions, allocated = apply_position(positions, t.operation, price, t.result['available_on'])
            except (ValueError, KeyError, ArithmeticError) as exc:
                raise SyncError('投资成交链无法恢复') from exc
            if type(t.operation['quantity']) is not int or t.operation['quantity'] <= 0 or not price.is_finite() or price <= 0 or t.operation['side'] not in ('buy','sell'):
                raise SyncError('投资成交金额或数量无效')
            amount = price*t.operation['quantity']
            delta = -amount if t.operation['side']=='buy' else amount
            if Decimal(t.result['realized_profit']) != (amount-allocated if t.operation['side']=='sell' else Decimal(0)):
                raise SyncError('投资已实现收益与成交不一致')
            if positions != t.result['positions_after'] or Decimal(t.result['allocated_cost']) != allocated or Decimal(t.result['cash_delta']) != delta:
                raise SyncError('投资成交资产结果不一致')
            ledger_id = 'investment:'+key; expected_ledger.append(ledger_id)
            WorldLedger.objects.update_or_create(pk=ledger_id, defaults={'agent_id':account.pk,'agent_name':t.actor_name,
                'kind':'investment','amount':delta,'created_at':t.created_at,'snapshot':{'trade_id':key,'code':t.operation['code'],'side':t.operation['side'],'price_date':t.result['price_date']}})
            energy_id = energy_action_id(t.decision_id)
            if energy_id not in expected_energy:
                expected_energy.append(energy_id)
                WorldAction.objects.update_or_create(pk=energy_id, defaults={'actor_id':account.pk,'task':t.decision.task,
                    'status':'success','consumed_at':t.created_at,'energy_cost':5,'effects_done':True,
                    'snapshot':{'investment_energy':True},'result':{'decision_id':t.decision_id}})
        if positions != account.positions:
            raise SyncError('投资持仓与成交链不一致')
    WorldLedger.objects.filter(kind='investment').exclude(pk__in=expected_ledger).delete()
    WorldAction.objects.filter(snapshot__investment_energy=True).exclude(pk__in=expected_energy).delete()
    from .investment_execution import revoke_investment_leases
    revoke_investment_leases()
    # Also close claimed opportunities that have not acquired a resident lease.
    interrupted = list(WorldAction.objects.filter(snapshot__investment=True, effects_done=False).select_related('record', 'agent'))
    WorldAction.objects.filter(snapshot__investment=True, effects_done=False).update(
        effects_done=True, status='interrupted', result={'reason':'快照恢复，本次投资机会已结束'},
    )
    InvestmentDecision.objects.filter(status='running').update(status='interrupted', reason='快照恢复，本次投资机会已结束')

    # 恢复撤销授权的同时关闭执行记录，避免迟到的 runner 因 effects_done 而无法收束。
    from .run_diagnostics import finish_record
    from system_settings.agent_activity import update_work_activity
    for action in interrupted:
        if action.record_id and action.record.status == 'running':
            reason = '快照恢复，投资执行授权已失效；本次机会结束，已提交交易保留'
            output = json.dumps({'reason': reason}, ensure_ascii=False)
            finish_record(action.record, 'failed', reason, output, '投资执行中断')
            if action.agent:
                update_work_activity(action.record, action.agent, status='failed', summary=reason, current_action='投资执行中断', output=output)
