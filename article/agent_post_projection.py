"""Bounded projection of the creator professions used by article lists."""

from django.db.models import Q

from system_settings.models import Agent


def creator_profession_cache(articles):
    """Resolve stable IDs first, then legacy names, as the detail serializer does."""
    keys = {
        (str(article.agent_post_creator_id or '').replace('agent-id:', '').replace('agent:', ''),
         article.agent_post_creator_name or '')
        for article in articles
        if article.agent_post_creator_id or article.agent_post_creator_name
    }
    ids = sorted({agent_id for agent_id, _ in keys if agent_id})
    names = sorted({name for _, name in keys if name})
    by_id = {}
    by_name = {}
    # Keep each query below conservative database parameter limits.
    chunk_size = 400
    for offset in range(0, max(len(ids), len(names)), chunk_size):
        condition = Q(id__in=ids[offset:offset + chunk_size]) | Q(name__in=names[offset:offset + chunk_size])
        for agent_id, name, profession in Agent.objects.filter(condition).order_by().values_list(
            'id', 'name', 'profession__name',
        ):
            by_id[agent_id] = profession or ''
            by_name[name] = profession or ''
    return {
        (agent_id, name): by_id[agent_id] if agent_id in by_id else by_name.get(name, '')
        for agent_id, name in keys
    }
