"""Visible article facts, including user interactions absent from AgentActivity."""
from django.db.models import OuterRef, Subquery
from article.models import Article, ArticlePostComment, ArticlePostRating, ArticleAnnotation, ArticleAnnotationComment


def article_events(visible, actors, start, end, activities, add):
    # Activity snapshots can recover stable authors of old posts, never by matching names.
    authors = {row.artifact_article_id: row.agent_id or row.metadata.get('agentSnapshot', {}).get('id', '')
               for row in activities if row.activity_type == 'publication'}
    activity_actors = {row.event_key: row.agent_id or row.metadata.get('agentSnapshot', {}).get('id', '') for row in activities}
    posts = Article.objects.filter(coll_id__in=visible, is_valid=True)
    for row in posts.filter(created_at__gte=start, created_at__lt=end):
        actor = row.agent_post_author_id or authors.get(row.pk, '')
        if actor in actors:
            add('publication:'+row.pk, actor, row.created_at, 'publication')
    for model, prefix, identity, name in ((ArticlePostComment, 'comment:', 'creator_id', 'creator_name'),
                                         (ArticlePostRating, 'rating:', 'rater_id', 'rater_name')):
        rows = model.objects.filter(article__coll_id__in=visible, article__is_valid=True, is_valid=True,
                                    created_at__gte=start, created_at__lt=end).select_related('article')
        for row in rows:
            key = prefix+row.pk
            sender = row.actor_agent_id or activity_actors.get(key, '')
            raw = getattr(row, identity)
            if not sender and raw.startswith('agent-id:'):
                sender = raw[9:]
            peer = row.article.agent_post_author_id or authors.get(row.article_id, '')
            if isinstance(row, ArticlePostComment) and row.reply_to_actor_id:
                peer = row.reply_to_actor_id[9:] if row.reply_to_actor_id.startswith('agent-id:') else row.reply_to_actor_id
            if sender in actors or peer in actors:
                add(key, sender or raw, row.created_at, 'social', getattr(row, name), peer,
                    row.article.agent_post_creator_name if not getattr(row, 'reply_to_actor_id', '') else '')

    def sender_id(raw, key):
        return activity_actors.get(key) or (raw[9:] if raw.startswith('agent-id:') else raw)

    annotations = ArticleAnnotation.objects.filter(article__coll_id__in=visible, article__is_valid=True,
        is_valid=True, created_at__gte=start, created_at__lt=end).select_related('article')
    for row in annotations:
        key = 'annotation:'+row.pk
        sender = sender_id(row.creator_id, key)
        peer = row.article.agent_post_author_id or authors.get(row.article_id, '') or row.article.author
        if sender in actors or peer in actors:
            add(key, sender, row.created_at, 'social', row.creator_name, peer, row.article.agent_post_creator_name)
    first_comment = ArticleAnnotationComment.objects.filter(annotation_id=OuterRef('annotation_id')).order_by('created_at', 'pk').values('pk')[:1]
    comments = ArticleAnnotationComment.objects.filter(annotation__article__coll_id__in=visible,
        annotation__article__is_valid=True, annotation__is_valid=True, is_valid=True,
        created_at__gte=start, created_at__lt=end).select_related('annotation__article').annotate(first_comment=Subquery(first_comment))
    for row in comments:
        # Creating an annotation also creates its first comment in the same transaction; that is one behavior.
        if row.pk == row.first_comment and row.creator_id == row.annotation.creator_id and 'annotation-comment:'+row.pk not in activity_actors:
            continue
        key = 'annotation-comment:'+row.pk
        sender = sender_id(row.creator_id, key)
        article = row.annotation.article
        peer = article.agent_post_author_id or authors.get(article.pk, '') or article.author
        if sender in actors or peer in actors:
            add(key, sender, row.created_at, 'social', row.creator_name, peer, article.agent_post_creator_name)
