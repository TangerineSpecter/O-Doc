"""Admission queries remain server-side. Only summaries cross the model boundary."""
from datetime import timedelta
from .life_time import local_time, storage_time
from .life_activities import INTERLEAVED_ACTIVITIES, main_items
from .life_models import LifeItem
from .life_schedule import OPEN, window
from .life_config import config_for, effective_settings, DEFAULTS, task_for
from .life_commitments import capacity
from . import life_interleaving_summaries as summaries


def available_window(owner, actor, now=None, *, exclude_item=None):
    now = local_time(now)
    settings = {**DEFAULTS, **effective_settings(config_for(owner), now)}
    left, right = window(settings, now.date())
    if now < left or now >= right:
        return 0
    rows = main_items(LifeItem.objects.filter(owner_id=owner, actor_id=actor, status__in=OPEN)).exclude(pk=exclude_item or '')
    next_item = rows.order_by('scheduled_at').first()
    if next_item:
        right = min(right, local_time(next_item.scheduled_at))
    return max(0, int((right - now).total_seconds()) - settings['min_gap_minutes'] * 60)


def legal_durations(item, durations, *, seconds=False, now=None):
    from .life_activities import is_interleaved
    if not item or not is_interleaved(item):
        return list(durations)
    from system_settings.models import Agent
    agent = Agent.objects.get(pk=item.actor_id)
    now = local_time(now)
    window_seconds = available_window(item.owner_id, agent.pk, now, exclude_item=item.pk)
    budget = capacity(item.owner_id, agent, now, exclude_item=item.pk)['energy']
    if seconds:
        from .combat.explorations import energy
        return [n for n in durations if n <= window_seconds and energy(n) <= budget]
    from .fishing.catalog import current
    rules = current(item.owner_id)
    return [n for n in durations if n * 60 <= window_seconds and ((n + 4) // 5) * rules['energy_cost'] <= budget]


def exploration_candidate(owner, agent, now, gap, resource) -> dict:
    from .combat.models import CombatProfile, CombatConfig, CombatCatalog
    from .combat.explorations import energy
    from .combat.store import current
    from .combat.catalog import bundled
    from .combat.attributes import initial, promotion_options
    profile = CombatProfile.objects.filter(pk=agent.pk).first()
    if profile and profile.owner_id != owner:
        return {}
    # Preflight must not create a profile, starter gear or install a catalog.
    version = profile.catalog_id if profile else CombatCatalog.objects.order_by('-created_at', '-id').values_list('pk', flat=True).first()
    catalog = current(version) if version else bundled()[0]
    progression = profile.progression if profile else initial()
    if promotion_options(catalog, progression) or (profile and profile.rest_until and local_time(profile.rest_until) > now):
        return {}
    if not any(row.get('enabled') == '1' and int(row['recommended_level_min']) <= progression['level'] for row in catalog.tables['dungeons']):
        return {}
    cfg = CombatConfig.objects.filter(pk=owner).first()
    used = profile.loot_progress.get('days', {}).get(now.date().isoformat(), 0) if profile else 0
    quota = (cfg.daily_minutes if cfg else 120) * 60 - used
    times = [n // 60 for n in (1800, 3600, 7200) if n <= gap and n <= quota and energy(n) <= resource['energy']]
    if not times:
        return {}
    return {'durations_minutes': times, 'remaining_minutes': quota // 60,
            'initial_adventure': profile is None,
            'opportunity': f'当前可探索，单次可选时长{times}分钟，今日剩余额度{quota // 60}分钟'}


def build(config, agent, now=None, *, item=None):
    now = local_time(now)
    gap = available_window(config.pk, agent.pk, now, exclude_item=item.pk if item else None)
    resource = capacity(config.pk, agent, now, exclude_item=item.pk if item else None)
    if not gap or not resource['projection']['safe']:
        return {}, resource, gap
    from .combat.models import CombatProfile
    if not CombatProfile.objects.filter(pk=agent.pk).exists():
        # First adventure is a system onboarding action, not a model preference.
        candidate = exploration_candidate(config.pk, agent, now, gap, resource) if task_for(config.pk, agent, 'exploration') else {}
        return ({'exploration': candidate} if candidate else {}), resource, gap
    result = {}
    for kind in INTERLEAVED_ACTIVITIES:
        task = task_for(config.pk, agent, kind)
        if not task:
            continue
        if kind in ('cooking', 'alchemy'):
            if kind == 'cooking':
                from .cooking_schedule_plan import planning_facts, recipe_options
            else:
                from .alchemy_schedule_plan import planning_facts, recipe_options
            facts = planning_facts(config.pk, agent, exclude_ids=[item.pk] if item else [])
            options = recipe_options(facts['rules'], facts['level'], facts['pool'], resource['energy'])
            if options:
                from .inventory_stock import inventory_items
                prefix = 'dish.' if kind == 'cooking' else 'elixir.'
                stock = sum(row.quantity for row in inventory_items(agent.pk, config.pk).filter(source__sku__startswith=prefix))
                result[kind] = {'craftable_recipes': len(options), 'level': facts['level'],
                                'finished_stock': stock, 'energy_allowance': resource['energy'],
                                **summaries.crafting(options, kind)}
        elif kind == 'blacksmith':
            from .blacksmith_goals import eligible, summary
            goals = summary(config.pk, agent.pk)
            opportunity = summaries.forging(goals, resource['energy'])
            if opportunity['registerable_goals'] or opportunity['craftable_equipment_now']:
                result[kind] = {'free_goal_slots': goals['free_slots'],
                    'ready_goals': goals['ready_count'],
                    'goal_progress': [{'recipe_id': row['recipe_id'],
                        'missing': [{'sku': part['sku'], 'quantity': part['missing']}
                                    for part in row['ingredients'] if part['missing']]}
                                     for row in goals['goals']],
                    'legal_goal_recipes': len(eligible(config.pk, agent.pk)),
                    'energy_allowance': resource['energy'], 'max_pieces': 3, **opportunity}
        elif kind == 'fishing':
            from .fishing.service import eligibility, durations
            from .fishing.catalog import current
            rules = current(config.pk)
            times = [n for n in durations(config.pk, now, rules)
                     if n * 60 <= gap and ((n + 4) // 5) * rules['energy_cost'] <= resource['energy']]
            if times and not eligibility(config.pk, agent, now):
                opportunity = summaries.fishing(config.pk, agent.pk, now, rules, times, resource['energy'])
                if opportunity['fishing_opportunities']:
                    result[kind] = {'durations_minutes': times, **opportunity}
        else:
            candidate = exploration_candidate(config.pk, agent, now, gap, resource)
            if candidate:
                result[kind] = candidate
    return result, resource, gap


def selection_input(config, agent, summaries, resource, gap, now):
    from django.db.models import Count
    from .life_models import LifeProfile, LifeGoal
    profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=config.pk).first()
    counts = dict(LifeItem.objects.filter(owner_id=config.pk, actor_id=agent.pk,
        activity__in=INTERLEAVED_ACTIVITIES, status='completed',
        scheduled_at__gte=storage_time(now - timedelta(days=7))).values('activity').annotate(total=Count('pk')).values_list('activity', 'total'))
    from .inventory_stock import inventory_items
    from .life_interleaving_summaries import forging_needs
    needs = forging_needs(config.pk, agent.pk, can_explore='exploration' in summaries)
    for goal in LifeGoal.objects.filter(owner_id=config.pk, actor_id=agent.pk, status='active'):
        condition = goal.condition
        sku = condition.get('sku', '')
        if condition.get('kind') == 'inventory' and sku.startswith(('dish.', 'elixir.', 'bait.')):
            owned = sum(inventory_items(agent.pk, config.pk).filter(source__sku=sku).values_list('quantity', flat=True))
            needs.append({'sku': sku, 'missing_quantity': max(0, int(condition.get('quantity', 1)) - owned)})
        elif condition.get('kind') == 'subjective' and condition.get('activity') in summaries:
            needs.append({'activity': condition['activity'], 'goal': goal.title})
    return {'time': now.isoformat(), 'gap_seconds': gap, 'energy_allowance': resource['energy'],
            'decision_context': '选择现在想做的一种活动，或暂不活动。activities是此刻已通过系统预检的真实机会，每次新决策重新读取；数量变化体现库存消耗、产出及资源保护。energy_allowance是保护后续承诺后可用于本次活动的体力。优先参考当前可做事项、需求和偏好，近期次数仅作参考；没有明确需求不代表必须休息。数量不构成强制选择或固定权重，仍可暂不活动。',
            'preferences': profile.preferences if profile else '', 'needs': needs,
            'personality': (agent.role_profile or {}).get('personality', ''),
            'recent_completed_7_days': counts, 'activities': summaries}
