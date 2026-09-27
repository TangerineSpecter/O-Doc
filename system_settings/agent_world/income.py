from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import Sum
from system_settings.models import Agent
from .models import WorldIncomeConfig, WorldIncomeEvent, WorldLedger
from .identity import author, actor_key


def current_config(at=None):
    rows = WorldIncomeConfig.objects.all()
    if at is not None:
        rows = rows.filter(effective_at__lt=at)
    return rows.first()


def recompute_balances() -> None:
    for agent in Agent.objects.all():
        amount = WorldLedger.objects.filter(agent_id=agent.pk).aggregate(total=Sum('amount'))['total']
        if amount is not None:
            Agent.objects.filter(pk=agent.pk).update(money=amount)


def ensure_opening(agent) -> None:
    WorldLedger.objects.get_or_create(pk=f'opening:{agent.pk}', defaults={
        'agent_id': agent.pk, 'agent_name': agent.name, 'kind': 'opening', 'amount': agent.money,
    })


@transaction.atomic
def settle(post, kind: str, commenter=None) -> None:
    recipient = author(post)
    actor = actor_key(commenter.actor_agent_id, commenter.creator_id) if commenter else ''
    key = f'post:{post.pk}' if kind == 'post' else f'comment:{post.pk}:{actor}'
    if WorldIncomeEvent.objects.filter(pk=key).exists():
        return
    config = current_config()
    snapshot = {'post_id': post.pk, 'post_title': post.title, 'actor': actor, 'category_id': post.agent_post_category_ref_id,
                'config_id': config.pk if config else None,
                'category_name': post.agent_post_category_ref.name if post.agent_post_category_ref_id else post.agent_post_category}
    status = 'credited'
    if recipient is None:
        status = 'unresolved_author'
    elif commenter and actor == actor_key(recipient.pk, post.agent_post_creator_id):
        status = 'self_comment'
    elif not config or not config.enabled:
        status = 'disabled'
    elif not post.agent_post_category_ref_id:
        status = 'unmapped_category'
    event, created = WorldIncomeEvent.objects.get_or_create(pk=key, defaults={'status': status, 'snapshot': snapshot})
    if not created or status != 'credited':
        return
    recipient = Agent.objects.select_for_update().get(pk=recipient.pk)
    ensure_opening(recipient)
    bonus = Decimal(0)
    profession = recipient.profession
    if profession and profession.enabled:
        mapping = profession.bonuses.filter(category_id=post.agent_post_category_ref_id).first()
        if mapping:
            bonus = mapping.percentage
    base = config.post_amount if kind == 'post' else config.comment_amount
    amount = (base * (1 + bonus / 100)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    snapshot.update({'profession_id': profession.pk if profession else None, 'profession_name': profession.name if profession else '', 'percentage': str(bonus),
                     'base_amount': str(base), 'bonus_amount': str(amount-base), 'amount': str(amount)})
    WorldLedger.objects.create(pk=key, agent_id=recipient.pk, agent_name=recipient.name,
                               kind=kind, amount=amount, snapshot=snapshot)
    event.snapshot = snapshot
    event.save(update_fields=['snapshot'])
    recipient.money = WorldLedger.objects.filter(agent_id=recipient.pk).aggregate(total=Sum('amount'))['total']
    recipient.save(update_fields=['money'])
