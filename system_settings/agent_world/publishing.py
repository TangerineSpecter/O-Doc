"""MCP 与系统工作流共用发帖领域服务。调用者须校验自己的授权范围。"""
import re
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from anthology.models import Anthology
from article.models import Article
from utils.source_urls import normalize_source_url


def _build_summary(content, summary=''):
    summary = str(summary or '').strip()
    return summary[:300] if summary else ' '.join(str(content).translate(str.maketrans({'#':' ', '*':' ', '`':' ', '>':' '})).split())[:140]

def _refresh_anthology(coll_id):
    collection = Anthology.objects.filter(pk=coll_id, is_valid=True).first()
    if collection:
        collection.update_stats()

def _summary_source(content):
    return re.sub(r'!\[[^\]]*\]\(odoc-illustration:[^)]+\)', ' ', content or '')


def _argument_flag(value):
    return value if isinstance(value, bool) else isinstance(value, str) and value.strip().lower() in {'1', 'true', 'yes'}


def publish_post(arguments: dict, *, identity: dict, agent=None, illustration_enabled=False):
    source_url = normalize_source_url(arguments.get('source_url') or '', required=False) or None
    title = str(arguments.get('title') or '').strip()
    content = str(arguments.get('content') or '')
    coll_id = str(arguments.get('coll_id') or '').strip()
    if not title:
        raise ValueError('title 不能为空')
    if not content.strip():
        raise ValueError('content 不能为空')
    anthology = get_object_or_404(Anthology, coll_id=coll_id, type='agent', is_valid=True)
    from system_settings.agent_world.models import WorldCategory
    category_ref = WorldCategory.objects.filter(pk=arguments.get('category_id'), enabled=True).first()
    if category_ref is None:
        raise ValueError('请先调用 list_agent_post_categories，选择启用分类的 category_id')
    category = category_ref.name
    permission = arguments.get('permission') or 'public'
    if permission not in {'public', 'private'}:
        raise ValueError('permission 只能是 public 或 private')
    try:
        rating = int(arguments.get('rating') or 0)
    except (TypeError, ValueError):
        raise ValueError('rating 必须是 1 到 10 的整数')
    if rating and not 1 <= rating <= 10:
        raise ValueError('rating 必须是 1 到 10 的整数')
    from system_settings.agent_world.identity import resolve_agent
    post_author = agent or resolve_agent(str(arguments.get('agent_id') or ''), identity['creator_id'])
    from prompts.agent_post_illustration import create_illustration_jobs, prepare_post_illustrations

    content, illustration_specs, illustration_notes = prepare_post_illustrations(
        content=content,
        title=title,
        enabled=illustration_enabled,
        skip=_argument_flag(arguments.get('skip_illustration')),
    )
    if not content.strip():
        raise ValueError('content 不能为空')
    try:
        with transaction.atomic():
            article = Article.objects.create(
                title=title,
                content=content,
                coll_id=coll_id,
                author=anthology.user_id,
                permission=permission,
                sort=int(arguments.get('sort') or 0),
                source_url=source_url,
                post_summary=_build_summary(_summary_source(content), arguments.get('summary')),
                agent_post_creator_id=identity['creator_id'],
                agent_post_creator_name=identity['creator_name'],
                agent_post_creator_avatar=identity['creator_avatar'],
                agent_post_category=category,
                agent_post_category_ref=category_ref,
                agent_post_author_id=post_author.pk if post_author else "",
                agent_post_rating=rating,
                is_rag_synced=False,
            )
            from system_settings.agent_world.income import settle
            settle(article, 'post')
            illustrations = create_illustration_jobs(
                article=article, user_id=anthology.user_id, specs=illustration_specs,
            )
            _refresh_anthology(coll_id)
    except IntegrityError:
        raise ValueError('同一文集下帖子标题已存在')
    return article, illustrations, illustration_notes
