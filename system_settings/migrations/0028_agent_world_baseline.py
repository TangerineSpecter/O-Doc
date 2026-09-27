from django.db import migrations
from django.utils import timezone
import uuid


def seed(apps, schema_editor):
    Category = apps.get_model('system_settings', 'WorldCategory')
    Profession = apps.get_model('system_settings', 'WorldProfession')
    Bonus = apps.get_model('system_settings', 'WorldProfessionCategory')
    Ledger = apps.get_model('system_settings', 'WorldLedger')
    Event = apps.get_model('system_settings', 'WorldIncomeEvent')
    Change = apps.get_model('system_settings', 'WorldChange')
    Config = apps.get_model('system_settings', 'WorldIncomeConfig')
    Agent = apps.get_model('system_settings', 'Agent')
    Article = apps.get_model('article', 'Article')
    now = timezone.now()
    types = [('finance', '财经', '财经博主'), ('technology', '科技', '科技博主'), ('travel', '旅行', '旅游博主'),
             ('food', '美食', '美食博主'), ('reading', '阅读', '书评人'), ('photography', '摄影', '摄影师'), ('research', '研究', '研究员')]
    for index, (key, name, profession) in enumerate(types):
        Category.objects.get_or_create(pk=f'category:{key}', defaults={'name': name, 'sort': index})
        Profession.objects.get_or_create(pk=f'profession:{key}', defaults={'name': profession})
        Bonus.objects.get_or_create(pk=f'profession:{key}:category:{key}', defaults={'profession_id': f'profession:{key}', 'category_id': f'category:{key}'})
    Config.objects.get_or_create(pk='income:initial', defaults={'effective_at': now})
    names = {}
    for agent in Agent.objects.all():
        names.setdefault(agent.name, []).append(agent.pk)
        Ledger.objects.get_or_create(pk=f'opening:{agent.pk}', defaults={'agent_id': agent.pk, 'agent_name': agent.name, 'kind': 'opening', 'amount': agent.money})
    def actor(legacy):
        matches = names.get(legacy[6:], []) if legacy.startswith('agent:') else []
        return f'agent-id:{matches[0]}' if len(matches) == 1 else legacy
    for post in Article.objects.all().iterator():
        matches = names.get(post.agent_post_creator_id[6:], []) if post.agent_post_creator_id.startswith('agent:') else []
        if len(matches) == 1:
            Article.objects.filter(pk=post.pk).update(agent_post_author_id=matches[0])
            post.agent_post_author_id = matches[0]
        Change.objects.create(id=str(uuid.uuid4()), kind='post', object_id=post.pk, occurred_at=now, payload={
            'post_id': post.pk, 'collection_id': post.coll_id, 'title': post.title, 'author_id': post.agent_post_author_id,
            'creator_id': post.agent_post_creator_id, 'author_name': post.agent_post_creator_name,
            'created_at': post.created_at.isoformat(), 'valid': post.is_valid, 'permission': post.permission})
        Event.objects.get_or_create(pk=f'post:{post.pk}', defaults={'status': 'historical'})
    for model_name, kind, field in [('ArticlePostComment', 'comment', 'creator_id'), ('ArticlePostRating', 'rating', 'rater_id')]:
        Model = apps.get_model('article', model_name)
        for row in Model.objects.all().iterator():
            key = actor(getattr(row, field))
            if key.startswith('agent-id:'):
                Model.objects.filter(pk=row.pk).update(actor_agent_id=key[9:])
            Change.objects.create(id=str(uuid.uuid4()), kind=kind, object_id=row.pk, occurred_at=now,
                payload={'post_id': row.article_id, 'actor': key, 'valid': row.is_valid, 'rating': row.rating if kind == 'rating' else None})
            if kind == 'comment':
                Event.objects.get_or_create(pk=f'comment:{row.article_id}:{key}', defaults={'status': 'historical'})


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0027_worldcategory_worldchange_worldincomeconfig_and_more'), ('article', '0023_article_agent_post_author_id_and_more')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
