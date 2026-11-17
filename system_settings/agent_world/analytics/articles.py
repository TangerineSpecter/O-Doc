"""Visible article facts and the activity identities used by legacy records."""
from django.db.models import OuterRef, Subquery
from article.models import Article, ArticlePostComment, ArticlePostRating, ArticleAnnotation, ArticleAnnotationComment


def resolve_article(row, authors, activity_actors, actors):
    key, category, sender, peer, name, peer_name, article_id, lookup_sender, first_comment = row
    if first_comment and key not in activity_actors:
        return
    if category == 'publication':
        sender = sender or authors.get(article_id, '')
    else:
        if lookup_sender:
            sender = activity_actors.get(key) or sender
        if article_id:
            peer = authors.get(article_id) or peer
    if sender in actors or peer in actors:
        return key, sender, category, name, peer, peer_name


def article_events(visible, actors, start, end, activities, add, archive=None):
    # Later mirrors within the selected range take precedence, matching the
    # ordered source query. Keep stable IDs so days can be joined without SQL.
    authors, activity_actors = {}, {}
    for row in activities:
        actor = row.agent_id or row.metadata.get('agentSnapshot', {}).get('id', '')
        if row.activity_type == 'publication' and row.artifact_article_id:
            authors[row.artifact_article_id] = actor
        activity_actors[row.event_key] = actor
    if archive is not None:
        archive.update(authors=authors, senders=activity_actors, rows=[])

    def record(at, key, category, sender='', peer='', name='', peer_name='', article_id='', lookup_sender=False,
               first_comment=False):
        row = [key, category, sender, peer, name, peer_name, article_id, lookup_sender, first_comment]
        if archive is not None and (article_id or lookup_sender or first_comment):
            archive['rows'].append(row)
            return
        resolved = resolve_article(row, authors, activity_actors, actors)
        if resolved:
            key, sender, category, name, peer, peer_name = resolved
            add(key, sender, at, category, name, peer, peer_name)

    posts = Article.objects.filter(coll_id__in=visible, is_valid=True)
    for row in posts.filter(created_at__gte=start, created_at__lt=end).only(
            'article_id', 'agent_post_author_id', 'created_at').order_by(*Article._meta.ordering, 'pk'):
        record(row.created_at, 'publication:'+row.pk, 'publication', row.agent_post_author_id,
               article_id='' if row.agent_post_author_id else row.pk)
    for model, prefix, identity, name in ((ArticlePostComment, 'comment:', 'creator_id', 'creator_name'),
                                         (ArticlePostRating, 'rating:', 'rater_id', 'rater_name')):
        rows = model.objects.filter(article__coll_id__in=visible, article__is_valid=True, is_valid=True,
                                    created_at__gte=start, created_at__lt=end).select_related('article').only(
            'article_id', 'actor_agent_id', identity, name, 'created_at',
            'article__agent_post_author_id', 'article__agent_post_creator_name',
            *(['reply_to_actor_id'] if model is ArticlePostComment else []))
        for row in rows.order_by(*model._meta.ordering, 'pk'):
            reply = getattr(row, 'reply_to_actor_id', '')
            peer = reply.removeprefix('agent-id:') if reply else row.article.agent_post_author_id
            sender = row.actor_agent_id or getattr(row, identity).removeprefix('agent-id:')
            record(row.created_at, prefix+row.pk, 'social', sender, peer, getattr(row, name),
                   '' if reply else row.article.agent_post_creator_name,
                   article_id='' if peer else row.article_id, lookup_sender=not row.actor_agent_id)

    def annotation(at, key, raw, name, article, first_comment=False):
        record(at, key, 'social', raw.removeprefix('agent-id:'), article.agent_post_author_id or article.author,
               name, article.agent_post_creator_name, article_id='' if article.agent_post_author_id else article.pk,
               lookup_sender=True, first_comment=first_comment)

    annotations = ArticleAnnotation.objects.filter(article__coll_id__in=visible, article__is_valid=True,
        is_valid=True, created_at__gte=start, created_at__lt=end).select_related('article').only(
        'article_id', 'creator_id', 'creator_name', 'created_at', 'article__agent_post_author_id',
        'article__agent_post_creator_name', 'article__author')
    for row in annotations.order_by(*ArticleAnnotation._meta.ordering, 'pk'):
        annotation(row.created_at, 'annotation:'+row.pk, row.creator_id, row.creator_name, row.article)
    first_comment = ArticleAnnotationComment.objects.filter(annotation_id=OuterRef('annotation_id')).order_by('created_at', 'pk').values('pk')[:1]
    comments = ArticleAnnotationComment.objects.filter(annotation__article__coll_id__in=visible,
        annotation__article__is_valid=True, annotation__is_valid=True, is_valid=True,
        created_at__gte=start, created_at__lt=end).select_related('annotation__article').only(
        'annotation_id', 'creator_id', 'creator_name', 'created_at', 'annotation__creator_id',
        'annotation__article_id', 'annotation__article__agent_post_author_id',
        'annotation__article__agent_post_creator_name', 'annotation__article__author').annotate(first_comment=Subquery(first_comment))
    for row in comments.order_by(*ArticleAnnotationComment._meta.ordering, 'pk'):
        annotation(row.created_at, 'annotation-comment:'+row.pk, row.creator_id, row.creator_name, row.annotation.article,
                   first_comment=row.pk == row.first_comment and row.creator_id == row.annotation.creator_id)
