"""新配置或旧快照恢复时初始化一次旧关系基线，不生成历史行动。"""
from .social_models import SocialRelation, SocialEvent
from .social_relations import affinity_band
from .life_models import LifeProfile
from .life_schedule import stable_id


def seed_legacy_relations(owner=None):
    from system_settings.models import AgentAffinity
    profiles = LifeProfile.objects.all()
    if owner: profiles = profiles.filter(owner_id=owner)
    from article.models import ArticlePostComment
    counts = {}
    for comment in ArticlePostComment.objects.filter(is_valid=True, parent_comment_id='', article__is_valid=True).select_related('article'):
        if comment.actor_agent_id and comment.article.agent_post_author_id:
            pair = (comment.actor_agent_id, comment.article.agent_post_author_id)
            counts[pair] = counts.get(pair, 0) + 1
    owners = dict(profiles.values_list('pk', 'owner_id'))
    for old in AgentAffinity.objects.filter(actor_id__in=owners).select_related('counterpart'):
        account = owners[old.actor_id]
        peer = f'agent-id:{old.counterpart_id}'
        key = stable_id(account, old.actor_id, peer)
        if SocialRelation.objects.filter(pk=key).exists(): continue
        row = SocialRelation.objects.create(id=key, owner_id=account, actor_id=old.actor_id, counterpart_id=peer,
            affinity=old.score, familiarity=min(100, max(old.event_count, counts.get((old.actor_id, old.counterpart_id), 0)) * 2), band=affinity_band(old.score),
            counterpart_identity={'name': old.counterpart.name, 'avatar': old.counterpart.avatar}, reason='旧关系迁移基线')
        SocialEvent.objects.get_or_create(pk=stable_id(account, old.actor_id, peer, 'migration'), defaults={
            'owner_id':account,'actor_id':old.actor_id,'counterpart_id':peer,'source_key':'migration',
            'category':'migration','reason':'保留旧好感数值，不重放评分',
            'after':{'affinity':row.affinity,'familiarity':row.familiarity,'band':row.band,'emotion':{},'reason':row.reason,
                     'counterpart_identity':row.counterpart_identity}})
