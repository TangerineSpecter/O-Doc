"""Small purpose-specific model inputs, derived from rules and immutable consumption facts."""
from datetime import timedelta
from django.utils import timezone
from .inventory_policy import purposes


def facts(owner: str, actor: str, sku: str) -> dict:
    from .inventory_stock import inventory_items
    inventory = list(inventory_items(actor, owner))
    result = {'purposes': {}, 'recent_consumption': 0, 'finished_stock': {}}
    for purpose in purposes(sku):
        unit, recipes = 0, []
        if purpose in ('alchemy', 'cooking'):
            if purpose == 'alchemy':
                from .alchemy_catalog import rules_for, skill_progress
                from .alchemy_models import AlchemyOperation as Operation, AlchemySkill as Skill
                prefix = 'elixir.'
            else:
                from .cooking_catalog import rules_for, skill_progress
                from .cooking_models import CookingOperation as Operation, CookingSkill as Skill
                prefix = 'dish.'
            skill = Skill.objects.filter(pk=actor, owner_id=owner).first()
            level = skill_progress(skill.experience if skill else 0)['level']
            for key, rule in rules_for(owner).items():
                count = next((r['quantity'] for r in rule['ingredients'] if r['sku'] == sku), 0)
                if count:
                    unit = max(unit, count)
                    recipes.append({'id': key, 'name': rule['name'], 'quantity': count,
                                    'required_level': rule['required_level'], 'unlocked': level >= rule['required_level']})
                    result['finished_stock'][key] = sum(r.quantity for r in inventory
                                                        if (r.source or {}).get('sku') == prefix + key)
            for operation in Operation.objects.filter(owner_id=owner, actor_id=actor,
                    created_at__gte=timezone.now() - timedelta(days=7)).only('snapshot'):
                result['recent_consumption'] += sum(r['quantity'] for r in operation.snapshot.get('materials', []) if r['sku'] == sku)
            result['level'] = level
        result['purposes'][purpose] = {'unit': unit, 'recipes': recipes}
    return result
