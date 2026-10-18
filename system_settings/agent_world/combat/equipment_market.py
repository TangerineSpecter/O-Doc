"""Resident-market intents and ownership transfer for combat equipment."""
from django.db import transaction

from .facts import append
from .models import CombatFact, CombatProfile, EquipmentInstance
from .profiles import ensure, idle
from ..market_models import MarketListing


def equipment_listing_ids(owner: str) -> set[str]:
    return {
        str((row.get('item') or {}).get('source', {}).get('equipment_id'))
        for row in MarketListing.objects.filter(owner_id=owner, status='active').values('item')
        if (row.get('item') or {}).get('source', {}).get('kind') == 'combat_equipment'
        and (row.get('item') or {}).get('source', {}).get('equipment_id')
    }


def preparation_intents(actor_id: str, owner: str | None = None) -> dict[str, CombatFact]:
    """A purchase starts a new holding period, including repurchases by a former seller."""
    facts = CombatFact.objects.filter(actor_id=actor_id,
        kind__in=('gear_prepare', 'gear_trade_in')).order_by('sequence')
    if owner is not None:
        facts = facts.filter(owner_id=owner)
    intents = {}
    for fact in facts:
        payload = fact.payload or {}
        identity, action = payload.get('equipment_id'), payload.get('action')
        if not identity:
            continue
        if fact.kind == 'gear_trade_in':
            intents.pop(identity, None)
        elif action in ('sell', 'list'):
            intents[identity] = fact
    return intents


def pending_preparation_actions(owner: str, actor_id: str) -> list[dict]:
    """Return unresolved, currently executable intents for the current holding period."""
    actions = []
    listed = equipment_listing_ids(owner)
    profile = CombatProfile.objects.filter(pk=actor_id, owner_id=owner).first()
    worn = set(profile.loadout.values()) if profile else set()
    for identity, fact in sorted(preparation_intents(actor_id, owner).items(), key=lambda pair: pair[1].sequence):
        payload = fact.payload
        action = payload['action']
        item = EquipmentInstance.objects.filter(pk=identity, owner_id=owner, actor_id=actor_id, sold=False).first()
        if not item or item.bound or item.locked or identity in worn or identity in listed:
            continue
        operation_kind = 'sell_combat_equipment' if action == 'sell' else 'list_combat_equipment'
        if CombatFact.objects.filter(owner_id=owner, actor_id=actor_id, kind='trade',
                sequence__gt=fact.sequence, payload__arguments__kind=operation_kind,
                payload__arguments__equipment_id=identity).exists():
            # The transaction after this intent completes it, even after withdrawal.
            continue
        actions.append({'equipment_id': identity, 'action': action, 'item': item,
                        'fact_id': fact.pk, 'source': payload.get('decision_source', '')})
    return actions


@transaction.atomic
def transfer_listed_equipment(owner: str, seller, buyer, listing: MarketListing,
                              transaction_id: str) -> dict:
    """Move the same unique equipment instance and append both actor-chain facts."""
    listing = MarketListing.objects.select_for_update().get(pk=listing.pk, owner_id=owner)
    source = (listing.item or {}).get('source') or {}
    if (source.get('kind') != 'combat_equipment' or listing.status != 'active'
            or listing.seller_id != seller.pk or listing.remaining_quantity != 1):
        raise ValueError('装备挂牌状态无效')

    seller_profile = CombatProfile.objects.select_for_update().filter(pk=seller.pk, owner_id=owner).first()
    if not seller_profile:
        raise ValueError('卖家冒险档案不存在')
    buyer_profile = ensure(owner, buyer)
    seller_profile = CombatProfile.objects.select_for_update().get(pk=seller_profile.pk)
    buyer_profile = CombatProfile.objects.select_for_update().get(pk=buyer_profile.pk)
    idle(seller_profile)
    idle(buyer_profile)

    item = EquipmentInstance.objects.select_for_update().filter(
        pk=source.get('equipment_id'), owner_id=owner, actor_id=seller.pk, sold=False,
    ).first()
    if (not item or item.bound or item.locked or item.pk in seller_profile.loadout.values()
            or str(item.pk) != str(source.get('equipment_id'))):
        raise ValueError('挂牌装备已不可交易')
    if item.snapshot.get('name') != listing.item.get('name') or str(item.value) != str(listing.item.get('value')):
        raise ValueError('挂牌装备信息与当前装备不一致')

    snapshot = item.snapshot
    item.actor_id = buyer.pk
    item.save(update_fields=['actor_id', 'updated_at'])
    shared = {'equipment_id': item.pk, 'listing_id': listing.pk,
              'transaction_id': transaction_id, 'snapshot': snapshot, 'equipment_rules': item.rules}
    append(seller_profile, transaction_id + ':gear-out', 'gear_trade_out',
           {**shared, 'buyer_id': buyer.pk})
    append(buyer_profile, transaction_id + ':gear-in', 'gear_trade_in',
           {**shared, 'seller_id': seller.pk})
    return {'equipment_id': item.pk, 'name': snapshot.get('name', ''),
            'seller_id': seller.pk, 'buyer_id': buyer.pk, 'snapshot': snapshot}
