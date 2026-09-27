from .models import WorldCategory


def available_categories(agent=None) -> list[dict]:
    profession = agent.profession if agent else None
    bonuses = {b.category_id: str(b.percentage) for b in profession.bonuses.all()} if profession and profession.enabled else {}
    return [{'id': c.pk, 'name': c.name, 'description': c.description,
             'profession_matched': c.pk in bonuses, 'bonus_percentage': bonuses.get(c.pk, '0')}
            for c in WorldCategory.objects.filter(enabled=True)]
