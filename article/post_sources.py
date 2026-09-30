"""从已发布快照读取采用的来源标题，不暴露检索上下文或角色资料。"""
from system_settings.models import WorldAction


def post_sources(article):
    if not article.agent_post_creator_id:
        return []
    snapshot = WorldAction.objects.filter(
        status='success', result__post_id=article.pk,
        snapshot__config__owner_id=article.author,
    ).order_by('-created_at', '-pk').values_list('snapshot', flat=True).first()
    if not isinstance(snapshot, dict):
        return []
    draft = snapshot.get('draft') or {}
    if not isinstance(draft, dict):
        return []
    adopted = draft.get('source_urls') or []
    materials = snapshot.get('materials') or []
    if not isinstance(adopted, list) or not isinstance(materials, list):
        return []
    titles = {material['url']: str(material.get('title') or '')[:500]
              for material in materials if isinstance(material, dict) and isinstance(material.get('url'), str)}
    return [{'url': url, 'title': titles.get(url, '')}
            for url in adopted if isinstance(url, str) and url in titles]
