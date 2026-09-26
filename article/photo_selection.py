"""照片 MCP 的候选筛选；只读派生结果，不新增同步字段。"""
from django.db.models import Exists, OuterRef, Q

from anthology.models import Anthology
from article.models import Image, ImageReview


def _string_list(arguments: dict, name: str) -> list[str]:
    values = arguments.get(name, [])
    if not isinstance(values, list) or any(not isinstance(value, str) or not value.strip() for value in values):
        raise ValueError(f'{name} 必须是非空字符串组成的数组')
    return list(dict.fromkeys(value.strip() for value in values))


def _photos(arguments: dict, agent):
    agent_key = str(getattr(agent, 'id', '') or '').strip()
    if not agent_key:
        raise ValueError('需要由已绑定的 Agent 获取照片')
    ids = _string_list(arguments, 'coll_ids')
    titles = _string_list(arguments, 'coll_titles')
    collections = Anthology.objects.filter(type='image', is_valid=True)
    if ids or titles:
        collections = collections.filter(Q(coll_id__in=ids) | Q(title__in=titles))
        found = list(collections.values('coll_id', 'title'))
        if set(ids) - {item['coll_id'] for item in found} or set(titles) - {item['title'] for item in found}:
            raise ValueError('指定的图片文集不存在或已删除，请检查 coll_ids / coll_titles')
        for title in titles:
            if sum(item['title'] == title for item in found) > 1:
                raise ValueError(f'图片文集名称「{title}」重复，请改用 coll_ids 指定')
    reviewed = ImageReview.objects.filter(image_id=OuterRef('image_id'), agent_key=agent_key)
    photos = Image.objects.filter(is_valid=True, coll_id__in=collections.values('coll_id')).annotate(
        reviewed_by_me=Exists(reviewed),
    )
    keyword = arguments.get('keyword', '')
    if not isinstance(keyword, str):
        raise ValueError('keyword 必须是字符串')
    if keyword.strip():
        photos = photos.filter(Q(title__icontains=keyword.strip()) | Q(description__icontains=keyword.strip()))
    return photos


def _payload(image) -> dict:
    return {
        'image_id': image.image_id, 'coll_id': image.coll_id,
        'title': image.title, 'description': image.description,
        'author': image.author, 'reviewed_by_me': image.reviewed_by_me,
    }


def list_photos(arguments: dict, agent) -> dict:
    photos = _photos(arguments, agent)
    unreviewed_only = arguments.get('unreviewed_only', False)
    if not isinstance(unreviewed_only, bool):
        raise ValueError('unreviewed_only 必须是布尔值')
    if unreviewed_only:
        photos = photos.filter(reviewed_by_me=False)
    limit = arguments.get('limit', 50)
    offset = arguments.get('offset', 0)
    if type(limit) is not int or not 1 <= limit <= 200 or type(offset) is not int or offset < 0:
        raise ValueError('limit 必须为 1 到 200 的整数，offset 必须为非负整数')
    total = photos.count()
    items = [_payload(image) for image in photos.order_by('image_id')[offset:offset + limit]]
    return {'photos': items, 'count': len(items), 'total': total, 'has_more': offset + len(items) < total}


def get_random_photo(arguments: dict, agent) -> dict:
    image = _photos(arguments, agent).filter(reviewed_by_me=False).order_by('?').first()
    if image is None:
        return {'photo': None, 'message': '指定范围内没有当前 Agent 未评价的照片，请结束本次评价任务。'}
    return {'photo': _payload(image)}
