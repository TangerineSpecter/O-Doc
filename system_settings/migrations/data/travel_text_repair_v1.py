"""迁移0066的冻结规则；不得依赖当前应用模型或后续转换规则。"""
import copy
import hashlib
import re

from opencc import OpenCC

_converter = OpenCC('t2s')
_URL = re.compile(r'https?://[^\s<>\[\]()]+')
_DISPLAY_FIELDS = frozenset({
    'feature', 'name', 'description', 'reason', 'reaction', 'choice',
    'title', 'content', 'reflection', 'photo_scene',
})


def simplified_text(value: str) -> str:
    # 游记 Markdown 中的引用链接可能包含中文路径，保持可访问地址不变。
    parts, start = [], 0
    for match in _URL.finditer(value):
        parts.extend((_converter.convert(value[start:match.start()]), match.group()))
        start = match.end()
    parts.append(_converter.convert(value[start:]))
    return ''.join(parts)


def normalize_generated_text(value: dict) -> dict:
    """只转换模型生成的展示字段，不转换 ID、URL 和证据引句。"""
    def convert(item):
        if isinstance(item, list):
            return [convert(entry) for entry in item]
        if isinstance(item, dict):
            return {
                key: simplified_text(entry) if key in _DISPLAY_FIELDS and isinstance(entry, str)
                else convert(entry)
                for key, entry in item.items()
            }
        return item

    return convert(value)


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


def changes_for_journey(journey, apps, alias) -> list[tuple]:
    Article = apps.get_model('article', 'Article')
    AgentLongTermMemory = apps.get_model('system_settings', 'AgentLongTermMemory')
    AgentInventoryItem = apps.get_model('system_settings', 'AgentInventoryItem')
    TravelNode = apps.get_model('system_settings', 'TravelNode')
    changes = []

    def add(row, values):
        changed = {key: value for key, value in values.items() if value != getattr(row, key)}
        if changed:
            changes.append((row, changed))

    def rows(model, **filters):
        query = model.objects.using(alias).filter(**filters)
        return query.select_for_update()

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
