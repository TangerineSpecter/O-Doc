"""Checkpoint reward inputs and rolls, then grant each place atomically."""
import random
from django.db import transaction
from system_settings.models import Agent
from .combat.models import CombatProfile, EquipmentInstance
from .combat.store import current
from .combat.equipment import generate
from .combat.equipment_snapshot import slot_matches, rules_for
from .combat.facts import append
from .farm_gate import guarded, farm_gate
from .inventory_stock import add_stock
from .alchemy_catalog import catalog_for, rules_for as alchemy_rules
from .life_time import local_time, storage_time
from .tournament_models import TournamentReward
from .tournament_service import active_ids
from .tournament_rules import SLOTS, POTION_POOL, key
from .tournament_decision import pick_slot


def templates(catalog, level: int) -> dict[str, list[str]]:
    result = {}
    for template in catalog.tables['equipment_templates']:
        if template['enabled'] != '1' or not int(template['level_min']) <= level <= int(template['level_max']):
            continue
        for slot in SLOTS:
            if slot_matches(template, template, slot):
                result.setdefault(slot, []).append(template['id'])
    return {slot: sorted(values) for slot, values in result.items()}


@guarded
@transaction.atomic
def prepare(identity: str, check=lambda: None) -> TournamentReward:
    check()
    reward = TournamentReward.objects.select_for_update().select_related('tournament').get(pk=identity)
    if reward.status != 'pending' or reward.plan:
        return reward
    if reward.actor_id not in active_ids(reward.owner_id, [reward.actor_id]):
        reward.status = 'forfeited'
        reward.save(update_fields=['status'])
        return reward
    profile = CombatProfile.objects.select_for_update().get(pk=reward.actor_id, owner_id=reward.owner_id)
    seed = key(reward.tournament.seed, reward.pk)
    rng = random.Random(seed)
    if reward.place == 3:
        rules = alchemy_rules(reward.owner_id)
        reward.plan = {'potions': [{'recipe_id': recipe, 'name': rules[recipe]['name'],
                                  'price': rules[recipe]['sale_price'], 'stars': 1, 'quantity': 1}
                                 for recipe in (rng.choice(POTION_POOL) for _ in range(3))]}
    else:
        catalog = current(profile.catalog_id)
        level = rng.randint(max(1, profile.progression['level'] - 5), min(99, profile.progression['level'] + 5))
        candidates = templates(catalog, level)
        if not candidates:
            raise ValueError('奖励等级没有可生成的装备')
        gear = {item.pk: item for item in EquipmentInstance.objects.filter(
            pk__in=profile.loadout.values(), actor_id=profile.pk, owner_id=reward.owner_id, sold=False)}
        reward.plan = {'level': level, 'actor_level': profile.progression['level'], 'catalog_id': catalog.version, 'quality': 'gold' if reward.place == 1 else 'blue',
            'slots': sorted(candidates), 'templates': candidates,
            'wearing': [{'slot': slot, 'quality': gear[profile.loadout[slot]].snapshot['quality']
                        if slot in profile.loadout and profile.loadout[slot] in gear else 'empty'} for slot in SLOTS]}
    reward.save(update_fields=['plan'])
    return reward


def roll(identity: str, check=lambda: None) -> None:
    reward = prepare(identity, check)
    if reward.status != 'pending' or reward.result:
        return
    seed = key(reward.tournament.seed, reward.pk)
    if reward.place == 3:
        result = {'potions': reward.plan['potions'], 'source': 'code_random'}
    else:
        agent = Agent.objects.filter(pk=reward.actor_id, archived_at__isnull=True).first()
        if not agent:
            return
        selection = pick_slot(reward.owner_id, agent, reward.plan, reward.pk, seed)
        rng = random.Random(key(seed, 'equipment'))
        catalog = current(reward.plan['catalog_id'])
        template_id = rng.choice(reward.plan['templates'][selection['slot']])
        item = generate(catalog, template_id, reward.plan['level'], reward.plan['quality'], rng)
        result = {**selection, 'equipment_id': key(reward.pk, 'equipment'), 'item': item,
                  'rules': rules_for(catalog, template_id, item), 'catalog_id': catalog.version}
    with farm_gate(), transaction.atomic():
        check()
        locked = TournamentReward.objects.select_for_update().get(pk=identity)
        if locked.status == 'pending' and not locked.result:
            locked.result, locked.status = result, 'rolled'
            locked.save(update_fields=['result', 'status'])


@guarded
@transaction.atomic
def grant(identity: str, check=lambda: None, now=None) -> None:
    check()
    reward = TournamentReward.objects.select_for_update().get(pk=identity)
    if reward.status != 'rolled':
        return
    if reward.actor_id not in active_ids(reward.owner_id, [reward.actor_id]):
        reward.status = 'forfeited'
        reward.save(update_fields=['status'])
        return
    profile = CombatProfile.objects.select_for_update().get(pk=reward.actor_id, owner_id=reward.owner_id)
    if reward.place in (1, 2):
        value = reward.result
        item = value['item']
        EquipmentInstance.objects.create(pk=value['equipment_id'], owner_id=reward.owner_id,
            actor_id=reward.actor_id, catalog_id=value['catalog_id'], template_id=item['template_id'],
            snapshot=item, rules=value['rules'], value=item['value'], bound=False)
        append(profile, 'tournament:' + reward.pk, 'tournament_reward', {
            'reward_id': reward.pk, 'tournament_id': reward.tournament_id, 'equipment_id': value['equipment_id']})
    else:
        catalog_for(reward.owner_id)
        for potion in reward.result['potions']:
            add_stock(profile.pk, reward.owner_id, profile.actor_name, 'elixir.' + potion['recipe_id'], 1,
                      potion['name'], 'elixir', potion['price'], reward.pk, stars=1)
    reward.status, reward.granted_at = 'granted', storage_time(local_time(now))
    reward.save(update_fields=['status', 'granted_at'])
    if reward.place == 3:
        from .alchemy_sync import checkpoint
        checkpoint(reward.owner_id)
