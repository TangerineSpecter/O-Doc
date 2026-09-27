from decimal import Decimal
from datetime import datetime
from zoneinfo import ZoneInfo
from django.utils.dateparse import parse_datetime
from django.conf import settings
from article.models import Article, ArticlePostComment, ArticlePostRating
from .identity import actor_key
from .history import payload
from .models import WorldChange

SHANGHAI = ZoneInfo('Asia/Shanghai')


def month_cutoff(month: str) -> datetime:
    start = datetime.strptime(month, '%Y-%m').replace(tzinfo=SHANGHAI)
    end = start.replace(year=start.year+1, month=1) if start.month == 12 else start.replace(month=start.month+1)
    return end if settings.USE_TZ else end.replace(tzinfo=None)


def juice(ratings: list[int], commenters: set[str]) -> Decimal:
    c, n = Decimal(len(commenters)), Decimal(len(ratings))
    comments = 20*c/(c+5)
    return 8*(Decimal(sum(ratings))+30)/(n+5)+comments if n else comments


def rank(collection_id: str, period='total', value='', cutoff=None) -> list[dict]:
    states = {'post': {}, 'rating': {}, 'comment': {}}
    if cutoff:
        for change in WorldChange.objects.filter(occurred_at__lt=cutoff).order_by('occurred_at', 'id'):
            states[change.kind][change.object_id] = change.payload
    else:
        posts = list(Article.objects.filter(coll_id=collection_id, is_valid=True))
        for post in posts:
            states['post'][post.pk] = payload(post)[1]
        for model, kind in [(ArticlePostComment, 'comment'), (ArticlePostRating, 'rating')]:
            for row in model.objects.filter(article_id__in=[p.pk for p in posts], is_valid=True).order_by('updated_at', model._meta.pk.name):
                states[kind][row.pk] = payload(row)[1]
    result = []
    for post_id, post in states['post'].items():
        if post['collection_id'] != collection_id or not post['valid']:
            continue
        date = parse_datetime(post['created_at'])
        date = date.astimezone(SHANGHAI) if date.tzinfo else date.replace(tzinfo=SHANGHAI)
        if period == 'year' and str(date.year) != str(value):
            continue
        if period == 'month' and date.strftime('%Y-%m') != value:
            continue
        owner = actor_key(post.get('author_id', ''), post.get('creator_id', ''))
        comments = {p['actor'] for p in states['comment'].values() if p['post_id'] == post_id and p['valid'] and p['actor'] and p['actor'] != owner}
        ratings = {p['actor']: p['rating'] for p in states['rating'].values() if p['post_id'] == post_id and p['valid'] and p['actor'] and p['actor'] != owner}
        if not comments and not ratings:
            continue
        score = juice(list(ratings.values()), comments)
        result.append({**post, 'post_id': post_id, 'juice': str(score), 'rating_count': len(ratings),
                       'comment_count': len(comments), 'rating_sum': sum(ratings.values()), 'ratings': ratings, 'commenters': sorted(comments), 'pending_rating': not bool(ratings)})
    result.sort(key=lambda p: (Decimal(p['juice']), p['rating_count'], p['comment_count'], p['created_at'], p['post_id']), reverse=True)
    return result


def post_score(post) -> Decimal:
    owner = actor_key(post.agent_post_author_id, post.agent_post_creator_id)
    comments = {actor_key(c.actor_agent_id, c.creator_id) for c in post.post_comments.all() if c.is_valid}
    comments.discard(owner); comments.discard('')
    ratings = {}
    for rating in sorted(post.post_ratings.all(), key=lambda r: (r.updated_at, r.pk)):
        actor = actor_key(rating.actor_agent_id, rating.rater_id)
        if rating.is_valid and actor and actor != owner:
            ratings[actor] = rating.rating
    return juice(list(ratings.values()), comments)
