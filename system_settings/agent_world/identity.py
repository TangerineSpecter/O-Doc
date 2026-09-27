from system_settings.models import Agent


def resolve_agent(stable_id: str = '', legacy_id: str = ''):
    if stable_id:
        return Agent.objects.filter(pk=stable_id).first()
    if not legacy_id.startswith('agent:'):
        return None
    matches = list(Agent.objects.filter(name=legacy_id[6:])[:2])
    return matches[0] if len(matches) == 1 else None


def actor_key(stable_id: str, legacy_id: str) -> str:
    if stable_id:
        return f'agent-id:{stable_id}'
    agent = resolve_agent('', legacy_id)
    return f'agent-id:{agent.pk}' if agent else legacy_id


def author(post):
    # Upgrade binds uniquely identified authors once; unresolved historical names
    # must not start receiving money when a namesake is later created or renamed.
    return resolve_agent(post.agent_post_author_id) if post.agent_post_author_id else None
