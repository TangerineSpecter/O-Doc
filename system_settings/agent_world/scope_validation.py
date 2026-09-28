from rest_framework import serializers

from anthology.models import Anthology
from .models import WorldCategory


def validate_scope_ids(value, *, categories=False, previous=()):
    if not isinstance(value, list) or len(value) > 500 or any(not isinstance(item, str) or not item.strip() for item in value):
        raise serializers.ValidationError('范围必须为最多500项的有效ID数组')
    ids = list(dict.fromkeys(item.strip() for item in value))
    available = set(WorldCategory.objects.filter(pk__in=ids, enabled=True).values_list('pk', flat=True)) if categories else set(
        Anthology.objects.filter(coll_id__in=ids, type='agent', is_valid=True).values_list('coll_id', flat=True))
    # 已保存失效项仍可保留，以免一次其他设置保存意外把限制改成“全部”。
    if set(ids) - available - set(previous or []):
        raise serializers.ValidationError('只能选择有效帖子文集或启用的帖子分类')
    return ids


class PostScopeValidation:
    def validate_post_collection_ids(self, value):
        return validate_scope_ids(value, previous=getattr(self.instance, 'post_collection_ids', []))

    def validate_post_category_ids(self, value):
        return validate_scope_ids(value, categories=True, previous=getattr(self.instance, 'post_category_ids', []))
