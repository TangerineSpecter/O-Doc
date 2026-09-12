from django.utils import timezone

from article.models import Article, ArticleAnnotation
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
    if tool_name in {'add_agent_post_comment', 'create_article_annotation', 'add_article_annotation_comment'}:
        return '正在写下评价'
    if tool_name.startswith(('list_', 'get_', 'search_')) or 'random' in tool_name:
        return '正在查找和阅读资料'
    return '正在使用工具处理资料'


def _article_snapshot(article_id):
    article = Article.objects.filter(article_id=article_id, is_valid=True).first()
    if not article:
        return None
    return {
        'article_id': article.article_id,
        'coll_id': article.coll_id,
        'title': article.title,
    }


def record_tool_activity(record, agent, tool_name, result, sequence):
    """Persist only user-facing successful tool outcomes, never raw arguments."""
    payload = result if isinstance(result, dict) else {}
    activity = None

    if tool_name == 'create_agent_post':
        post = payload.get('post') if isinstance(payload.get('post'), dict) else {}
        article_id = str(post.get('article_id') or '')
        snapshot = _article_snapshot(article_id)
        if snapshot:
            activity = AgentActivity.objects.get_or_create(
                event_key=f'run:{record.id}:agent:{agent.id}:tool:{sequence}',
                defaults={
                    'activity_type': 'publication',
                    'status': 'success',
                    'agent': agent,
                    'run_record': record,
                    'title': f'{_agent_name(agent)}发布了《{snapshot["title"]}》'[:180],
                    'summary': str(post.get('post_summary') or '')[:1200],
                    'current_action': '发布了新作品',
                    'artifact_kind': 'agentPost',
                    'artifact_id': article_id,
                    'artifact_article_id': article_id,
                    'artifact_coll_id': snapshot['coll_id'],
                    'artifact_title': snapshot['title'],
                    'occurred_at': timezone.now(),
                },
            )[0]

    elif tool_name == 'add_agent_post_comment':
        comment = payload.get('comment') if isinstance(payload.get('comment'), dict) else {}
        article_id = str(comment.get('article_id') or '')
        snapshot = _article_snapshot(article_id)
        if snapshot:
            activity = AgentActivity.objects.get_or_create(
                event_key=f'run:{record.id}:agent:{agent.id}:tool:{sequence}',
                defaults={
                    'activity_type': 'interaction',
                    'status': 'success',
                    'agent': agent,
                    'run_record': record,
                    'title': f'{_agent_name(agent)}评价了《{snapshot["title"]}》'[:180],
                    'summary': str(comment.get('content') or '')[:1200],
                    'current_action': '发表了评论',
                    'artifact_kind': 'articleComment',
                    'artifact_id': str(comment.get('comment_id') or ''),
                    'artifact_article_id': article_id,
                    'artifact_coll_id': snapshot['coll_id'],
                    'artifact_title': snapshot['title'],
                    'occurred_at': timezone.now(),
                },
            )[0]

    elif tool_name == 'create_article_annotation':
        annotation = payload.get('annotation') if isinstance(payload.get('annotation'), dict) else {}
        article_id = str(annotation.get('article_id') or '')
        snapshot = _article_snapshot(article_id)
        comments = annotation.get('comments') if isinstance(annotation.get('comments'), list) else []
        comment = comments[0] if comments and isinstance(comments[0], dict) else {}
        if snapshot:
            activity = AgentActivity.objects.get_or_create(
                event_key=f'run:{record.id}:agent:{agent.id}:tool:{sequence}',
                defaults={
                    'activity_type': 'interaction',
                    'status': 'success',
                    'agent': agent,
                    'run_record': record,
                    'title': f'{_agent_name(agent)}批注了《{snapshot["title"]}》'[:180],
                    'summary': str(comment.get('content') or annotation.get('selected_text') or '')[:1200],
                    'current_action': '留下了文章批注',
                    'artifact_kind': 'articleAnnotation',
                    'artifact_id': str(annotation.get('annotation_id') or ''),
                    'artifact_article_id': article_id,
                    'artifact_coll_id': snapshot['coll_id'],
                    'artifact_title': snapshot['title'],
                    'occurred_at': timezone.now(),
                },
            )[0]

    elif tool_name == 'add_article_annotation_comment':
        comment = payload.get('comment') if isinstance(payload.get('comment'), dict) else {}
        annotation = ArticleAnnotation.objects.filter(
            annotation_id=comment.get('annotation_id'),
            is_valid=True,
        ).select_related('article').first()
        if annotation:
            activity = AgentActivity.objects.get_or_create(
                event_key=f'run:{record.id}:agent:{agent.id}:tool:{sequence}',
                defaults={
                    'activity_type': 'interaction',
                    'status': 'success',
                    'agent': agent,
                    'run_record': record,
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
            )[0]
    return activity
