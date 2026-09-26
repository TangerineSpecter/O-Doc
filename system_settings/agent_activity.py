from django.utils import timezone

from article.models import Article, ArticleAnnotation
from system_settings.agent_relation import (
    agent_creator_id,
    agent_from_creator_id,
    refresh_creativity,
    refresh_pair,
    stance_for_rating,
)
from system_settings.models import AgentActivity


def _agent_name(agent):
    return getattr(agent, 'name', '') or 'Agent'


def create_work_activity(record, agent):
    activity, _ = AgentActivity.objects.update_or_create(
        event_key=f'run:{record.id}:agent:{agent.id}',
        defaults={
            'activity_type': 'work',
            'status': 'running',
            'agent': agent,
            'run_record': record,
            'title': f'{_agent_name(agent)}开始了「{record.task_name}」'[:180],
            'summary': '任务正在执行中',
            'current_action': '正在准备任务',
            'occurred_at': record.started_at,
        },
    )
    return activity


def update_work_activity(record, agent, *, status=None, summary=None, current_action=None, output=''):
    activity = create_work_activity(record, agent)
    update_fields = []
    if status:
        activity.status = status
        update_fields.append('status')
    if summary is not None:
        activity.summary = str(summary)[:1200]
        update_fields.append('summary')
    if current_action is not None:
        activity.current_action = str(current_action)[:180]
        update_fields.append('current_action')
    if status == 'success':
        activity.title = f'{_agent_name(agent)}完成了「{record.task_name}」'[:180]
        update_fields.append('title')
    elif status == 'failed':
        activity.title = f'{_agent_name(agent)}执行「{record.task_name}」时遇到问题'[:180]
        update_fields.append('title')
    if output:
        metadata = activity.metadata if isinstance(activity.metadata, dict) else {}
        activity.metadata = {**metadata, 'outputPreview': str(output).strip()[:300]}
        update_fields.append('metadata')
    if update_fields:
        activity.save(update_fields=[*set(update_fields), 'updated_at'])
    return activity


def friendly_tool_action(tool_name):
    if tool_name == 'create_agent_post':
        return '正在发布新作品'
    if tool_name in {'add_agent_post_comment', 'rate_agent_post', 'create_article_annotation', 'add_article_annotation_comment'}:
        return '正在写下评价'
    if tool_name.startswith(('list_', 'get_', 'search_')) or 'random' in tool_name:
        return '正在查找和阅读资料'
    return '正在使用工具处理资料'


def _save_event(event_key, defaults, *, replace=False):
    if replace:
        activity, _ = AgentActivity.objects.update_or_create(event_key=event_key, defaults=defaults)
        return activity
    activity, _ = AgentActivity.objects.get_or_create(event_key=event_key, defaults=defaults)
    return activity


def _counterpart(agent, article, *, user_author=False):
    creator_id = str(getattr(article, 'agent_post_creator_id', '') or '')
    if creator_id and creator_id != agent_creator_id(agent):
        return 'agent', creator_id, getattr(article, 'agent_post_creator_name', '') or ''
    if user_author:
        author = str(getattr(article, 'author', '') or '')
        if author:
            return 'user', author, author
    return '', '', ''


def _refresh_scores(agent, counterpart_type, counterpart_id, action):
    if action == 'publish':
        refresh_creativity(agent)
        return
    if action == 'rate':
        author = agent_from_creator_id(counterpart_id)
        refresh_creativity(author)
    if counterpart_type == 'agent':
        refresh_pair(agent, agent_from_creator_id(counterpart_id))


def record_post_publication(agent, article, summary='', run_record=None):
    activity = _save_event(
        f'post:{article.article_id}',
        {
            'activity_type': 'publication',
            'status': 'success',
            'agent': agent,
            'run_record': run_record,
            'action': 'publish',
            'title': f'{_agent_name(agent)}发布了《{article.title}》'[:180],
            'summary': str(summary or '')[:1200],
            'current_action': '发布了新作品',
            'artifact_kind': 'agentPost',
            'artifact_id': article.article_id,
            'artifact_article_id': article.article_id,
            'artifact_coll_id': article.coll_id,
            'artifact_title': article.title,
            'occurred_at': timezone.now(),
        },
    )
    _refresh_scores(agent, '', '', 'publish')
    return activity


def record_post_comment(agent, article, comment, stance, run_record=None):
    counterpart_type, counterpart_id, counterpart_name = _counterpart(agent, article)
    activity = _save_event(
        f'comment:{comment["comment_id"]}',
        {
            'activity_type': 'interaction',
            'status': 'success',
            'agent': agent,
            'run_record': run_record,
            'action': 'comment',
            'stance': stance,
            'counterpart_type': counterpart_type,
            'counterpart_id': counterpart_id,
            'counterpart_name': counterpart_name,
            'score_delta_basis': stance,
            'title': f'{_agent_name(agent)}评价了《{article.title}》'[:180],
            'summary': str(comment.get('content') or '')[:1200],
            'current_action': '发表了评论',
            'artifact_kind': 'articleComment',
            'artifact_id': comment['comment_id'],
            'artifact_article_id': article.article_id,
            'artifact_coll_id': article.coll_id,
            'artifact_title': article.title,
            'occurred_at': timezone.now(),
        },
    )
    _refresh_scores(agent, counterpart_type, counterpart_id, 'comment')
    return activity


def record_post_rating(agent, article, rating_id, rating, run_record=None):
    counterpart_type, counterpart_id, counterpart_name = _counterpart(agent, article)
    stance = stance_for_rating(rating)
    activity = _save_event(
        f'rating:{rating_id}',
        {
            'activity_type': 'interaction',
            'status': 'success',
            'agent': agent,
            'run_record': run_record,
            'action': 'rate',
            'stance': stance,
            'counterpart_type': counterpart_type,
            'counterpart_id': counterpart_id,
            'counterpart_name': counterpart_name,
            'score_delta_basis': str(rating),
            'title': f'{_agent_name(agent)}给《{article.title}》打了 {rating} 分'[:180],
            'summary': '',
            'current_action': '给出了评分',
            'artifact_kind': 'agentPost',
            'artifact_id': article.article_id,
            'artifact_article_id': article.article_id,
            'artifact_coll_id': article.coll_id,
            'artifact_title': article.title,
            'occurred_at': timezone.now(),
        },
        replace=True,
    )
    _refresh_scores(agent, counterpart_type, counterpart_id, 'rate')
    return activity


def record_tool_activity(record, agent, tool_name, result, sequence):
    """Persist only user-facing successful tool outcomes, never raw arguments."""
    payload = result if isinstance(result, dict) else {}
    activity = None

    if tool_name == 'create_agent_post':
        post = payload.get('post') if isinstance(payload.get('post'), dict) else {}
        article = Article.objects.filter(article_id=str(post.get('article_id') or ''), is_valid=True).first()
        if article:
            activity = record_post_publication(agent, article, post.get('post_summary') or '', record)

    elif tool_name == 'add_agent_post_comment':
        comment = payload.get('comment') if isinstance(payload.get('comment'), dict) else {}
        article = Article.objects.filter(article_id=str(comment.get('article_id') or ''), is_valid=True).first()
        if article and comment.get('comment_id'):
            activity = record_post_comment(agent, article, comment, comment.get('stance') or 'neutral', record)

    elif tool_name == 'rate_agent_post':
        article = Article.objects.filter(article_id=str((payload.get('post') or {}).get('article_id') or ''), is_valid=True).first()
        if article and payload.get('rating_id'):
            activity = record_post_rating(agent, article, payload['rating_id'], payload.get('my_rating'), record)

    elif tool_name == 'create_article_annotation':
        annotation = payload.get('annotation') if isinstance(payload.get('annotation'), dict) else {}
        article = Article.objects.filter(article_id=str(annotation.get('article_id') or ''), is_valid=True).first()
        comments = annotation.get('comments') if isinstance(annotation.get('comments'), list) else []
        comment = comments[0] if comments and isinstance(comments[0], dict) else {}
        annotation_id = str(annotation.get('annotation_id') or '')
        if article and annotation_id:
            counterpart_type, counterpart_id, counterpart_name = _counterpart(agent, article, user_author=True)
            activity = _save_event(
                f'annotation:{annotation_id}',
                {
                    'activity_type': 'interaction',
                    'status': 'success',
                    'agent': agent,
                    'run_record': record,
                    'action': 'annotate',
                    'counterpart_type': counterpart_type,
                    'counterpart_id': counterpart_id,
                    'counterpart_name': counterpart_name,
                    'title': f'{_agent_name(agent)}批注了《{article.title}》'[:180],
                    'summary': str(comment.get('content') or annotation.get('selected_text') or '')[:1200],
                    'current_action': '留下了文章批注',
                    'artifact_kind': 'articleAnnotation',
                    'artifact_id': annotation_id,
                    'artifact_article_id': article.article_id,
                    'artifact_coll_id': article.coll_id,
                    'artifact_title': article.title,
                    'occurred_at': timezone.now(),
                },
            )

    elif tool_name == 'add_article_annotation_comment':
        comment = payload.get('comment') if isinstance(payload.get('comment'), dict) else {}
        annotation = ArticleAnnotation.objects.filter(
            annotation_id=comment.get('annotation_id'),
            is_valid=True,
        ).select_related('article').first()
        comment_id = str(comment.get('comment_id') or '')
        if annotation and comment_id:
            counterpart_type, counterpart_id, counterpart_name = _counterpart(agent, annotation.article, user_author=True)
            activity = _save_event(
                f'annotation-comment:{comment_id}',
                {
                    'activity_type': 'interaction',
                    'status': 'success',
                    'agent': agent,
                    'run_record': record,
                    'action': 'annotate_reply',
                    'counterpart_type': counterpart_type,
                    'counterpart_id': counterpart_id,
                    'counterpart_name': counterpart_name,
                    'title': f'{_agent_name(agent)}继续讨论《{annotation.article.title}》'[:180],
                    'summary': str(comment.get('content') or '')[:1200],
                    'current_action': '追加了评论',
                    'artifact_kind': 'articleAnnotation',
                    'artifact_id': annotation.annotation_id,
                    'artifact_article_id': annotation.article_id,
                    'artifact_coll_id': annotation.article.coll_id,
                    'artifact_title': annotation.article.title,
                    'occurred_at': timezone.now(),
                },
            )
    return activity
