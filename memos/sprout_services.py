"""Authenticated snapshot creation and idempotent article publication."""
from django.db import transaction
from rest_framework import serializers
from anthology.models import Anthology
from article.models import Article
from article.serializers import ArticleSerializer
from utils.ai_service import AIService
from .models import Memo, Sprout, SproutJob
from system_settings.models import AIModel, SystemSetting
from .sprout_rules import article_content
from learning.locking import domain_lock


def create_sprout(owner: str, data: dict, snapshots: list | None = None) -> Sprout:
    ids = data.get('memo_ids', [])
    if not isinstance(ids, list) or not 2 <= len(ids) <= 5 or any(not isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
        raise serializers.ValidationError('请选择 2～5 条不同的闪念')
    direction = data.get('direction', '')
    model_id = data.get('model_id', '')
    if not isinstance(direction, str) or len(direction) > 500 or not isinstance(model_id, str):
        raise serializers.ValidationError('方向或模型格式不正确')
    try:
        config = AIService.get_client_config_for_model(model_id)
        from .sprout_execution import resolve_tools
        tools = data.get('tools', [])
        resolve_tools(tools)
        if config.get('model_type', 'chat') != 'chat':
            raise ValueError('请选择对话模型')
    except (AIModel.DoesNotExist, SystemSetting.DoesNotExist) as exc:
        raise serializers.ValidationError('请先配置系统主模型，或选择一个已有的对话模型') from exc
    except ValueError as exc:
        raise serializers.ValidationError(str(exc)) from exc
    with domain_lock(), transaction.atomic():
        rows = {str(m.pk): m for m in Memo.objects.filter(pk__in=ids, user_id=owner, is_valid=True)}
        if snapshots is None and len(rows) != len(ids):
            raise serializers.ValidationError('有闪念不存在或不属于当前账号')
        sources = snapshots if snapshots is not None else [{'memo_id': key, 'content': rows[key].content, 'tag': rows[key].tag,
                    'creator_type': rows[key].creator_type, 'creator_id': rows[key].creator_id,
                    'creator_name': rows[key].creator_name, 'created_at': rows[key].created_at.isoformat()} for key in ids]
        row = Sprout.objects.create(owner_id=owner, sources=sources, direction=direction.strip(), model_id=str(config['model_id']))
        SproutJob.objects.create(sprout=row, tools=tools)
    from .sprout_worker import start_worker
    start_worker()
    return row


def save_article(sprout_id: str, owner: str, data: dict, request):
    with domain_lock(), transaction.atomic():
        row = Sprout.objects.select_for_update().get(pk=sprout_id, owner_id=owner)
        if row.article_id:
            article = Article.objects.filter(pk=row.article_id, author=owner, is_valid=True).first()
            if article:
                return article
            raise serializers.ValidationError('已保存文章已删除，请从回收站恢复')
        if row.status != 'ready' or row.result.get('kind') != 'article':
            raise serializers.ValidationError('当前结果不是可保存的文章')
        coll_id = data.get('coll_id')
        collection = Anthology.objects.filter(pk=coll_id, user_id=owner, is_valid=True, type='article').first()
        if not collection:
            raise serializers.ValidationError('请选择自己的文章文集')
        if data.get('content') is not None and not isinstance(data['content'], str):
            raise serializers.ValidationError('正文格式不正确')
        if data.get('parent_id') and not Article.objects.filter(pk=data['parent_id'], coll_id=coll_id, author=owner, is_valid=True).exists():
            raise serializers.ValidationError('父级文章不存在或不属于该文集')
        payload = {'coll_id': coll_id, 'title': data.get('title') or row.result['title'],
                   'permission': collection.permission, 'content': article_content(row, data.get('content')), 'tags': data.get('tags', ['灵感']),
                   'category_id': data.get('category_id') or '', 'parent_id': data.get('parent_id', ''),
                   'assets': data.get('assets', [])}
        serializer = ArticleSerializer(data=payload, context={'request': request})
        serializer.is_valid(raise_exception=True)
        article = serializer.save(author=owner)
        row.article_id = str(article.pk)
        row.save(update_fields=['article_id', 'updated_at'])
        return article
