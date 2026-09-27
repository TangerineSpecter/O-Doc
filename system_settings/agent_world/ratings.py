from django.db import transaction
from article.models import Article, ArticlePostRating
from .identity import actor_key, resolve_agent


@transaction.atomic
def rate_post(post, value: int, identity: dict, agent=None):
    """稳定身份定位现有评分，同时保留旧 creator/rater 展示契约。"""
    post = Article.objects.select_for_update().get(pk=post.pk)
    agent = agent or resolve_agent('', identity['creator_id'])
    stable = agent.pk if agent else ''
    actor = actor_key(stable, identity['creator_id'])
    matches = [row for row in ArticlePostRating.objects.filter(article=post, is_valid=True).order_by('-updated_at', '-rating_id')
               if actor_key(row.actor_agent_id, row.rater_id) == actor]
    row = matches[0] if matches else None
    for duplicate in matches[1:]:
        duplicate.is_valid = False
        duplicate.save(update_fields=['is_valid', 'updated_at'])
    values = {'rating': value, 'rater_id': identity['creator_id'], 'rater_name': identity.get('creator_name', ''),
              'rater_avatar': identity.get('creator_avatar', ''), 'actor_agent_id': stable}
    # 同名 Agent 的旧名称身份会撞到评分唯一约束，使用稳定身份区分。
    if stable:
        collisions = ArticlePostRating.objects.filter(article=post, rater_id=values['rater_id'])
        if row:
            collisions = collisions.exclude(pk=row.pk)
        if collisions.exists():
            values['rater_id'] = actor
    if row:
        for key, value in values.items():
            setattr(row, key, value)
        row.save()
    else:
        row = ArticlePostRating.objects.create(article=post, **values)
    return row
