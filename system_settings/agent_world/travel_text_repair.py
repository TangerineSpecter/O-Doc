"""历史旅行文字修复：只更改展示文本，保留引用、金额及执行事实。"""
import copy
import hashlib

from article.models import Article
from system_settings.models import AgentLongTermMemory
from .travel_language import normalize_generated_text, simplified_text
from .travel_models import AgentInventoryItem, TravelNode


def repair_snapshot(snapshot: dict) -> dict:
    result = copy.deepcopy(snapshot)
    for key in ('plan', 'goods', 'visits', 'encounters', 'food', 'shopping', 'selection', 'draft'):
        if isinstance(result.get(key), (dict, list)):
            result[key] = normalize_generated_text({'value': result[key]})['value']
    for preview in result.get('previews', []):
        if isinstance(preview.get('feature'), str):
            preview['feature'] = simplified_text(preview['feature'])
    if isinstance(result.get('skip_reason'), str):
        result['skip_reason'] = simplified_text(result['skip_reason'])
    # 不递归转换整个快照：sources、配置、角色提示及付费生图请求需保留原样。
    return result


def changes_for_journey(journey, *, lock: bool = False) -> list[tuple]:
    changes = []

    def add(row, values):
        changed = {key: value for key, value in values.items() if value != getattr(row, key)}
        if changed:
            changes.append((row, changed))

    def rows(model, **filters):
        query = model.objects.filter(**filters)
        return query.select_for_update() if lock else query

    state = repair_snapshot(journey.snapshot)
    for node in rows(TravelNode, journey_id=journey.pk):
        add(node, {'result': normalize_generated_text(node.result)})
    for item in rows(AgentInventoryItem, source__journey_id=journey.pk, kind='souvenir'):
        source = copy.deepcopy(item.source)
        if isinstance(source.get('description'), str):
            source['description'] = simplified_text(source['description'])
        add(item, {'name': simplified_text(item.name), 'source': source})
    for memory in rows(AgentLongTermMemory, metadata__source='travel', metadata__journey_id=journey.pk):
        add(memory, {'title': simplified_text(memory.title), 'content': simplified_text(memory.content)})
    for article in rows(Article, pk=journey.article_id, is_valid=True,
                        author=journey.owner_id, agent_post_author_id=journey.actor_id):
        content = simplified_text(article.content)
        add(article, {'title': simplified_text(article.title), 'content': content,
                      'post_summary': simplified_text(article.post_summary)})
        old_hash = hashlib.sha256(article.content.encode()).hexdigest()
        if content != article.content and state.get('published_content_hash') == old_hash:
            # 只移动原本有效的补图校验基线；人工编辑冲突仍保持冲突。
            state['published_content_hash'] = hashlib.sha256(content.encode()).hexdigest()
    add(journey, {'snapshot': state})
    return changes
