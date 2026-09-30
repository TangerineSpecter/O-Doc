"""保留旧分数；迁移不生成历史回复、不重新解释低评分。"""
import hashlib
from django.db import migrations


def key(*parts):
    return hashlib.sha256(':'.join(str(p) for p in parts).encode()).hexdigest()


def seed(apps, schema_editor):
    Old = apps.get_model('system_settings', 'AgentAffinity')
    Relation = apps.get_model('system_settings', 'SocialRelation')
    Event = apps.get_model('system_settings', 'SocialEvent')
    Profile = apps.get_model('system_settings', 'LifeProfile')
    Comment = apps.get_model('article', 'ArticlePostComment')
    counts = {}
    for comment in Comment.objects.filter(is_valid=True, parent_comment_id='', article__is_valid=True).select_related('article'):
        if comment.actor_agent_id and comment.article.agent_post_author_id:
            pair = (comment.actor_agent_id, comment.article.agent_post_author_id)
            counts[pair] = counts.get(pair, 0) + 1
    owners = dict(Profile.objects.values_list('pk', 'owner_id'))
    for row in Old.objects.select_related('counterpart').all():
        owner = owners.get(row.actor_id)
        if not owner: continue
        score = max(-100, min(100, row.score))
        band = '知己' if score >= 75 else '朋友' if score >= 45 else '友好' if score >= 20 else '中性'
        peer = f'agent-id:{row.counterpart_id}'
        familiar = min(100, max(row.event_count, counts.get((row.actor_id, row.counterpart_id), 0)) * 2)
        relation, _ = Relation.objects.get_or_create(pk=key(owner,row.actor_id,peer), defaults={
            'owner_id': owner,'actor_id': row.actor_id,'counterpart_id': peer, 'affinity': score,
            'familiarity': familiar,'band': band, 'counterpart_identity': {'name':row.counterpart.name,'avatar':row.counterpart.avatar},
            'reason':'旧关系迁移基线'})
        Event.objects.get_or_create(pk=key(owner,row.actor_id,peer,'migration'), defaults={
            'owner_id':owner,'actor_id':row.actor_id,'counterpart_id':peer,'source_key':'migration',
            'category':'migration','reason':'保留旧好感数值，不重放评分', 'after': {
                'affinity':relation.affinity,'familiarity':relation.familiarity,'band':relation.band,'emotion':{}}})


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0052_moment_socialconfig_socialevent_socialinbox_and_more'),
                    ('article', '0025_articlepostcomment_parent_comment_id_and_more')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
