"""Executable forge choices, including equipment usable after this route's promotions."""
import copy
from collections import Counter
from decimal import Decimal

from system_settings.models import Agent, AgentTask
from .blacksmith_catalog import MAX_PIECES, rules_for, validate_rule
from .combat.catalog import Catalog, bundled
from .combat.equipment_snapshot import rules_for as equipment_rules
from .combat.models import CombatCatalog, CombatProfile
from .crafting_materials import available_pool

TYPE_NAMES = {'generic': '通用', 'long_sword': '长剑', 'axe': '战斧', 'bow': '长弓',
    'dagger': '匕首', 'mage_staff': '单手法杖', 'two_handed_staff': '双手杖', 'holy_staff': '圣杖',
    'two_handed_sword': '双手剑', 'cloth_armor': '布甲', 'heavy_armor': '重甲',
    'leather_armor': '皮甲', 'light_armor': '轻甲', 'plate_armor': '板甲',
    'magic_shield': '魔法盾', 'small_shield': '小盾', 'large_shield': '大盾',
    'pendant': '吊坠', 'ring': '戒指'}


def validate_actor(owner: str, actor_id: str) -> None:
    from .life_config import owns_actor
    from .investment_service import validate_agents
    if not owns_actor(owner, actor_id):
        raise ValueError('居民铁匠铺属于其他账号')
    validate_agents(owner, [actor_id])
    if CombatProfile.objects.filter(pk=actor_id).exclude(owner_id=owner).exists():
        raise ValueError('居民冒险档案属于其他账号')
    for task in AgentTask.objects.filter(task_kind='blacksmith'):
        if task.blacksmith_config.get('owner_id') != owner and actor_id in (task.agent_ids or [task.agent_id]):
            raise ValueError('居民已绑定其他账号的铁匠铺任务')


def read_catalog(profile=None) -> Catalog:
    """No install/ensure on read paths, including an entirely empty database."""
    row = (CombatCatalog.objects.filter(pk=profile.catalog_id).first() if profile else
           CombatCatalog.objects.order_by('-created_at', '-id').first())
    if profile and row is None:
        raise ValueError('居民当前战斗目录缺失')
    if row is None:
        return bundled()[0]
    from .combat.store import digest
    if digest(row.tables) != row.digest:
        raise ValueError('战斗目录数据损坏')
    return Catalog(row.tables, row.pk)


def reachable_jobs(catalog: Catalog, profile) -> set[str]:
    if profile is None:
        return set()
    job = profile.progression['job']
    if job == 'job.novice':
        return {job}
    return {row['id'] for row in catalog.tables['professions']
            if row['enabled'] == '1' and job in catalog.path(row['id'])}


def template_options(catalog: Catalog, profile, rule: dict) -> list[dict]:
    jobs = reachable_jobs(catalog, profile)
    if not jobs:
        return []
    result = []
    for template in catalog.tables['equipment_templates']:
        if (template['enabled'] != '1' or template['boss_only'] == '1' or template['slot'] != rule['slot']):
            continue
        low, high = max(rule['level_min'], int(template['level_min'])), min(rule['level_max'], int(template['level_max']))
        if low > high:
            continue
        rules = equipment_rules(catalog, template['id'], {'slot': template['slot']})
        usable = {job: max(low, rules['job_levels'][job], int(catalog.row('professions', job)['required_level']))
                  for job in jobs if job in rules['job_levels']}
        usable = {job: level for job, level in usable.items() if level <= 99}
        if not usable:
            continue
        kind = template.get('equipment_type') or 'generic'
        option = {'id': template['id'], 'template_id': template['id'], 'name': template['name'],
            'equipment_type': kind, 'type_name': TYPE_NAMES.get(kind, kind),
            'level_min': low, 'level_max': high, 'wear_level': min(usable.values()),
            'job_ids': sorted(usable), 'can_equip': profile.progression['job'] in usable
                and profile.progression['level'] >= usable[profile.progression['job']]}
        result.append(option)
    return sorted(result, key=lambda row: row['template_id'])


def recipe_options(rules: dict, catalog: Catalog, profile, pool: list[dict], energy) -> dict:
    if profile is None:
        return {}
    quantities = Counter()
    for row in pool:
        quantities[row['sku']] += row['quantity']
    result = {}
    for identity, rule in rules.items():
        try:
            validate_rule(rule)
        except ValueError:
            continue
        types = template_options(catalog, profile, rule)
        if not types or Decimal(str(energy)) < rule['energy_cost']:
            continue
        maximum = min(MAX_PIECES, int(Decimal(str(energy)) // rule['energy_cost']),
                      *(quantities[row['sku']] // row['quantity'] for row in rule['ingredients']))
        if maximum:
            result[identity] = {**copy.deepcopy(rule), 'types': types, 'max_pieces': maximum}
    return result


def planning_facts(owner: str, agent: Agent, *, exclude_ids=(), exclude_action_id=None) -> dict:
    from .execution import stamina
    from .life_models import LifeProfile
    validate_actor(owner, agent.pk)
    profile = CombatProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    life = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    return {'profile': profile, 'initialized': profile is not None, 'catalog': read_catalog(profile),
        'rules': rules_for(owner), 'pool': available_pool(owner, agent.pk,
            exclude_ids=exclude_ids, exclude_action_id=exclude_action_id),
        'energy': stamina(agent), 'preferences': life.preferences if life else ''}
