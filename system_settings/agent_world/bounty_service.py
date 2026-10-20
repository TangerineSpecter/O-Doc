"""悬赏的创建、加权抽签、领取、交付与验收。"""
import random
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from anthology.models import Anthology
from system_settings.models import Agent, WorldLedger

from .bounty_models import Bounty, BountyDelivery, BountyInvite
from .life_models import LifeGoal, LifeProfile
from .life_time import local_time

INVITE_DELAY = timedelta(minutes=10)
CLAIM_HOURS = 24
RELEASE_FAILURES = 3


def owner_agents(owner: str) -> list:
    identities = LifeProfile.objects.filter(owner_id=owner).values_list('pk', flat=True)
    return list(Agent.objects.filter(pk__in=identities, archived_at__isnull=True).order_by('name', 'pk'))


def weighted_order(agents: list) -> list:
    """资金占比越高权重越低；资金相同时退化为均匀随机。"""
    remaining = [(agent, max(Decimal('0'), agent.money or Decimal('0'))) for agent in agents]
    order = []
    while remaining:
        total = sum(balance for _, balance in remaining)
        size = len(remaining)
        weights = []
        for _, balance in remaining:
            share = (balance / total) if total > 0 else Decimal(1) / size
            weights.append(float(max(Decimal('0.001'), Decimal(1) - share)))
        index = random.choices(range(size), weights=weights, k=1)[0]
        order.append(remaining.pop(index)[0])
    return order


def validate_target(owner: str, collection_id: str, category_id: str) -> tuple:
    collection = Anthology.objects.filter(pk=collection_id, type='agent', is_valid=True).first()
    if collection is None or collection.user_id != owner:
        raise ValueError('请选择自己可管理的有效 Agent 文集')
    from .models import WorldCategory
    from .publish_config import is_travel_name
    category = WorldCategory.objects.filter(pk=category_id, enabled=True).first()
    if category is None:
        raise ValueError('请选择启用的帖子分类')
    if category.workflow_kind == 'travel' or is_travel_name(category.name):
        raise ValueError('旅行分类由旅行工作流发布，不能作为悬赏分类')
    return collection, category


def default_search_server() -> str:
    from .publish_config import search_servers
    servers = search_servers()
    if not servers:
        raise ValueError('请先在 MCP 设置中启用可用的 Tavily 搜索服务')
    return servers[0].pk


def create(owner: str, data: dict) -> Bounty:
    title = str(data.get('title') or '').strip()
    objective = str(data.get('objective') or '').strip()
    requirements = str(data.get('requirements') or '').strip()
    if not 0 < len(title) <= 200:
        raise ValueError('悬赏标题须为 1 至 200 字')
    if not 0 < len(objective) <= 4000:
        raise ValueError('悬赏目标须为 1 至 4000 字')
    if len(requirements) > 4000:
        raise ValueError('交付要求不能超过 4000 字')
    collection_id = data.get('collection_id') or data.get('collectionId') or ''
    category_id = data.get('category_id') or data.get('categoryId') or ''
    collection, category = validate_target(owner, str(collection_id), str(category_id))
    try:
        reward = Decimal(str(data.get('reward') or 0)).quantize(Decimal('.01'))
    except Exception as exc:
        raise ValueError('奖励金额无效') from exc
    if reward <= 0 or reward > Decimal('1000000'):
        raise ValueError('奖励金额须为正数且不超过 1000000')
    default_search_server()
    candidates = owner_agents(owner)
    if not candidates:
        raise ValueError('当前账号还没有可领取悬赏的居民')
    requested = data.get('agent_ids') or data.get('agentIds')
    if isinstance(requested, list) and requested:
        wanted = {str(value) for value in requested}
        candidates = [agent for agent in candidates if agent.pk in wanted]
        if not candidates:
            raise ValueError('请选择至少一位可领取悬赏的居民')
    now = timezone.now()
    bounty = Bounty.objects.create(
        owner_id=owner, title=title, objective=objective, requirements=requirements,
        collection_id=collection.pk, category_id=category.pk, reward=reward,
        invite_at=now + INVITE_DELAY, created_at=now,
    )
    schedule_invites(bounty, candidates, now + INVITE_DELAY)
    return bounty


def schedule_invites(bounty: Bounty, agents: list, at) -> None:
    BountyInvite.objects.filter(bounty=bounty, status='pending').update(status='expired')
    order = weighted_order(list(agents))
    BountyInvite.objects.bulk_create([
        BountyInvite(bounty=bounty, agent=agent, sort=index, scheduled_at=at)
        for index, agent in enumerate(order)
    ])
    Bounty.objects.filter(pk=bounty.pk).update(invite_at=at)


def invitation_candidates(bounty: Bounty) -> list:
    """邀请历史保留发布时的候选范围；重试不能扩大用户的选择。"""
    invited_ids = set(bounty.invites.exclude(agent_id=None).values_list('agent_id', flat=True))
    return [agent for agent in owner_agents(bounty.owner_id) if agent.pk in invited_ids]


def renew_invites(bounty: Bounty, at, *, keep_pending: bool = False) -> None:
    if bounty.status != 'open':
        raise ValueError('只有待领取的悬赏可以重新征询')
    pending = bounty.invites.filter(status='pending')
    if keep_pending and pending.exists():
        pending.update(scheduled_at=at)
        Bounty.objects.filter(pk=bounty.pk).update(invite_at=at)
        return
    candidates = invitation_candidates(bounty)
    if not candidates:
        raise ValueError('原候选范围内已没有可领取悬赏的居民')
    schedule_invites(bounty, candidates, at)


@transaction.atomic
def reopen(bounty: Bounty, reason: str = '') -> None:
    """回到待领取并重新征询；用于超时回收和连续执行失败。"""
    now = timezone.now()
    updated = Bounty.objects.filter(pk=bounty.pk, status='claimed').update(
        status='open', agent=None, claimed_at=None, expire_at=None, next_try_at=None,
        failures=0, reject_reason='', article=None, last_error=reason[:500])
    if not updated:
        return
    LifeGoal.objects.filter(id=f'goal_{bounty.pk}', status='active').update(
        status='abandoned', reason=reason or '悬赏已退回待领取', progress='悬赏已退回待领取')
    bounty.refresh_from_db()
    candidates = invitation_candidates(bounty)
    if candidates:
        schedule_invites(bounty, candidates, now + INVITE_DELAY)
    else:
        Bounty.objects.filter(pk=bounty.pk).update(invite_at=now + INVITE_DELAY)


def release_expired(now=None) -> None:
    now = now or timezone.now()
    for bounty in Bounty.objects.filter(status='claimed', expire_at__lte=now)[:20]:
        reopen(bounty, '领取后 24 小时未交付，已自动回收')


@transaction.atomic
def accept(bounty: Bounty, agent, decision: dict | None = None) -> bool:
    """先到先得；只有一次 CAS 能成功。"""
    decision = decision or {}
    now = timezone.now()
    won = Bounty.objects.filter(pk=bounty.pk, status='open').update(
        status='claimed', agent=agent, claimed_at=now, expire_at=now + timedelta(hours=CLAIM_HOURS),
        next_try_at=now, failures=0, last_error='', reject_reason='', article=None, updated_at=now)
    if not won:
        return False
    BountyInvite.objects.filter(bounty=bounty, status='pending').update(status='expired')
    LifeGoal.objects.update_or_create(
        id=f'goal_{bounty.pk}',
        defaults={
            'owner_id': bounty.owner_id, 'actor_id': agent.pk, 'title': bounty.title,
            'condition': {'kind': 'bounty', 'bounty_id': bounty.pk,
                          'description': '按悬赏要求交付帖子并通过人工验收'},
            'progress': '已领取悬赏，等待交付', 'status': 'active',
            'reason': str(decision.get('reason') or '')[:2000],
        },
    )
    return True


@transaction.atomic
def deliver(bounty_id: str, agent, article, record=None, summary: str = '') -> BountyDelivery:
    bounty = Bounty.objects.select_for_update().get(pk=bounty_id)
    if bounty.status != 'claimed' or bounty.agent_id != agent.pk:
        raise ValueError('悬赏已被回收或不属于当前居民')
    now = timezone.now()
    delivery = BountyDelivery.objects.create(
        bounty=bounty, agent=agent, article=article, run_record=record,
        summary=str(summary or '')[:2000], status='pending', created_at=now)
    bounty.status = 'delivered'
    bounty.article = article
    bounty.delivered_at = now
    bounty.last_error = ''
    bounty.failures = 0
    bounty.save(update_fields=['status', 'article', 'delivered_at', 'last_error', 'failures', 'updated_at'])
    LifeGoal.objects.filter(id=f'goal_{bounty.pk}', status='active').update(
        progress='已交付，等待验收', reason='等待用户验收')
    return delivery


def payout(bounty: Bounty) -> None:
    agent = bounty.agent
    if agent is None or bounty.reward <= 0:
        return
    key = f'bounty:{bounty.pk}:{agent.pk}'
    if WorldLedger.objects.filter(pk=key).exists():
        return
    WorldLedger.objects.create(
        pk=key, agent_id=agent.pk, agent_name=agent.name, kind='bounty', amount=bounty.reward,
        snapshot={'bounty_id': bounty.pk, 'title': bounty.title, 'article_id': bounty.article_id,
                  'collection_id': bounty.collection_id, 'category_id': bounty.category_id},
    )
    agent.money = WorldLedger.objects.filter(agent_id=agent.pk).aggregate(total=Sum('amount'))['total'] or Decimal('0')
    agent.save(update_fields=['money'])


@transaction.atomic
def review(owner: str, bounty_id: str, approve: bool, reason: str = '') -> Bounty:
    bounty = Bounty.objects.select_for_update().filter(pk=bounty_id, owner_id=owner).first()
    if bounty is None:
        raise ValueError('悬赏不存在')
    if bounty.status != 'delivered':
        raise ValueError('该悬赏当前不在待验收状态')
    reason = str(reason or '').strip()
    if not approve and not reason:
        raise ValueError('驳回必须写明原因')
    if len(reason) > 2000:
        raise ValueError('验收说明不能超过 2000 字')
    now = timezone.now()
    delivery = bounty.deliveries.filter(status='pending').order_by('-created_at').first()
    if approve:
        article = bounty.article
        if article is None or not article.is_valid or article.coll_id != bounty.collection_id:
            raise ValueError('交付帖子已失效或被移出文集，不能通过验收')
        bounty.status = 'accepted'
        bounty.accepted_at = now
        bounty.reject_reason = ''
        bounty.save(update_fields=['status', 'accepted_at', 'reject_reason', 'updated_at'])
        if delivery:
            delivery.status = 'accepted'
            delivery.reviewed_at = now
            delivery.save(update_fields=['status', 'reviewed_at'])
        LifeGoal.objects.filter(id=f'goal_{bounty.pk}').update(
            status='completed', progress='悬赏已验收通过', reason=reason or '悬赏奖励已发放')
        payout(bounty)
    else:
        bounty.status = 'claimed'
        bounty.attempt += 1
        bounty.expire_at = now + timedelta(hours=CLAIM_HOURS)
        bounty.reject_reason = reason
        bounty.save(update_fields=['status', 'attempt', 'expire_at', 'reject_reason', 'updated_at'])
        if delivery:
            delivery.status = 'rejected'
            delivery.reject_reason = reason
            delivery.reviewed_at = now
            delivery.save(update_fields=['status', 'reject_reason', 'reviewed_at'])
        LifeGoal.objects.filter(id=f'goal_{bounty.pk}', status='active').update(
            progress=f'被驳回：{reason}'[:2000], reason=reason)
    return bounty


@transaction.atomic
def cancel(owner: str, bounty_id: str) -> Bounty:
    bounty = Bounty.objects.select_for_update().filter(pk=bounty_id, owner_id=owner).first()
    if bounty is None:
        raise ValueError('悬赏不存在')
    if bounty.status in ('accepted', 'cancelled'):
        raise ValueError('已结束的悬赏不能取消')
    bounty.status = 'cancelled'
    bounty.save(update_fields=['status', 'updated_at'])
    BountyInvite.objects.filter(bounty=bounty, status='pending').update(status='expired')
    LifeGoal.objects.filter(id=f'goal_{bounty.pk}', status='active').update(
        status='abandoned', reason='悬赏已取消', progress='悬赏已取消')
    return bounty


def _iso(value):
    return local_time(value).isoformat() if value else None


def bounty_data(bounty: Bounty, *, collections=None, categories=None, detail=False) -> dict:
    from .models import WorldCategory
    collection_title = ''
    if collections is not None:
        collection_title = collections.get(bounty.collection_id, '')
    else:
        collection_title = Anthology.objects.filter(pk=bounty.collection_id).values_list('title', flat=True).first() or ''
    if categories is not None:
        category_name = categories.get(bounty.category_id, '')
    else:
        category_name = WorldCategory.objects.filter(pk=bounty.category_id).values_list('name', flat=True).first() or ''
    article = bounty.article
    value = {
        'id': bounty.pk, 'title': bounty.title, 'objective': bounty.objective,
        'requirements': bounty.requirements, 'collectionId': bounty.collection_id,
        'collectionTitle': collection_title, 'categoryId': bounty.category_id,
        'categoryName': category_name, 'reward': str(bounty.reward), 'status': bounty.status,
        'agent': {'id': bounty.agent.pk, 'name': bounty.agent.name, 'avatar': bounty.agent.avatar or ''} if bounty.agent else None,
        'inviteAt': _iso(bounty.invite_at), 'expireAt': _iso(bounty.expire_at),
        'claimedAt': _iso(bounty.claimed_at), 'deliveredAt': _iso(bounty.delivered_at),
        'acceptedAt': _iso(bounty.accepted_at), 'attempt': bounty.attempt, 'failures': bounty.failures,
        'rejectReason': bounty.reject_reason, 'lastError': bounty.last_error,
        'createdAt': _iso(bounty.created_at),
        'article': {'articleId': article.article_id, 'title': article.title, 'collId': article.coll_id,
                    'category': article.agent_post_category, 'sourceUrl': article.source_url or '',
                    'createdAt': _iso(article.created_at)} if article else None,
        'invitedCount': bounty.invites.exclude(status='expired').count() if detail else 0,
    }
    if detail:
        value['invites'] = [
            {'agentId': row.agent_id, 'agentName': row.agent.name if row.agent else '',
             'status': row.status, 'reason': str((row.decision or {}).get('reason') or '')[:200]}
            for row in bounty.invites.select_related('agent').order_by('sort', 'id')
        ]
        value['deliveries'] = [
            {'id': row.pk, 'articleId': row.article_id, 'status': row.status,
             'rejectReason': row.reject_reason, 'summary': row.summary, 'createdAt': _iso(row.created_at)}
            for row in bounty.deliveries.order_by('-created_at')[:10]
        ]
    return value
