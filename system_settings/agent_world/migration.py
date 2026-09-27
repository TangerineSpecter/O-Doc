import hashlib
import json
from django.db import transaction
from article.models import Article
from anthology.models import Anthology
from .models import WorldCategory, WorldCategoryMigration


def migration_scope(collection_id: str, old_category: str, post_id=''):
    rows = Article.objects.filter(coll_id=collection_id, is_valid=True, agent_post_category_ref__isnull=True)
    rows = rows.filter(pk=post_id) if post_id else rows.filter(agent_post_category=old_category)
    return rows.order_by('article_id')


def preview(collection_id: str, old_category: str, post_id='') -> dict:
    rows = list(migration_scope(collection_id, old_category, post_id))
    token = hashlib.sha256(json.dumps([(p.pk, p.updated_at.isoformat(), p.agent_post_category) for p in rows]).encode()).hexdigest()
    return {'token': token, 'count': len(rows), 'posts': [{'id': p.pk, 'title': p.title} for p in rows]}


@transaction.atomic
def migrate(collection_id: str, old_category: str, target_id: str, token: str, user_id: str, post_id='') -> dict:
    collection = Anthology.objects.select_for_update().filter(pk=collection_id, type='agent', is_valid=True, user_id=user_id).first()
    if collection is None:
        raise ValueError('文集权限发生变化，请刷新并重新确认')
    target = WorldCategory.objects.select_for_update().filter(pk=target_id, enabled=True).first()
    if target is None:
        raise ValueError('请选择启用的目标分类')
    rows = list(migration_scope(collection_id, old_category, post_id).select_for_update())
    scope = preview(collection_id, old_category, post_id)
    if not rows or token != scope['token']:
        raise ValueError('帖子范围发生变化，请刷新并重新确认')
    for post in rows:
        post.agent_post_category_ref = target
        post.save(update_fields=['agent_post_category_ref', 'updated_at'])
    WorldCategoryMigration.objects.create(collection_id=collection_id, old_category=old_category,
        category=target, post_ids=[p.pk for p in rows], performed_by=user_id)
    return {'count': len(rows)}
