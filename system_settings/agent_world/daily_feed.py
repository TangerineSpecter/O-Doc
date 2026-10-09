"""投影居民已发生的业务事实，不复制账本或执行记录。"""
from collections import Counter
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Q

from article.access import get_visible_anthology_queryset
from system_settings.models import Agent, AgentActivity, AgentRunRecord, AgentTask, WorldAction
from .farm_models import AgentFarm, FarmOperation
from .investment_models import InvestmentAccount, InvestmentDecision, InvestmentTrade
from .life_models import LifeItem, LifeProfile, LifeRevision
from .life_config import task_owner
from .life_time import SHANGHAI, local_time, storage_time
from .market_models import MarketListing, MarketSession, MarketTransaction
from .models import WorldLedger
from .travel_models import TravelJourney


CATEGORIES = {'publication', 'interaction', 'travel', 'farm', 'cooking', 'market', 'trade', 'investment', 'finance', 'record'}
MARKET_LABELS = {
    'buy_shop': '商店购买', 'sell': '商店回收', 'list': '居民上架',
    'buy_listing': '购买居民商品', 'reprice': '调整挂牌价格', 'withdraw': '撤回挂牌',
}
FARM_LABELS = {
    'plant': '播种', 'water': '浇水', 'harvest': '收获', 'feed': '喂养',
    'collect': '领取畜牧产物', 'expand': '扩建农场', 'build': '建造', 'upgrade': '升级',
    'buy_supply': '购买农资', 'buy_animal': '购买动物', 'sell': '出售农产品',
}
LEDGER_LABELS = {
    'post': '作品收入', 'comment': '评论收入', 'prize': '月榜奖金',
    'travel': '旅行费用', 'souvenir': '旅行购物', 'farm': '农场支出',
    'market': '市场收支', 'investment': '投资成交',
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


def latest_event_day(request, owner, before, category='all'):
    """通过各业务表最近的时间索引跳过没有活动的日期。"""
    actors = _actor_scope(owner)
    visible_colls = get_visible_anthology_queryset(request).values_list('coll_id', flat=True)
    candidates = []

    def collect(queryset, field):
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
        collect(AgentActivity.objects.filter(activity_scope | visible_scope | Q(action__startswith='social_', metadata__owner_id=owner)), 'occurred_at')
    if category == 'record':
        records = AgentRunRecord.objects.filter(agent_id__in=actors)
        collect(records, 'started_at')
        collect(records.filter(status__in=('success', 'failed')), 'updated_at')
        collect(LifeItem.objects.filter(owner_id=owner, status__in=('rest', 'failed', 'cancelled')), 'updated_at')
        collect(LifeRevision.objects.filter(item__owner_id=owner), 'created_at')
    if category in ('all', 'cooking'):
        from .cooking_models import CookingOperation
        collect(CookingOperation.objects.filter(owner_id=owner), 'created_at')
    if category in ('all', 'farm'):
        collect(FarmOperation.objects.filter(farm__owner_id=owner), 'created_at')
    if category in ('all', 'market', 'trade'):
        collect(MarketTransaction.objects.filter(owner_id=owner), 'created_at')
    if category in ('all', 'market', 'trade'):
        # 交易归并卡片可能移动到跨日会话结束日，日期索引须覆盖该日期。
        sessions = MarketSession.objects.filter(owner_id=owner)
        collect(sessions, 'created_at')
        collect(sessions, 'ended_at')
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
        collect(ledger, 'created_at')
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
    ids = set(LifeProfile.objects.filter(owner_id=owner).values_list('id', flat=True))
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


def day_events(request, owner, day, actor_id=''):
    """每条事件引用稳定业务主键；筛选发生于聚合后，避免账目视角重复计数。"""
    start, end = _window(day)
    actors = _actor_scope(owner)
    names = dict(Agent.objects.filter(pk__in=actors).values_list('id', 'name'))
    events = []
    visible_colls = get_visible_anthology_queryset(request).values_list('coll_id', flat=True)
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
    # 历史自定义任务可能没有 AgentActivity；使用执行记录补齐，而不重复已有任务卡片。
    # 自定义任务没有账号字段；只展示归属可由居民资料或已有资产确认的执行。
    run_scope = Q(agent_id__in=actors)
    runs = AgentRunRecord.objects.filter(started_at__gte=start, started_at__lt=end).filter(
        run_scope).exclude(pk__in=recorded_runs)
    for row in runs:
        event = _event('record', 'run', row.pk, row.started_at, row.agent_id,
                       row.agent_name or names.get(row.agent_id), row.task_name, row.summary,
                       status=row.status, target={'kind': 'run', 'id': row.pk})
        event['outputPreview'] = str(row.output or '')[:300]
        events.append(event)
    completed_runs = AgentRunRecord.objects.filter(updated_at__gte=start, updated_at__lt=end,
                                                    status__in=('success', 'failed')).filter(run_scope)
    for row in completed_runs.exclude(started_at__gte=start, started_at__lt=end):
        event = _event('record', 'run-finished', row.pk, row.updated_at, row.agent_id,
                       row.agent_name or names.get(row.agent_id), f'{row.task_name}结束', row.summary,
                       status=row.status, target={'kind': 'run', 'id': row.pk})
        event['outputPreview'] = str(row.output or '')[:300]
        events.append(event)

    from .cooking_models import CookingOperation
    for row in CookingOperation.objects.filter(owner_id=owner, created_at__gte=start, created_at__lt=end):
        detail = f"经验 +{row.result['experience_gained']} · {row.reason}"
        if "unit_price" in row.result:
            detail += f" · 回收价值 {row.result['unit_price']} 币 · 加工差额 {row.result['processing_gain']} 币"
        if row.result['level_after'] > row.result['level_before']:
            detail += f" · 厨艺升至 Lv.{row.result['level_after']}"
        events.append(_event('cooking', 'cooking', row.pk, row.created_at, row.actor_id,
                             names.get(row.actor_id, row.actor_name), row.snapshot['name'] + f" ★{row.result.get('stars', 1)} ×1", detail,
                             target={'kind': 'cooking', 'id': row.pk}))
    day_farms = FarmOperation.objects.filter(farm__owner_id=owner, created_at__gte=start, created_at__lt=end)
    opportunity_ids = day_farms.exclude(opportunity_id='').values_list('opportunity_id', flat=True)
    farm_actions = dict(WorldAction.objects.filter(pk__in=opportunity_ids).values_list('pk', 'status'))
    farms = FarmOperation.objects.filter(farm__owner_id=owner).filter(
        Q(opportunity_id__in=opportunity_ids) | Q(opportunity_id='', created_at__gte=start, created_at__lt=end)
    ).select_related('farm')
    for row in farms:
        op, result = row.operation or {}, row.result or {}
        kind = op.get('kind', '')
        parts = []
        if op.get('crop'):
            parts.append(str(op['crop']))
        if op.get('building'):
            parts.append(str(op['building']))
        if op.get('targets'):
            parts.append(f"{len(op['targets'])} 个目标")
        produced = result.get('products') or result.get('production_bonus') or []
        for item in produced if isinstance(produced, list) else []:
            if isinstance(item, dict):
                stars = f" ★{item.get('stars', 1)}" if item.get('sku', '').startswith('crop.') else ''
                parts.append(f"{item.get('name') or item.get('sku') or '产物'}{stars} × {item.get('quantity', 1)}")
        if result.get('experience_gained') is not None:
            parts.append(f"种植经验 +{result['experience_gained']}")
        if row.reason:
            parts.append(row.reason)
        events.append(_event('farm', 'farm', row.pk, row.created_at, row.farm_id,
                             names.get(row.farm_id, row.farm.actor_name), result.get('label') or FARM_LABELS.get(kind, '农场操作'),
                             ' · '.join(parts), amount=result.get('amount') if result.get('amount') not in ('0', '0.00', 0) else None,
                             target={'kind': 'farm', 'id': row.farm_id}))
        if row.opportunity_id:
            events[-1]['_execution_group'] = 'farm:' + row.opportunity_id
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
    listing_ids = {row.operation.get('listing_id') for row in transactions
                   if isinstance(row.operation, dict) and row.operation.get('listing_id')}
    listings = {row.pk: row for row in MarketListing.objects.filter(owner_id=owner, pk__in=listing_ids)}
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
                             row.actor_name, MARKET_LABELS.get(kind, '市场操作'), detail,
                             amount=amount, target={'kind': 'market', 'id': row.pk}))
        session = session_map[row.session_id]
        events[-1]['_execution_group'] = 'market:' + (session.record_id or session.pk)
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
        group = 'market:' + (row.record_id or row.pk)
        event = _event('market', 'market-enter', row.pk, row.created_at, row.actor_id,
                       row.actor_name, '进入市场', target={'kind': 'market', 'id': row.pk})
        event.update(_execution_group=group, _execution_running=row.status == 'active',
                     _execution_failed=bool(row.record and row.record.status == 'failed'))
        events.append(event)
        if row.ended_at:
            event = _event('market', 'market-session', row.pk, row.ended_at, row.actor_id,
                           row.actor_name, '离开市场', row.reason,
                           target={'kind': 'market', 'id': row.pk})
            event['_execution_group'] = group
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
    from .ledger_details import ledger_details
    descriptions = ledger_details(ledger, owner)
    travel_ids = {row.snapshot.get('journey_id') for row in ledger
                  if row.kind in ('travel', 'souvenir') and isinstance(row.snapshot, dict)
                  and row.snapshot.get('journey_id')}
    owned_travel_ids = set(TravelJourney.objects.filter(owner_id=owner, pk__in=travel_ids).values_list('pk', flat=True))
    for row in ledger:
        snapshot = row.snapshot if isinstance(row.snapshot, dict) else {}
        description = descriptions.get(row.pk, '')
        entry = _event('finance', 'ledger', row.pk, row.created_at, row.agent_id,
                       row.agent_name or names.get(row.agent_id),
                       LEDGER_LABELS.get(row.kind, '收入' if row.amount > 0 else '支出'),
                       description, amount=row.amount,
                       target=None)
        # 资金视角始终完整；总时间线用业务事实代表对应扣款，避免同一笔成交出现两次。
        if row.kind in ('market', 'farm') or (row.kind == 'investment' and row.pk in covered_investment_charges) or (row.kind in ('travel', 'souvenir') and (row.pk in covered_travel_charges or snapshot.get('journey_id') in owned_travel_ids)):
            entry['_finance_only'] = True
        events.append(entry)

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
    actor_counts = dict(Counter(event['actorId'] for event in summary_events if event['actorId']))
    if actor_id:
        events = [event for event in events if event['actorId'] == actor_id]
    counts = Counter(category for event in events for category in event.get('categories', [event['category']]))
    all_events = [event for event in events if event['category'] != 'record' and not event.get('_finance_only')]
    all_events.sort(key=lambda event: (event['occurredAt'], event['id']), reverse=True)
    for event in events:
        event.pop('_finance_only', None)
    return all_events, sorted(events, key=lambda event: (event['occurredAt'], event['id']), reverse=True), dict(counts), len(summary_events), actor_counts
