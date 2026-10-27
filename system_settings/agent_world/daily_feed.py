"""投影居民已发生的业务事实，不复制账本或执行记录。"""
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Q, Prefetch

from article.access import get_visible_anthology_queryset
from system_settings.models import Agent, AgentActivity, AgentRunRecord, AgentTask, WorldAction
from .farm_models import AgentFarm, FarmOperation
from .farm_catalog import DEFAULT_RULES as FARM_RULES
from .investment_models import InvestmentAccount, InvestmentDecision, InvestmentTrade
from .life_models import LifeItem, LifeProfile, LifeRevision
from .life_config import task_owner
from .life_time import SHANGHAI, local_time, storage_time
from .market_models import MarketListing, MarketSession, MarketTransaction
from .market_history_order import batch_operation_orders, operation_key
from .market_recovery import PROCESS_INTERRUPTED
from .market_narrative import public_leave_reason
from .models import WorldLedger
from .travel_models import TravelJourney


CATEGORIES = {'fishing', 'exploration', 'publication', 'interaction', 'travel', 'farm', 'cooking', 'alchemy', 'blacksmith', 'market', 'trade', 'investment', 'finance', 'record'}
MARKET_LABELS = {
    'buy_shop': '商店购买', 'sell': '商店回收', 'list': '居民上架',
    'buy_listing': '购买居民商品', 'reprice': '调整挂牌价格', 'withdraw': '撤回挂牌',
    'buy_potion': '购买药剂', 'sell_combat_material': '出售冒险材料',
    'sell_combat_equipment': '出售装备', 'list_combat_equipment': '装备上架',
}
FARM_LABELS = {
    'plant': '播种', 'water': '浇水', 'harvest': '收获', 'feed': '喂养',
    'collect': '领取畜牧产物', 'expand': '扩建农场', 'build': '建造', 'upgrade': '升级',
    'buy_supply': '购买农资', 'buy_animal': '购买动物', 'sell': '出售农产品',
    'fertilize': '施肥',
}
LEDGER_LABELS = {
    'post': '作品收入', 'comment': '评论收入', 'prize': '月榜奖金',
    'travel': '旅行费用', 'souvenir': '旅行购物', 'farm': '农场支出',
    'market': '市场收支', 'investment': '投资成交', 'bounty': '悬赏收入',
}


def _window(day):
    start = datetime.combine(day, time.min, SHANGHAI)
    return storage_time(start), storage_time(start + timedelta(days=1))


def _journeys_in_window(owner, start, end):
    """一趟旅行只有一条动态，位置随进展移动，返程后固定。"""
    return TravelJourney.objects.filter(owner_id=owner).filter(
        Q(status='completed', returned_at__gte=start, returned_at__lt=end) |
        Q(status='completed', returned_at__isnull=True, updated_at__gte=start, updated_at__lt=end) |
        ~Q(status='completed') & Q(updated_at__gte=start, updated_at__lt=end)
    )


def _journey_event_time(journey):
    if journey.status == 'completed' and journey.returned_at:
        return journey.returned_at
    return journey.updated_at


@dataclass(frozen=True)
class FeedScope:
    actors: set[str]
    names: dict[str, str]
    visible_colls: tuple[str, ...]


def feed_scope(request, owner: str) -> FeedScope:
    """仅在一次请求内复用归属和可见性，下一次请求重新检查权限。"""
    actors = _actor_scope(owner)
    return FeedScope(
        actors=actors,
        names=dict(Agent.objects.filter(pk__in=actors).values_list('id', 'name')),
        visible_colls=tuple(get_visible_anthology_queryset(request).values_list('coll_id', flat=True)),
    )


def latest_event_day(request, owner, before, category='all', actor_id='', *, scope: FeedScope | None = None):
    """通过各业务表最近的时间索引跳过没有活动的日期。"""
    scope = scope or feed_scope(request, owner)
    actors, visible_colls = scope.actors, scope.visible_colls
    candidates = []
    if category in ('all', 'interaction'):
        from .social_models import SocialTheatreEvent
        scenes = SocialTheatreEvent.objects.filter(owner_id=owner).exclude(status='deleted')
        scenes = scenes.filter(updated_at__lt=before).order_by('-updated_at')
        if actor_id:
            # 同时兼容 SQLite 和 PostgreSQL 的身份快照查询。
            collect_scene = next((when for when, people in scenes.values_list('updated_at', 'participants').iterator()
                                  if any(str(person.get('id')) == actor_id for person in people)), None)
        else:
            collect_scene = scenes.values_list('updated_at', flat=True).first()
        if collect_scene is not None:
            candidates.append(collect_scene)

    def collect(queryset, field, actor_field='actor_id'):
        if actor_id and actor_field:
            queryset = queryset.filter(**{actor_field: actor_id})
        value = queryset.filter(**{f'{field}__lt': before}).order_by(f'-{field}').values_list(field, flat=True).first()
        if value is not None:
            candidates.append(value)

    if category in ('all', 'publication', 'interaction', 'record'):
        activity_types = ('publication', 'interaction') if category == 'all' else (
            ('publication',) if category == 'publication' else
            ('interaction',) if category == 'interaction' else ('work',)
        )
        activity_scope = (Q(activity_type='work', agent_id__in=actors) |
                          Q(activity_type='work', agent_id__isnull=True, run_record__agent_id__in=actors)) if category == 'record' else Q(pk__in=[])
        visible_scope = Q(activity_type__in=activity_types, artifact_coll_id__in=visible_colls)
        activities = AgentActivity.objects.filter(activity_scope | visible_scope | Q(action__startswith='social_', metadata__owner_id=owner))
        if actor_id:
            # 与事件投影的身份回退一致，同时保留原有文集和账号可见性约束。
            activities = activities.filter(
                Q(agent_id=actor_id) |
                Q(agent_id__isnull=True, activity_type='work', run_record__agent_id=actor_id) |
                Q(agent_id__isnull=True, metadata__agentSnapshot__id=actor_id)
            )
        collect(activities, 'occurred_at', None)
    if category == 'record':
        records = AgentRunRecord.objects.filter(agent_id__in=actors)
        collect(records, 'started_at', 'agent_id')
        collect(records.filter(status__in=('success', 'failed')), 'updated_at', 'agent_id')
        collect(LifeItem.objects.filter(owner_id=owner, status__in=('rest', 'failed', 'cancelled')), 'updated_at')
        collect(LifeRevision.objects.filter(item__owner_id=owner), 'created_at', 'item__actor_id')
    if category in ('all', 'fishing'):
        from .fishing.models import FishingTrip
        collect(FishingTrip.objects.filter(owner_id=owner), 'updated_at')
    if category in ('all','exploration'):
        from .combat.models import Exploration
        collect(Exploration.objects.filter(owner_id=owner), 'updated_at')
    if category in ('all', 'cooking'):
        from .cooking_models import CookingOperation
        collect(CookingOperation.objects.filter(owner_id=owner), 'created_at')
    if category in ('all', 'alchemy'):
        from .alchemy_models import AlchemyOperation
        collect(AlchemyOperation.objects.filter(owner_id=owner), 'created_at')
    if category in ('all', 'blacksmith'):
        from .blacksmith_models import BlacksmithOperation
        collect(BlacksmithOperation.objects.filter(owner_id=owner), 'created_at')
    if category in ('all', 'farm'):
        collect(FarmOperation.objects.filter(farm__owner_id=owner), 'created_at', 'farm_id')
        for farm in AgentFarm.objects.filter(owner_id=owner):
            if actor_id and farm.pk != actor_id:
                continue
            for plan in farm.state.get('planting_plans', {}).values():
                for event in plan.get('events', []):
                    when = storage_time(datetime.fromtimestamp(event['at'], SHANGHAI))
                    if when < before:
                        candidates.append(when)
    if category in ('all', 'market', 'trade'):
        transactions = MarketTransaction.objects.filter(owner_id=owner)
        if actor_id:
            transactions = transactions.filter(Q(actor_id=actor_id) | Q(result__seller_id=actor_id))
        collect(transactions, 'created_at', None)
        # 交易归并卡片可能移动到跨日会话结束日，日期索引须覆盖该日期。
        sessions = MarketSession.objects.filter(owner_id=owner)
        if actor_id:
            # 卖家的售出卡也随买方跨日会话结束而移动，不能只索引自己的会话。
            sessions = sessions.filter(Q(actor_id=actor_id) | Q(pk__in=transactions.values('session_id')))
        collect(sessions, 'created_at', None)
        collect(sessions, 'ended_at', None)
    if category in ('all', 'investment'):
        collect(InvestmentDecision.objects.filter(owner_id=owner), 'created_at')
    if category in ('all', 'travel'):
        journeys = TravelJourney.objects.filter(owner_id=owner)
        collect(journeys.exclude(status='completed'), 'updated_at')
        completed = journeys.filter(status='completed')
        collect(completed.filter(returned_at__isnull=False), 'returned_at')
        collect(completed.filter(returned_at__isnull=True), 'updated_at')
    if category in ('all', 'finance'):
        ledger = WorldLedger.objects.filter(agent_id__in=actors).exclude(kind='opening').exclude(amount=0)
        collect(ledger, 'created_at', 'agent_id')
    return local_time(max(candidates)).date() if candidates else None


def _event(category, source, identity, when, actor_id, actor_name, title, detail='', *, status='success', amount=None, target=None):
    return {
        'id': f'{source}:{identity}', 'category': category, 'source': source,
        'actorId': actor_id or '', 'actorName': actor_name or '已删除的居民',
        'occurredAt': local_time(when).isoformat(), 'title': str(title)[:180],
        'detail': str(detail or '')[:1200], 'status': status,
        'amount': str(amount) if amount is not None else None, 'target': target,
    }


def _actor_scope(owner):
    from .combat.models import CombatProfile
    ids = set(CombatProfile.objects.filter(owner_id=owner).values_list('id',flat=True))
    ids.update(LifeProfile.objects.filter(owner_id=owner).values_list('id', flat=True))
    for model, field in ((AgentFarm, 'id'), (InvestmentAccount, 'id'),
                         (MarketSession, 'actor_id'), (TravelJourney, 'actor_id')):
        ids.update(model.objects.filter(owner_id=owner).values_list(field, flat=True))
    for task in AgentTask.objects.exclude(task_kind='custom'):
        if task_owner(task) == owner:
            ids.update(task.agent_ids or [task.agent_id])
    return ids


def _travel_detail(journey, snapshot):
    selection = snapshot.get('selection') if isinstance(snapshot.get('selection'), dict) else {}
    if journey.status == 'skipped':
        return snapshot.get('skip_reason') or selection.get('reason') or '本次没有出行'
    parts = []
    if selection.get('reason'):
        parts.append(str(selection['reason'])[:300])
    visits = snapshot.get('visits') if isinstance(snapshot.get('visits'), list) else []
    site_names = [visit['site']['name'] for visit in visits
                  if isinstance(visit, dict) and isinstance(visit.get('site'), dict)
                  and visit['site'].get('name') and visit.get('choice') != '略过']
    if site_names:
        parts.append('游览：' + '、'.join(str(name) for name in site_names))
    food = snapshot.get('food') if isinstance(snapshot.get('food'), dict) else {}
    if food.get('choice'):
        parts.append('美食：' + str(food['choice']))
    shopping = snapshot.get('shopping') if isinstance(snapshot.get('shopping'), dict) else {}
    goods = {item.get('id'): item for item in (snapshot.get('goods') or []) if isinstance(item, dict)}
    basket = shopping.get('basket') if isinstance(shopping.get('basket'), list) else []
    purchases = [f"{goods[item['id']].get('name', '纪念品')} × {item['quantity']}" for item in basket
                 if isinstance(item, dict) and item.get('id') in goods
                 and type(item.get('quantity')) is int and item['quantity'] > 0]
    if purchases:
        parts.append('纪念品：' + '、'.join(purchases))
    if journey.returned_at:
        parts.append('已返程')
    return ' · '.join(parts) or '正在准备行程'


def _investment_detail(decision, trades):
    parts = []
    for trade in trades:
        operation = trade.operation if isinstance(trade.operation, dict) else {}
        result = trade.result if isinstance(trade.result, dict) else {}
        side = {'buy': '买入', 'sell': '卖出'}.get(result.get('side') or operation.get('side'), '成交')
        stock = operation.get('name') or result.get('code') or operation.get('code') or '股票'
        code = result.get('code') or operation.get('code')
        name = f'{stock}（{code}）' if code and stock != code else str(stock)
        parts.append(f"{side}{name} {result.get('quantity') or operation.get('quantity', '')} 股，"
                     f"{result.get('price', '')} 元/股")
    if decision.reason:
        parts.append(('执行结果：' if decision.status in ('failed', 'interrupted') else '决定：') + decision.reason[:700])
    return ' · '.join(parts) or '正在研究持仓和市场'


def day_events(request, owner, day, actor_id='', *, scope: FeedScope | None = None):
    """每条事件引用稳定业务主键；筛选发生于聚合后，避免账目视角重复计数。"""
    start, end = _window(day)
    scope = scope or feed_scope(request, owner)
    actors, names = scope.actors, scope.names
    events = []
    from .social_theatre_feed import theatre_feed
    events.extend(theatre_feed(owner, start, end))
    visible_colls = scope.visible_colls
    activities = AgentActivity.objects.filter(
        Q(activity_type='work', agent_id__in=actors) |
        Q(activity_type='work', agent_id__isnull=True, run_record__agent_id__in=actors) |
        Q(activity_type__in=('publication', 'interaction'), artifact_coll_id__in=visible_colls) |
        Q(action__startswith='social_', metadata__owner_id=owner)
    ).select_related('agent', 'run_record')
    day_activities = activities.filter(occurred_at__gte=start, occurred_at__lt=end)
    activities = activities.filter(Q(pk__in=day_activities.values('pk')) |
        Q(run_record_id__in=day_activities.exclude(activity_type='work').exclude(run_record_id=None).values('run_record_id')))
    from system_settings.agent_activity_presentation import grouped_activities, activity_title, activity_rating
    activities = grouped_activities(activities)
    social_op_ids = [
        row.metadata.get('social_opportunity_id')
        for row in activities
        if row.action.startswith('social_') and isinstance(row.metadata, dict) and row.metadata.get('social_opportunity_id')
    ]
    from .social_models import SocialOpportunity, Moment
    social_ops = {op.pk: op for op in SocialOpportunity.objects.filter(pk__in=social_op_ids)} if social_op_ids else {}
    from .social_targets import reply_targets
    social_reply_targets = reply_targets(activities, owner, visible_colls)

    moment_ids = set()
    for row in activities:
        if row.artifact_id and row.artifact_kind == 'moment':
            moment_ids.add(row.artifact_id)
    for op in social_ops.values():
        if isinstance(op.result, dict):
            res = op.result
            if res.get('moment_id'):
                moment_ids.add(res['moment_id'])
            if isinstance(res.get('likes'), list):
                for mid in res['likes']:
                    if mid:
                        moment_ids.add(mid)
    moment_ids.update(target['artifactId'] for target in social_reply_targets.values()
                      if target.get('artifactKind') == 'moment')
    moments_map = {m.pk: m for m in Moment.objects.filter(pk__in=moment_ids, owner_id=owner, is_valid=True)} if moment_ids else {}

    recorded_runs = set()
    for row in activities:
        historical_name = ''
        if not row.agent:
            from system_settings.agent_history import historical_activity_author
            historical_name = historical_activity_author(row).get('name', '')
        snapshot = row.metadata.get('agentSnapshot', {}) if isinstance(row.metadata, dict) else {}
        actor_key = (row.agent_id
                     or (row.run_record.agent_id if row.activity_type == 'work' and row.run_record else '')
                     or (snapshot.get('id') if isinstance(snapshot, dict) else ''))
        actor_name = row.agent.name if row.agent else historical_name or (row.run_record.agent_name if row.run_record else '')
        if row.run_record_id and row.activity_type == 'work':
            recorded_runs.add(row.run_record_id)
        artifact_kind = row.artifact_kind or ''
        artifact_id = row.artifact_id or ''
        current_action = row.current_action or ''
        sub_action = row.action or ''
        title = activity_title(row)
        is_motive = False
        target_author = ''

        if row.action.startswith('social_'):
            op_id = row.metadata.get('social_opportunity_id') if isinstance(row.metadata, dict) else None
            op = social_ops.get(op_id) if op_id else None
            res = op.result if (op and isinstance(op.result, dict)) else {}
            raw_action = res.get('action') or row.action.replace('social_', '')

            # 解析关联朋友圈动态
            reply_target = social_reply_targets.get(row.pk)
            if reply_target is not None:
                artifact_kind = reply_target.get('artifactKind', '')
                artifact_id = reply_target.get('artifactId', '')
            target_mid = artifact_id if artifact_kind == 'moment' else None
            if not target_mid and reply_target is None and raw_action in ('publish', 'read'):
                target_mid = res.get('moment_id') if raw_action == 'publish' or res.get('content') else None
                if raw_action == 'read' and not target_mid and isinstance(res.get('likes'), list) and res['likes']:
                    target_mid = res['likes'][0]
            if target_mid and target_mid in moments_map:
                artifact_kind = 'moment'
                artifact_id = target_mid
                target_m = moments_map.get(target_mid)
                if target_m and isinstance(target_m.identity, dict):
                    target_author = target_m.identity.get('name') or ''
            elif artifact_kind == 'moment':
                artifact_kind = ''
                artifact_id = ''

            if not target_author:
                target_author = row.counterpart_name or ''

            # 判断内容是否为内心思考依据
            if res.get('reason') and (not res.get('content') or row.summary == str(res['reason'])[:1200]):
                is_motive = True

            if raw_action == 'publish':
                sub_action = 'publish'
                current_action = '朋友圈动态'
                title = f'{actor_name}在朋友圈分享了新动态' if actor_name else '在朋友圈分享了新动态'
                is_motive = False
            elif raw_action == 'read':
                has_comment = bool(res.get('content'))
                has_like = bool(res.get('likes'))
                if has_comment and has_like:
                    sub_action = 'comment'
                    current_action = '动态评论'
                    title = f'浏览了 @{target_author} 的朋友圈动态并点赞评论' if target_author else '浏览了朋友圈动态并点赞评论'
                elif has_comment:
                    sub_action = 'comment'
                    current_action = '动态评论'
                    title = f'在 @{target_author} 的朋友圈动态下留言' if target_author else '在朋友圈动态下留言'
                elif has_like:
                    sub_action = 'like'
                    current_action = '动态点赞'
                    title = f'浏览了 @{target_author} 的朋友圈动态并点赞' if target_author else '浏览了朋友圈动态并点赞'
                    is_motive = True
                else:
                    # 纯浏览保留执行事实，但不作为互动事件进入时间线和统计。
                    continue
            elif raw_action == 'reply':
                sub_action = 'reply'
                current_action = '回复了评论'
                title = f'回复了 @{target_author} 的评论' if target_author else '回复了评论'
            elif raw_action in ('rest', 'ignore', 'defer'):
                sub_action = 'rest'
                current_action = '决定暂时不交流'
                title = f'{actor_name}决定暂时不交流' if actor_name else '决定暂时不交流'
                is_motive = True
            elif raw_action == 'skip':
                sub_action = 'skip'
                current_action = '跳过本次社交'
                title = f'{actor_name}跳过了本次社交机会' if actor_name else '跳过了本次社交机会'
                is_motive = True
            else:
                current_action = row.current_action or '动态互动'
        elif row.activity_type == 'interaction':
            if row.action == 'comment':
                sub_action = 'comment'
                current_action = '文章评论'
            elif row.action == 'rate':
                sub_action = 'rate'
                current_action = '文章评分'
            elif row.action == 'annotate':
                sub_action = 'annotate'
                current_action = '文章批注'
            elif row.action == 'annotate_reply':
                sub_action = 'annotate_reply'
                current_action = '继续讨论'
            else:
                sub_action = row.action or 'interaction'
                current_action = row.current_action or '互动'

        event = _event('record' if row.activity_type == 'work' else row.activity_type,
                       'activity', row.pk, row.occurred_at, actor_key,
                       actor_name,
                       title, row.summary, status=row.status,
                       target={'kind': 'activity', 'id': row.pk,
                               'runRecordId': row.run_record_id or '',
                               'collId': row.artifact_coll_id or '',
                               'articleId': row.artifact_article_id or '',
                               'artifactId': artifact_id,
                               'artifactKind': artifact_kind})
        event['rating'] = activity_rating(row)
        if row.pk in social_reply_targets:
            event['target'].update({'collId': '', 'articleId': '', **social_reply_targets[row.pk]})
        if row.run_record_id and row.activity_type != 'work':
            event['_execution_group'] = 'activity:' + row.run_record_id
        event['currentAction'] = current_action
        event['subAction'] = sub_action
        event['isMotive'] = is_motive
        if target_author:
            event['counterpartName'] = target_author
        if row.activity_type == 'work':
            event['currentAction'] = row.current_action or ''
            metadata = row.metadata if isinstance(row.metadata, dict) else {}
            preview = str(metadata.get('outputPreview') or '').strip()
            if not preview and row.run_record and row.agent_id:
                runs = row.run_record.agent_runs if isinstance(row.run_record.agent_runs, list) else []
                preview = next((str(run.get('content') or '').strip()[:300] for run in runs
                                if isinstance(run, dict) and run.get('agent') == row.agent_id), '')
            event['outputPreview'] = preview
        events.append(event)
    from .fishing.models import FishingTrip, FishingEvent
    fishing_rows = FishingTrip.objects.filter(owner_id=owner, updated_at__gte=start, updated_at__lt=end)
    if actor_id:
        fishing_rows = fishing_rows.filter(actor_id=actor_id)
    fishing_rows = fishing_rows.prefetch_related(Prefetch('events',
        queryset=FishingEvent.objects.filter(data__catch__isnull=False).only('trip_id', 'data'),
        to_attr='caught_events'))
    from .fishing.service import authorized_trip_ids
    fishing_rows = list(fishing_rows)
    authorized_ids = authorized_trip_ids(
        [trip for trip in fishing_rows if not trip.ended_at and trip.status != 'paused'], owner,
    )
    for trip in fishing_rows:
        caught = [e.data['catch'] for e in trip.caught_events]
        counts = Counter(c['name'] for c in caught)
        catches_summary = '、'.join(f"{name} ×{count}" if count > 1 else name for name, count in counts.items()) or '尚无收获'
        detail = catches_summary
        detail += f" · 抛竿{trip.state.get('casts',0)}次"
        if trip.state.get('reason'):
            detail += ' · ' + trip.state['reason']
        title, status = '出钓归来', 'success'
        if not trip.ended_at:
            if trip.status == 'paused' or trip.pk not in authorized_ids:
                title, status = '出钓已暂停', 'paused'
                detail += ' · 请到钓鱼面板检查本机运行开关，并继续出钓'
            elif trip.state.get('error'):
                title, status = '出钓等待重试', 'paused'
            else:
                title, status = ('正在准备出钓' if trip.status == 'preparing' else '鱼王对决' if trip.status == 'duel' else '正在钓鱼'), 'running'
            if trip.state.get('error'):
                detail += ' · ' + trip.state['error']
        events.append(_event('fishing', 'fishing', trip.pk, trip.updated_at, trip.actor_id,
            trip.actor_name, title, detail,
            status=status, target={'kind':'fishing', 'id':trip.pk}))
    from .combat.models import Exploration
    from .combat.explorations import EXECUTION_COMPLETED, execution_completed
    settled_exploration_records = set(Exploration.objects.filter(
        owner_id=owner, updated_at__gte=start, updated_at__lt=end, ended_at__isnull=False,
        status__in=EXECUTION_COMPLETED,
    ).exclude(record_id='').values_list('record_id', flat=True))

    # 历史自定义任务可能没有 AgentActivity；使用执行记录补齐，而不重复已有任务卡片。
    # 自定义任务没有账号字段；只展示归属可由居民资料或已有资产确认的执行。
    run_scope = Q(agent_id__in=actors)
    runs = AgentRunRecord.objects.filter(started_at__gte=start, started_at__lt=end).filter(
        run_scope).exclude(pk__in=recorded_runs)
    runs = list(runs)
    from .daily_feed_idle import waiting_runs
    idle_waiting = waiting_runs(owner, [row.pk for row in runs if row.status == 'running'])
    for row in runs:
        event = _event('record', 'run', row.pk, row.started_at, row.agent_id,
                       row.agent_name or names.get(row.agent_id), row.task_name, row.summary,
                       status='success' if row.pk in settled_exploration_records else row.status,
                       target={'kind': 'run', 'id': row.pk})
        event['outputPreview'] = str(row.output or '')[:300]
        if row.pk in idle_waiting:
            event.update(idle_waiting[row.pk])
        events.append(event)
    completed_runs = AgentRunRecord.objects.filter(updated_at__gte=start, updated_at__lt=end,
                                                    status__in=('success', 'failed')).filter(run_scope)
    for row in completed_runs.exclude(started_at__gte=start, started_at__lt=end):
        event = _event('record', 'run-finished', row.pk, row.updated_at, row.agent_id,
                       row.agent_name or names.get(row.agent_id), f'{row.task_name}结束', row.summary,
                       status='success' if row.pk in settled_exploration_records else row.status,
                       target={'kind': 'run', 'id': row.pk})
        event['outputPreview'] = str(row.output or '')[:300]
        events.append(event)

    exploration_runs = list(Exploration.objects.filter(owner_id=owner,updated_at__gte=start,updated_at__lt=end))
    from .combat.participation import participation, display_report
    rosters = participation(exploration_runs, owner)
    for run in exploration_runs:
        when=run.ended_at or run.updated_at
        events.append(_event('exploration','exploration',run.pk,when,run.actor_id,run.actor_name,
            f'迷宫探索 · {run.elapsed_seconds//60} 分钟',display_report(run.result.get('report') or f'击败 {run.result.get("kills",0)} 只怪物，经验 {run.result.get("experience",0)}', rosters.get(run.pk)),
            status='success' if execution_completed(run.status) else 'paused' if run.status=='paused' else 'running' if run.status in ('preparing','active','settling') else 'failed',target={'kind':'exploration','id':run.pk}))
        if run.pk in rosters:
            events[-1]['explorationParty'] = rosters[run.pk]
    from .cooking_models import CookingOperation
    day_cookings = CookingOperation.objects.filter(owner_id=owner, created_at__gte=start, created_at__lt=end)
    cooking_opp_ids = day_cookings.exclude(opportunity_id='').values_list('opportunity_id', flat=True)
    cooking_actions = dict(WorldAction.objects.filter(pk__in=cooking_opp_ids).values_list('pk', 'status'))
    for row in day_cookings:
        dish_name = (row.snapshot or {}).get('name') or row.recipe_id
        stars = (row.result or {}).get('stars', 1)
        exp_gained = (row.result or {}).get('experience_gained', 0)
        parts = [f"{dish_name} ★{stars} ×1", f"经验 +{exp_gained}"]
        if "unit_price" in (row.result or {}):
            parts.append(f"回收价值 {row.result['unit_price']} 币 · 加工差额 {row.result['processing_gain']} 币")
        if (row.result or {}).get('level_after', 0) > (row.result or {}).get('level_before', 0):
            parts.append(f"厨艺升至 Lv.{row.result['level_after']}")
        if row.reason and not row.opportunity_id:
            parts.append(row.reason)
        events.append(_event('cooking', 'cooking', row.pk, row.created_at, row.actor_id,
                             names.get(row.actor_id, row.actor_name), '制作', ' · '.join(parts),
                             target={'kind': 'cooking', 'id': row.pk}))
        events[-1]['_dish'] = dish_name
        events[-1]['_stars'] = stars
        events[-1]['_exp'] = exp_gained
        if row.reason:
            events[-1]['reason'] = row.reason
        group = ('cooking:' + row.opportunity_id) if row.opportunity_id else ('cooking:' + day.isoformat() + ':' + row.actor_id)
        events[-1]['_execution_group'] = group
        if row.opportunity_id:
            events[-1]['_execution_failed'] = cooking_actions.get(row.opportunity_id) == 'failed'
            events[-1]['_execution_running'] = cooking_actions.get(row.opportunity_id) == 'claimed'
    from .alchemy_models import AlchemyOperation
    day_alchemy = AlchemyOperation.objects.filter(owner_id=owner, created_at__gte=start, created_at__lt=end)
    alchemy_ids = day_alchemy.exclude(opportunity_id='').values_list('opportunity_id', flat=True)
    alchemy_actions = dict(WorldAction.objects.filter(pk__in=alchemy_ids).values_list('pk', 'status'))
    for row in day_alchemy:
        potion_name = (row.snapshot or {}).get('name') or row.recipe_id
        stars = (row.result or {}).get('stars', 1)
        exp_gained = (row.result or {}).get('experience_gained', 0)
        parts = [f"{potion_name} ★{stars} ×1", f"炼金经验 +{exp_gained}"]
        if 'unit_price' in (row.result or {}):
            parts.append(f"回收价值 {row.result['unit_price']} 币")
        if (row.result or {}).get('level_after', 0) > (row.result or {}).get('level_before', 0):
            parts.append(f"炼金升至 Lv.{row.result['level_after']}")
        if row.reason and not row.opportunity_id:
            parts.append(row.reason)
        events.append(_event('alchemy', 'alchemy', row.pk, row.created_at, row.actor_id,
                             names.get(row.actor_id, row.actor_name), '炼制', ' · '.join(parts),
                             target={'kind': 'alchemy', 'id': row.pk}))
        events[-1]['_potion'] = potion_name
        events[-1]['_stars'] = stars
        events[-1]['_exp'] = exp_gained
        if row.reason:
            events[-1]['reason'] = row.reason
        events[-1]['_execution_group'] = ('alchemy:' + row.opportunity_id) if row.opportunity_id else ('alchemy:' + day.isoformat() + ':' + row.actor_id)
        if row.opportunity_id:
            events[-1]['_execution_failed'] = alchemy_actions.get(row.opportunity_id) == 'failed'
            events[-1]['_execution_running'] = alchemy_actions.get(row.opportunity_id) == 'claimed'
    from .blacksmith_models import BlacksmithOperation
    forged = BlacksmithOperation.objects.filter(owner_id=owner, created_at__gte=start, created_at__lt=end)
    forging_actions = dict(WorldAction.objects.filter(pk__in=forged.values_list('opportunity_id', flat=True)).values_list('pk', 'status'))
    for row in forged:
        item = (row.result or {}).get('item', {})
        quality = {'white': '白装', 'blue': '蓝装', 'gold': '金装'}.get(item.get('quality'), '')
        detail = f"{item.get('name', row.recipe_id)} · Lv.{item.get('level', '')} {quality}"
        events.append(_event('blacksmith', 'blacksmith', row.pk, row.created_at, row.actor_id,
            names.get(row.actor_id, row.actor_name), '打造装备', detail,
            target={'kind': 'blacksmith', 'id': row.opportunity_id}))
        events[-1]['reason'] = row.reason
        events[-1]['_execution_group'] = 'blacksmith:' + row.opportunity_id
        events[-1]['_execution_failed'] = forging_actions.get(row.opportunity_id) == 'failed'
        events[-1]['_execution_running'] = forging_actions.get(row.opportunity_id) == 'claimed'
    day_farms = FarmOperation.objects.filter(farm__owner_id=owner, created_at__gte=start, created_at__lt=end)
    opportunity_ids = day_farms.exclude(opportunity_id='').values_list('opportunity_id', flat=True)
    farm_actions = dict(WorldAction.objects.filter(pk__in=opportunity_ids).values_list('pk', 'status'))
    farms = day_farms.select_related('farm')
    for row in farms:
        op, result = row.operation or {}, row.result or {}
        kind = op.get('kind', '')
        parts = []
        if kind == 'expand':
            parts.append('购买 4 块耕地')
        if op.get('crop'):
            parts.append(FARM_RULES['crops'].get(str(op['crop']), {}).get('name') or str(op['crop']))
        if op.get('building'):
            parts.append(FARM_RULES['buildings'].get(str(op['building']), {}).get('name') or str(op['building']))
        if op.get('targets'):
            parts.append(f"{len(op['targets'])} 个目标")
        produced = result.get('products') or result.get('production_bonus') or []
        for item in produced if isinstance(produced, list) else []:
            if isinstance(item, dict):
                stars = f" ★{item.get('stars', 1)}" if item.get('sku', '').startswith('crop.') else ''
                parts.append(f"{item.get('name') or item.get('sku') or '产物'}{stars} × {item.get('quantity', 1)}")
        if result.get('experience_gained') is not None:
            parts.append(f"种植经验 +{result['experience_gained']}")
        # 仅对孤立未聚合操作保留原样 detail 拼入 reason；聚合组由顶层卡片统一承载规划原因
        if row.reason and not row.opportunity_id:
            parts.append(row.reason)
        events.append(_event('farm', 'farm', row.pk, row.created_at, row.farm_id,
                             names.get(row.farm_id, row.farm.actor_name), result.get('label') or FARM_LABELS.get(kind, '农场操作'),
                             ' · '.join(parts), amount=result.get('amount') if result.get('amount') not in ('0', '0.00', 0) else None,
                             target={'kind': 'farm', 'id': row.farm_id}))
        if row.reason and result.get('execution_mode') != 'queue':
            events[-1]['reason'] = row.reason
        if result.get('execution_mode') == 'queue':
            events[-1]['title'] = '按队列自动执行 · ' + events[-1]['title']
            events[-1]['detail'] += f" · 体力 -{result.get('energy_cost', 2)}"
            origins = result.get('source_plans', [])
            if origins:
                events[-1]['detail'] += ' · 来源计划 ' + '、'.join(sorted({o['day'] for o in origins}))
        events[-1]['_execution_group'] = 'farm:' + day.isoformat() + ':' + row.farm_id
        if row.opportunity_id:
            events[-1]['_execution_failed'] = farm_actions.get(row.opportunity_id) == 'failed'
            events[-1]['_execution_running'] = farm_actions.get(row.opportunity_id) == 'claimed'

    day_transactions = MarketTransaction.objects.filter(owner_id=owner, created_at__gte=start, created_at__lt=end)
    day_sessions = MarketSession.objects.filter(owner_id=owner).filter(
        Q(created_at__gte=start, created_at__lt=end) | Q(ended_at__gte=start, ended_at__lt=end) | Q(pk__in=day_transactions.values('session_id'))
    )
    # 同次任务可能有多个会话；不按分钟或角色名称猜测执行归属。
    sessions = list(MarketSession.objects.filter(owner_id=owner).filter(
        Q(pk__in=day_sessions.values('pk')) | Q(record_id__in=day_sessions.exclude(record_id=None).values('record_id'))
    ).select_related('record'))
    session_map = {row.pk: row for row in sessions}
    transactions = list(MarketTransaction.objects.filter(owner_id=owner, session_id__in=session_map))
    batch_session_ids = [row.pk for row in sessions if row.mode == 'batch']
    batch_orders = batch_operation_orders(owner, batch_session_ids)
    listing_ids = {row.operation.get('listing_id') for row in transactions
                   if isinstance(row.operation, dict) and row.operation.get('listing_id')}
    listings = {row.pk: row for row in MarketListing.objects.filter(owner_id=owner, pk__in=listing_ids)}
    for farm in AgentFarm.objects.filter(owner_id=owner):
        for plan in farm.state.get('planting_plans', {}).values():
            for row in plan.get('events', []):
                # 轮询状态供队列恢复和诊断使用，不是居民已发生的行动；
                # 在投影处过滤，也覆盖历史数据，避免重试刷新卡片时间。
                if row['code'] in {
                    'busy', 'recovered', 'resumed', 'activated', 'land', 'seeds',
                    'fertilizer', 'stamina', 'travel', 'paused', 'mcp-disabled',
                    'investment-stamina', 'investment-protected',
                }:
                    continue
                when = datetime.fromtimestamp(row['at'], SHANGHAI)
                if not start <= storage_time(when) < end:
                    continue
                events.append(_event('farm', 'farm-queue', row['id'], when, farm.pk,
                    names.get(farm.pk, farm.actor_name), 'AI规划' if row['code'] == 'planned' else '队列状态', row['detail'],
                    target={'kind': 'farm', 'id': farm.pk}))
                events[-1]['_execution_group'] = 'farm:' + day.isoformat() + ':' + farm.pk
                if row['code'] == 'planned':
                    events[-1]['reason'] = plan['versions'][0]['reason']

    for row in transactions:
        op, result = row.operation or {}, row.result or {}
        kind = op.get('kind', '')
        category = 'market' if kind in ('buy_shop', 'sell') else 'trade'
        listing = listings.get(op.get('listing_id'))
        name = result.get('name') or op.get('name') or ((listing.item or {}).get('name') if listing else '') or ''
        detail = ' · '.join(str(part) for part in (
            f'{name} × {result["quantity"]}' if name and result.get('quantity') else name,
            f'单价 {result["unit_price"]}' if result.get('unit_price') else '',
        ) if part)
        amount = next((entry.get('amount') for entry in result.get('deltas', [])
                       if entry.get('actor_id') == row.actor_id), None)
        events.append(_event(category, 'market', row.pk, row.created_at, row.actor_id,
                             row.actor_name, '归档下架' if op.get('reason') == 'agent_archive' else MARKET_LABELS.get(kind, '市场操作'), detail,
                             amount=amount, target={'kind': 'market', 'id': row.pk}))
        session = session_map[row.session_id]
        if session.mode != 'archive':
            events[-1]['_execution_group'] = 'market:' + (session.record_id or session.pk)
            if session.mode == 'batch':
                events[-1]['_execution_batch'] = True
                order = batch_orders.get(session.pk, {})
                events[-1]['_execution_order'] = order.get(operation_key(op), len(order))
        events[-1]['_execution_failed'] = bool(session.record and session.record.status == 'failed')
        seller_id = result.get('seller_id') if kind == 'buy_listing' else None
        if seller_id:
            seller_amount = next((entry.get('amount') for entry in result.get('deltas', [])
                                  if entry.get('actor_id') == seller_id), None)
            events.append(_event('trade', 'market-seller', row.pk, row.created_at, seller_id,
                                 names.get(seller_id) or (listing.seller_name if listing else ''), '居民商品售出', detail,
                                 amount=seller_amount, target={'kind': 'market', 'id': row.pk}))
            events[-1]['_execution_group'] = 'market-sale:' + (session.record_id or session.pk)
    for row in sessions:
        if row.mode == 'archive':
            continue
        group = 'market:' + (row.record_id or row.pk)
        event = _event('market', 'market-enter', row.pk, row.created_at, row.actor_id,
                       row.actor_name, '进入市场', target={'kind': 'market', 'id': row.pk})
        event.update(_execution_group=group, _execution_order=-1,
                     _execution_running=row.status == 'active',
                     _execution_failed=bool(row.record and row.record.status == 'failed'))
        if row.mode == 'batch':
            event['_execution_batch'] = True
        events.append(event)
        if row.ended_at:
            interrupted = row.reason == PROCESS_INTERRUPTED
            leave_reason = public_leave_reason(row.reason, row.record.summary if row.record else '')
            if row.mode == 'batch' and row.reason == '按日计划批量执行完成':
                leave_reason = ''
            event = _event('market', 'market-session', row.pk, row.ended_at, row.actor_id,
                           row.actor_name, '市场会话中断' if interrupted else '离开市场',
                           leave_reason,
                           target={'kind': 'market', 'id': row.pk})
            event['_execution_group'] = group
            event['_execution_order'] = 1_000_000_000
            event['_execution_failed'] = interrupted
            if row.mode == 'batch':
                event['_execution_batch'] = True
            events.append(event)

    decisions = list(InvestmentDecision.objects.filter(owner_id=owner, created_at__gte=start, created_at__lt=end).select_related('record'))
    decision_ids = [row.pk for row in decisions]
    trades_by_decision = {pk: [] for pk in decision_ids}
    for trade in InvestmentTrade.objects.filter(owner_id=owner, decision_id__in=decision_ids).order_by('created_at', 'pk'):
        trades_by_decision[trade.decision_id].append(trade)
    covered_investment_charges = set()
    for row in decisions:
        # 兼容尚未经过后台修复的旧决策，执行记录结束后不再投影为研究中。
        if row.status == 'running' and row.record and row.record.status in ('success', 'failed'):
            row.status = row.record.status
            row.reason = row.reason or row.record.summary
        trades = trades_by_decision[row.pk]
        covered_investment_charges.update('investment:' + trade.pk for trade in trades
                                          if start <= trade.created_at < end)
        amount = sum((Decimal(str(trade.result.get('cash_delta') or '0'))
                      for trade in trades if isinstance(trade.result, dict)), Decimal('0'))
        title = (f'A股投资 · {len(trades)} 笔成交' if trades else
                 'A股投资 · 研究中' if row.status == 'running' else
                 'A股投资 · 观望' if row.status == 'success' else 'A股投资 · 未成交')
        events.append(_event('investment', 'investment-decision', row.pk, row.created_at,
                             row.actor_id, row.actor_name, title, _investment_detail(row, trades),
                             status=row.status, amount=amount if amount else None,
                             target={'kind': 'investment', 'id': row.pk}))

    journeys = list(_journeys_in_window(owner, start, end))
    charge_keys = [f'travel:{row.pk}:{kind}' for row in journeys for kind in ('depart', 'shopping')]
    charges = {row.pk: row for row in WorldLedger.objects.filter(pk__in=charge_keys)}
    covered_travel_charges = set()
    for row in journeys:
        snapshot = row.snapshot if isinstance(row.snapshot, dict) else {}
        selected = snapshot.get('selected') if isinstance(snapshot.get('selected'), dict) else {}
        destination = ' · '.join(str(value) for value in (selected.get('country'), selected.get('city')) if value)
        journey_charges = [charges[key] for key in (f'travel:{row.pk}:depart', f'travel:{row.pk}:shopping')
                           if key in charges]
        covered_travel_charges.update(charge.pk for charge in journey_charges)
        amount = sum((charge.amount for charge in journey_charges), start=0)
        events.append(_event('travel', 'journey', row.pk, _journey_event_time(row), row.actor_id,
                             snapshot.get('agent_name') or names.get(row.actor_id),
                             f'旅行 · {destination}' if destination else '旅行筹备',
                             _travel_detail(row, snapshot),
                             status={'completed': 'success', 'skipped': 'skipped', 'active': 'running'}.get(row.status, row.status),
                             amount=amount if amount else None,
                             target={'kind': 'travel', 'id': row.pk}))

    ledger = list(WorldLedger.objects.filter(created_at__gte=start, created_at__lt=end,
                                             agent_id__in=actors).exclude(kind='opening').exclude(amount=0))
    from .market_finance import classify_market_ledger_entries
    classify_market_ledger_entries(ledger, owner)
    from .ledger_details import ledger_details
    descriptions = ledger_details(ledger, owner)
    travel_ids = {row.snapshot.get('journey_id') for row in ledger
                  if row.kind in ('travel', 'souvenir') and isinstance(row.snapshot, dict)
                  and row.snapshot.get('journey_id')}
    owned_travel_ids = set(TravelJourney.objects.filter(owner_id=owner, pk__in=travel_ids).values_list('pk', flat=True))
    for row in ledger:
        snapshot = row.snapshot if isinstance(row.snapshot, dict) else {}
        description = descriptions.get(row.pk, '')
        ledger_label = (('农场收入' if row.amount > 0 else '农场支出') if row.kind == 'farm' else
                        ('市场收入' if row.amount > 0 else '市场支出') if row.kind == 'market' else
                        LEDGER_LABELS.get(row.kind, '收入' if row.amount > 0 else '支出'))
        if row.kind == 'lottery':
            ledger_label = '大乐透购票' if row.amount < 0 else '大乐透中奖'
        entry = _event('finance', 'ledger', row.pk, row.created_at, row.agent_id,
                       row.agent_name or names.get(row.agent_id),
                       ledger_label,
                       description, amount=row.amount,
                       target=None)
        # 资金视角始终完整；总时间线用业务事实代表对应扣款，避免同一笔成交出现两次。
        if row.kind in ('market', 'farm') or (row.kind == 'investment' and row.pk in covered_investment_charges) or (row.kind in ('travel', 'souvenir') and (row.pk in covered_travel_charges or snapshot.get('journey_id') in owned_travel_ids)):
            entry['_finance_only'] = True
        events.append(entry)

    from .combat.reservation_models import AdventureReservation
    for appointment in AdventureReservation.objects.filter(owner_id=owner, updated_at__gte=start, updated_at__lt=end):
        for member_id, member in appointment.snapshot.get('members', {}).items():
            events.append(_event('record', 'adventure-reservation', appointment.pk+':'+member_id, appointment.updated_at, member_id, names.get(member_id),
                '组队探索预约：'+{'reserved':'已确认','preparing':'准备中','active':'已出发','completed':'已结束','cancelled':'已取消'}.get(appointment.status, appointment.status),
                '队友：'+'、'.join(m['name'] for m in appointment.snapshot['members'].values())+'；出发 '+local_time(appointment.starts_at).strftime('%H:%M')+'，返回 '+local_time(appointment.ends_at).strftime('%H:%M'),
                status=appointment.status, target={'kind':'life','id':member['item_id']}))

    revisions = list(LifeRevision.objects.filter(item__owner_id=owner, created_at__gte=start,
                                                  created_at__lt=end).select_related('item'))
    revised_terminal_ids = {row.item_id for row in revisions
                            if (row.after or {}).get('status') in ('rest', 'failed', 'cancelled')
                            and (row.before or {}).get('status') != (row.after or {}).get('status')}
    life_rows = LifeItem.objects.filter(owner_id=owner, updated_at__gte=start, updated_at__lt=end,
                                        status__in=('rest', 'failed', 'cancelled'))
    for row in life_rows:
        if row.pk in revised_terminal_ids or (row.record_id and row.status == 'failed'):
            continue
        events.append(_event('record', 'life', row.pk, row.updated_at, row.actor_id,
                             names.get(row.actor_id), {'rest': '选择休息', 'failed': '行动未完成', 'cancelled': '安排已取消'}[row.status],
                             row.intent, status=row.status, target={'kind': 'life', 'id': row.pk}))
    for row in revisions:
        before, after = row.before or {}, row.after or {}
        if before.get('status') == after.get('status') and before.get('scheduled_at') == after.get('scheduled_at'):
            continue
        status = after.get('status', 'success')
        if status in ('completed', 'failed') and row.item.record_id:
            continue
        title = {'rest': '选择休息', 'failed': '行动未完成', 'cancelled': '安排已取消',
                 'completed': '完成安排', 'paused': '居民暂停'}.get(status, '生活安排调整')
        events.append(_event('record', 'life-revision', row.pk, row.created_at,
                             row.item.actor_id, names.get(row.item.actor_id), title, row.reason,
                             status=status, target={'kind': 'life', 'id': row.item_id}))

    from .daily_feed_groups import grouped_execution_events
    events = grouped_execution_events(events, start, end)
    global_events = [event for event in events if event['category'] != 'record' and not event.get('_finance_only')]
    summary_events = global_events
    actor_counts = dict(Counter(identity for event in summary_events
                                for identity in (event.get('actorIds') or [event['actorId']]) if identity))
    if actor_id:
        events = [event for event in events if event['actorId'] == actor_id or actor_id in event.get('actorIds', [])]
    counts = Counter(category for event in events for category in event.get('categories', [event['category']]))
    all_events = [event for event in events if event['category'] != 'record' and not event.get('_finance_only')]
    all_events.sort(key=lambda event: (event['occurredAt'], event['id']), reverse=True)
    for event in events:
        event.pop('_finance_only', None)
    return all_events, sorted(events, key=lambda event: (event['occurredAt'], event['id']), reverse=True), dict(counts), len(summary_events), actor_counts
