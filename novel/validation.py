import json
from rest_framework.exceptions import ValidationError
from .models import Entity, Thread


def text(value, limit=100000):
    if not isinstance(value, str) or len(value) > limit:
        raise ValidationError('文本格式或长度不正确')
    return value


def ids(value, allowed):
    if not isinstance(value, list) or len(value) > 200 or any(not isinstance(v, str) or v not in allowed for v in value):
        raise ValidationError('关联记录不存在或属于其他小说')
    return list(dict.fromkeys(value))


def json_result(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1].rsplit('```', 1)[0]
    try:
        result = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise ValidationError('AI 返回的结构不完整，请重试') from exc
    if not isinstance(result, dict):
        raise ValidationError('AI 返回的结构不完整')
    from djangorestframework_camel_case.util import underscoreize
    return underscoreize(result)


def review_result(result: dict, revision) -> dict:
    project = revision.chapter.project
    entities = set(Entity.objects.filter(project=project).values_list('pk', flat=True))
    threads = set(Thread.objects.filter(project=project).values_list('pk', flat=True))
    changes = result.get('changes', [])
    issues = result.get('issues', [])
    if not isinstance(changes, list) or len(changes) > 150 or not isinstance(issues, list) or len(issues) > 50:
        raise ValidationError('检查结果过大或不完整')
    output = []
    for i, item in enumerate(changes):
        if not isinstance(item, dict) or item.get('kind') not in ('state', 'relation', 'knowledge', 'thread', 'entity', 'event'):
            raise ValidationError('状态变化类型无效')
        quote = text(item.get('quote', ''), 2000).strip()
        if not quote or quote not in revision.content:
            raise ValidationError('状态变化缺少可定位的正文证据')
        item = dict(item, id=f'change-{i}', quote=quote, offset=revision.content.index(quote))
        item['certainty'] = item.get('certainty', 'certain')
        if item['certainty'] not in ('certain', 'suspected', 'rumor', 'misbelief', 'unknown'):
            raise ValidationError('事实确定性无效')
        item['scene_mode'] = item.get('scene_mode', 'present')
        if item['scene_mode'] not in ('present', 'flashback', 'flashforward', 'unknown'):
            raise ValidationError('场景时间类型无效')
        if item.get('time_order') is not None and type(item['time_order']) is not int:
            raise ValidationError('故事时间顺序必须是整数或未知')
        if item.get('time_order') is not None:
            from .models import Chapter
            if not Chapter.objects.filter(project=project, time_order=item['time_order']).exists():
                raise ValidationError('时间排序未经作者确认，请先补充章节故事时间')
        if 'story_time' in item:
            text(item['story_time'], 100)
        for key in ('entity_id', 'target_id', 'holder_id'):
            if item.get(key) and item[key] not in entities:
                raise ValidationError('状态变化引用了未知人物或物品')
        if item['kind'] == 'entity':
            definition = item.get('definition', {})
            if not isinstance(definition, dict) or definition.get('kind', 'person') not in Entity.KINDS:
                raise ValidationError('新实体格式不正确')
            if not text(definition.get('name', ''), 100).strip() or definition.get('importance', 'supporting') not in Entity.IMPORTANCE:
                raise ValidationError('新实体名称或重要性无效')
            item['critical'] = True
        elif item['kind'] == 'thread':
            if item.get('thread_id') not in threads or item.get('state') not in Thread.STATES:
                raise ValidationError('伏笔状态变化不正确')
            item['critical'] = item.get('state') in ('partial', 'resolved', 'abandoned')
        else:
            if item['kind'] == 'knowledge':
                item['scope'] = item.get('scope', 'character')
                if item['scope'] not in ('character', 'reader', 'author'):
                    raise ValidationError('知晓范围无效')
            if (item['kind'] in ('state', 'relation') or item['kind'] == 'knowledge' and item.get('scope') == 'character') and not item.get('entity_id'):
                raise ValidationError('状态变化缺少对象')
            if item['kind'] == 'relation' and not item.get('target_id'):
                raise ValidationError('关系缺少关联对象')
            if item['kind'] == 'state' and (item.get('field') not in ('location', 'life', 'injury', 'items', 'holder', 'motivation', 'identity', 'true_identity', 'relationship') or len(str(item.get('value'))) > 5000):
                raise ValidationError('状态字段或内容无效')
            if item['kind'] == 'state' and item.get('field') == 'holder' and item.get('value') not in (None, 'unknown') and item.get('value') not in entities:
                raise ValidationError('物品持有人不存在')
            item['critical'] = bool(item.get('critical')) or item.get('field') in ('life', 'identity', 'true_identity')
        text(item.get('description', ''), 2000)
        output.append(item)
    clean_issues = []
    for i, issue in enumerate(issues):
        if not isinstance(issue, dict):
            raise ValidationError('检查问题格式无效')
        description = text(issue.get('description', ''), 2000)
        quote = text(issue.get('quote', ''), 2000)
        if quote and quote not in revision.content:
            raise ValidationError('检查问题引用不在当前正文中')
        clean_issues.append({'id': f'issue-{i}', 'description': description, 'quote': quote,
                             'blocking': bool(issue.get('blocking')), 'kind': issue.get('kind', 'style')})
    return {'summary': text(result.get('summary', ''), 3000), 'changes': output, 'issues': clean_issues}

