"""Live, unjudged equipment listings shared by hourly summaries and shopping."""
from collections import Counter

from .combat.models import CombatProfile, EquipmentInstance
from .market_models import MarketListing
from .market_no_buy import _wearable, blocked_ids

SLOTS = ('weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory', 'ring_1', 'ring_2')
TYPE_NAMES = {
    'mage_staff': '法杖', 'two_handed_staff': '秘法杖', 'holy_staff': '圣杖',
    'cloth_armor': '布甲', 'leather_armor': '皮甲', 'light_armor': '轻甲',
    'heavy_armor': '重甲', 'plate_armor': '板甲', 'ring': '戒指',
    'long_sword': '长剑', 'two_handed_sword': '双手剑', 'axe': '斧',
    'bow': '弓', 'dagger': '匕首', 'instrument': '乐器',
    'generic': '通用武器', 'pendant': '吊坠', 'magic_shield': '法盾',
    'small_shield': '小盾', 'large_shield': '大盾', 'weapon': '武器',
    'offhand': '副手', 'head': '头饰', 'body': '护甲', 'hands': '手套',
    'feet': '靴子', 'accessory': '饰品',
}


def equipment_candidates(owner: str, actor_id: str, *, listing_ids=None) -> list[dict]:
    profile = CombatProfile.objects.filter(pk=actor_id, owner_id=owner).first()
    if not profile:
        return []
    job, level = profile.progression['job'], profile.progression['level']
    blocked = blocked_ids(owner, actor_id)
    listings = MarketListing.objects.filter(owner_id=owner, status='active',
        remaining_quantity__gt=0, item__source__kind='combat_equipment').exclude(seller_id=actor_id)
    if listing_ids is not None:
        listings = listings.filter(pk__in=listing_ids)
    rows = list(listings.order_by('created_at', 'pk'))
    identities = {str((row.item.get('source') or {}).get('equipment_id') or '') for row in rows}
    identities.update(profile.loadout.values())
    gears = {item.pk: item for item in EquipmentInstance.objects.filter(
        pk__in=identities, owner_id=owner, sold=False)}
    result, seen = [], set()
    for listing in rows:
        identity = str((listing.item.get('source') or {}).get('equipment_id') or '')
        gear = gears.get(identity)
        if (not gear or identity in blocked or identity in seen or gear.actor_id != listing.seller_id
                or gear.bound or gear.locked or not gear.rules):
            continue
        snapshot = gear.snapshot
        slots = [slot for slot in SLOTS if _wearable(snapshot, gear.rules, job, level, slot)]
        if not slots:
            continue
        current = {slot: gears[profile.loadout[slot]].snapshot
                   for slot in slots if profile.loadout.get(slot) in gears}
        result.append({'listing_id': listing.pk, 'version': listing.version,
            'equipment_id': identity, 'snapshot': snapshot, 'rules': gear.rules,
            'slots': slots, 'current': current, 'job': job, 'level': level,
            'name': snapshot.get('name', ''), 'price': str(listing.unit_price), 'quantity': 1})
        seen.add(identity)
    return result


def equipment_summary(candidates: list[dict]) -> list[dict]:
    """Only type/count reaches the entry question; rings count once per instance."""
    counts = Counter(row['snapshot'].get('equipment_type') or row['snapshot']['slot']
                     for row in candidates)
    return [{'type': kind, 'name': TYPE_NAMES.get(kind, kind), 'count': count}
            for kind, count in sorted(counts.items())]
