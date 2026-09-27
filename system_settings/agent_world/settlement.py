from datetime import datetime
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from anthology.models import Anthology
from .models import WorldMonthSettlement, WorldLedger, WorldIncomeConfig
from .ranking import rank, month_cutoff, SHANGHAI
from .identity import resolve_agent
from .income import current_config, ensure_opening, recompute_balances


@transaction.atomic
def reconcile_awards() -> None:
    """奖金是胜出封榜记录的投影；同步后整份名单覆盖本机旧投影。"""
    for settlement in WorldMonthSettlement.objects.select_for_update().order_by("id"):
        keys = []
        awards = []
        for winner in settlement.awards:
            winner = dict(winner)
            key = f'prize:{settlement.collection_id}:{settlement.month}:{winner["rank"]}'
            keys.append(key)
            agent = resolve_agent(winner['author_id']) if winner.get('author_id') else None
            if agent:
                ensure_opening(agent)
                projection = {**winner, 'status': 'paid'}
                existing = WorldLedger.objects.filter(pk=key).first()
                amount = Decimal(winner['amount'])
                if existing is None or existing.agent_id != agent.pk or existing.amount != amount or existing.snapshot != projection:
                    WorldLedger.objects.update_or_create(pk=key, defaults={'agent_id': agent.pk, 'agent_name': agent.name,
                        'kind': 'prize', 'amount': amount, 'snapshot': projection})
                winner['status'] = 'paid'
            else:
                existing = WorldLedger.objects.filter(pk=key).first()
                # Agent deletion does not revoke an already paid historical prize.
                if existing and existing.agent_id == winner.get('author_id'):
                    winner['status'] = 'paid'
                else:
                    WorldLedger.objects.filter(pk=key).delete()
                    winner['status'] = 'unresolved_author'
            awards.append(winner)
        WorldLedger.objects.filter(kind='prize', id__startswith=f'prize:{settlement.collection_id}:{settlement.month}:').exclude(pk__in=keys).delete()
        status = 'paid' if all(a['status'] == 'paid' for a in awards) else 'pending'
        if settlement.awards != awards or settlement.status != status:
            settlement.awards = awards
            settlement.status = status
            settlement.save(update_fields=['awards', 'status'])
    recompute_balances()


@transaction.atomic
def close_month(collection_id: str, month: str):
    key = f'{collection_id}:{month}'
    if WorldMonthSettlement.objects.filter(pk=key).exists():
        return WorldMonthSettlement.objects.get(pk=key)
    cutoff = month_cutoff(month)
    if cutoff > timezone.now():
        raise ValueError('当前月份尚未结束')
    config = current_config(cutoff)
    ranking = rank(collection_id, 'month', month, cutoff=cutoff)
    awards = []
    if config and config.enabled and config.prize_enabled:
        for index, post in enumerate(ranking[:3]):
            amount = [config.first_amount, config.second_amount, config.third_amount][index]
            awards.append({**post, 'rank': index+1, 'amount': str(amount), 'status': 'pending'})
    record, _ = WorldMonthSettlement.objects.get_or_create(pk=key, defaults={
        'collection_id': collection_id, 'collection_title': Anthology.objects.filter(pk=collection_id).values_list('title', flat=True).first() or '', 'month': month, 'cutoff': cutoff,
        'config_id': config.pk if config else '', 'ranking': ranking, 'awards': awards})
    return record


def recover_months() -> None:
    first = WorldIncomeConfig.objects.order_by('effective_at', 'id').first()
    if first is None:
        return
    start = first.effective_at
    month = (start.astimezone(SHANGHAI) if start.tzinfo else start).strftime('%Y-%m')
    now = timezone.now()
    while month_cutoff(month) <= now:
        for coll in Anthology.objects.filter(type='agent', is_valid=True).values_list('coll_id', flat=True):
            close_month(coll, month)
        month = month_cutoff(month).strftime('%Y-%m')
    reconcile_awards()
