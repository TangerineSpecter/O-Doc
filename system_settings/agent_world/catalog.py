from .models import WorldCategory


def available_categories() -> list[dict]:
    return [{'id': c.pk, 'name': c.name, 'description': c.description}
            for c in WorldCategory.objects.filter(enabled=True)]


def current_profession(agent) -> dict:
    if agent is None:
        raise ValueError('查询自己的职业需要当前 Agent 上下文')
    profession = agent.profession
    if profession is None:
        return {'profession': None, 'category_bonuses': []}
    return {'profession': {'id': profession.pk, 'name': profession.name,
                           'description': profession.description, 'enabled': profession.enabled},
            'category_bonuses': [
                {'category_id': b.category_id, 'category_name': b.category.name,
                 'category_enabled': b.category.enabled, 'configured_percentage': str(b.percentage),
                 'bonus_percentage': str(b.percentage) if profession.enabled else '0'}
                for b in profession.bonuses.select_related('category').order_by('category_id')]}
