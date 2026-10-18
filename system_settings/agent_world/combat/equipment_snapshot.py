"""Self-contained wearing permissions; historical templates are read only when sealing."""
from copy import deepcopy
from math import isfinite


def rules_for(catalog, template_id: str, snapshot: dict, *, bound: bool = False) -> dict:
    from .equipment import allowed, eligibility_template_id
    template_id = eligibility_template_id(catalog, template_id, snapshot, bound=bound)
    cache = getattr(catalog, '_snapshot_rules', None)
    if cache is None:
        cache = catalog._snapshot_rules = {}
    if template_id not in cache:
        template = catalog.row('equipment_templates', template_id)
        mastery = set(template.get('required_mastery', '').split(';')) - {''}
        thresholds = sorted({1, *(int(skill['learn_level']) for skill in catalog.tables['skills'] if skill['id'] in mastery)})
        levels = {}
        for job in catalog.tables['professions']:
            for level in thresholds:
                if allowed(catalog, template_id, job['id'], level, 1):
                    levels[job['id']] = level
                    break
        cache[template_id] = {'version': 1, 'slot': template['slot'],
            'equipment_type': template.get('equipment_type', ''), 'grip': template.get('grip', ''),
            'job_levels': levels}
    rules = deepcopy(cache[template_id])
    rules['slot'] = snapshot['slot']
    rules['equipment_type'] = snapshot.get('equipment_type') or rules['equipment_type']
    rules['grip'] = snapshot.get('grip') or rules['grip']
    return rules


def validate(snapshot: dict, rules: dict) -> None:
    if (not isinstance(snapshot, dict) or type(snapshot.get('level')) is not int or not 1 <= snapshot['level'] <= 99 or
            not isinstance(snapshot.get('stats'), dict) or any(type(value) not in (int, float) or not isfinite(value)
                                                              for value in snapshot['stats'].values())):
        raise ValueError('装备属性快照无效')
    if (not isinstance(rules, dict) or rules.get('version') != 1 or rules.get('slot') != snapshot.get('slot') or
            rules.get('slot') not in {'weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory'} or
            not isinstance(rules.get('equipment_type'), str) or not isinstance(rules.get('grip'), str) or
            not isinstance(rules.get('job_levels'), dict) or any(not isinstance(job, str) or
                type(level) is not int or not 1 <= level <= 99 for job, level in rules['job_levels'].items())):
        raise ValueError('装备穿戴条件快照无效')


def slot_matches(snapshot: dict, rules: dict, slot: str) -> bool:
    if slot in {'ring_1', 'ring_2'}:
        return rules['slot'] == 'accessory' and rules['equipment_type'] == 'ring'
    if slot == 'accessory':
        return rules['slot'] == 'accessory' and rules['equipment_type'] != 'ring'
    return rules['slot'] == slot


def permitted(snapshot: dict, rules: dict, job: str, level: int) -> bool:
    return snapshot['level'] <= level and job in rules['job_levels'] and level >= rules['job_levels'][job]
