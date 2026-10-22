"""One piece at a time, with durable choices and service-owned atomic commits."""
import copy
import hashlib
import json
import logging
import uuid
from contextlib import nullcontext
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from system_settings.models import Agent, AgentExecutionLease, AgentRunRecord, WorldAction, WorldActionRuntime
from system_settings.agent_activity import update_work_activity
from .execution import WorldLeaseBusy, defer_when_world_busy, execution_lease
from .farm_gate import farm_gate, guarded
from .run_diagnostics import finish_record, progress

logger = logging.getLogger(__name__)
MAX_DECISION_FAILURES = 3


def item_for(action):
    from .life_models import LifeItem
    identity = action.snapshot.get('life_item_id')
    return LifeItem.objects.filter(pk=identity, actor_id=action.actor_id).first() if identity else None


def pending_manual_item(task, actor_id: str, owner: str):
    """A manual retry may only reauthorize this task's own retained checkpoint."""
    from .life_models import LifeItem
    from .life_schedule import execution_key
    if task.task_kind != 'blacksmith' or task.blacksmith_config.get('owner_id') != owner:
        return None
    actions = list(WorldAction.objects.filter(task_id=task.pk, actor_id=actor_id, status='claimed',
        snapshot__blacksmith=True, snapshot__owner_id=owner, snapshot__manual=True)
        .only('id', 'snapshot').order_by('created_at', 'id'))
    items = {item.pk: item for item in LifeItem.objects.filter(
        pk__in=[action.snapshot.get('life_item_id') for action in actions], owner_id=owner,
        actor_id=actor_id, task_id=task.pk, activity='blacksmith', status='running', context__manual=True)}
    for action in actions:
        item = items.get(action.snapshot.get('life_item_id'))
        if (item is not None and item.context.get('manual') is True
                and action.snapshot.get('manual') is True and execution_key(item) == action.pk):
            return item
    return None


def clear_if_cancelled(action, scheduler=None):
    """Execution permission gates work, while explicit cancellation can still release stock."""
    from system_settings.models import AgentTask
    from .life_models import LifeConfig
    from .life_schedule import OPEN
    reason = None
    if not Agent.objects.filter(pk=action.actor_id, archived_at__isnull=True).exists():
        reason = '居民已删除或归档'
    elif not action.task_id or not AgentTask.objects.filter(pk=action.task_id, enabled=True).exists():
        reason = '打造能力已停用或删除'
    else:
        item = item_for(action)
        if item and (item.status not in OPEN or item.status == 'paused'):
            reason = '本次生活活动已取消、暂停或结束'
        elif action.actor_id in (LifeConfig.objects.filter(pk=action.snapshot['owner_id'])
                                 .values_list('paused_agents', flat=True).first() or []):
            reason = '居民已暂停'
    if reason is None:
        return False
    finish(action, scheduler, reason='打造停止，已完成装备保留：' + reason)
    return True


def require_ready(action, agent):
    from .blacksmith_authorization import require_authorized
    require_authorized(action.pk, manual=bool(action.snapshot.get('manual')))
    from system_settings.agent_availability import require_active_agent
    from system_settings.models import SystemSetting
    from .life_scope import allowed, check_current_authorization
    require_active_agent(agent)
    action.task.refresh_from_db()
    if not action.task.enabled or not allowed(action.task, agent.pk):
        raise ValueError('打造能力已停用或居民已暂停')
    check_current_authorization()
    item = item_for(action)
    if item:
        from .life_scope import check_item_authorization
        check_item_authorization(item)
    setting = SystemSetting.objects.filter(key='system_mcp_config').first()
    if setting and not (setting.value or {}).get('enabled', True):
        raise ValueError('系统 MCP 已关闭')
    if not action.snapshot.get('manual'):
        if item:
            from .life_activities import is_interleaved
            from .life_interleaving_candidates import available_window
            from .life_time import local_time
            marker = item.context.get('interleaving', {})
            if is_interleaved(item) and (not available_window(item.owner_id, agent.pk, exclude_item=item.pk)
                    or local_time(datetime.fromisoformat(marker['expires_at'])) <= local_time()):
                raise ValueError('本次打造的日程空档已结束')


def facts_for(action, agent):
    from .blacksmith_candidates import planning_facts
    item = item_for(action)
    facts = planning_facts(action.snapshot['owner_id'], agent,
        exclude_ids=[item.pk] if item else [], exclude_action_id=action.pk)
    if not action.snapshot.get('manual'):
        from .life_commitments import capacity
        facts['energy'] = min(facts['energy'], capacity(action.snapshot['owner_id'], agent,
                              exclude_item=item.pk if item else None)['energy'])
    return facts


def save_stage(action, agent, *, phase: str, current: dict, decision=None):
    expected = action.updated_at
    with farm_gate(), transaction.atomic():
        locked = WorldAction.objects.select_for_update().get(pk=action.pk)
        if locked.status != 'claimed' or locked.updated_at != expected:
            raise ValueError('打造状态在决策期间发生变化，旧响应已丢弃')
        require_ready(locked, agent)
        if phase in ('type', 'commit'):
            from .blacksmith_candidates import recipe_options, template_options
            facts = facts_for(locked, agent)
            rule = current['rule']
            legal = recipe_options({current['recipe_id']: rule}, facts['catalog'], facts['profile'],
                                   facts['pool'], facts['energy'])
            if current['recipe_id'] not in legal:
                raise ValueError('决策期间当前件材料或职业路线已失效')
            if phase == 'commit':
                templates = {row['template_id'] for row in template_options(facts['catalog'], facts['profile'], rule)}
                if current['template_id'] not in templates:
                    raise ValueError('决策期间所选装备类型已失效')
                free = {row['inventory_id']: row for row in facts['pool']}
                if any(free.get(row['inventory_id'], {}).get('quantity', 0) < row['quantity']
                       or free.get(row['inventory_id'], {}).get('price') != row['price']
                       for row in current['snapshot']['materials']):
                    raise ValueError('决策期间已确认材料发生变化')
        snapshot = copy.deepcopy(locked.snapshot)
        snapshot.update(phase=phase, current=current)
        snapshot.pop('retry_at', None)
        if decision:
            snapshot['decisions'] = [*snapshot['decisions'], decision]
        locked.snapshot = snapshot
        locked.save(update_fields=['snapshot', 'updated_at'])
    action.refresh_from_db()


def equipment_summary(profile, *, slot=None):
    """Bound the equipment context while retaining the resident's actual gaps."""
    from collections import Counter
    from .combat.models import EquipmentInstance
    loadout = profile.loadout or {}
    rows = EquipmentInstance.objects.filter(owner_id=profile.owner_id, actor_id=profile.pk, sold=False)
    def summary(row):
        item = row.snapshot or {}
        return {'id': row.pk, 'name': item.get('name', ''), 'slot': item.get('slot'),
                'equipment_type': item.get('equipment_type'), 'level': item.get('level'),
                'quality': item.get('quality'), 'stats': item.get('stats', {})}
    worn = {row.pk: summary(row) for row in rows.filter(pk__in=loadout.values())}
    counts = Counter((row.snapshot or {}).get('slot', '') for row in rows.only('snapshot'))
    stock = rows.exclude(pk__in=loadout.values())
    if slot:
        if slot in ('ring', 'ring_1', 'ring_2'):
            stock = stock.filter(snapshot__slot='accessory', snapshot__equipment_type='ring')
        elif slot == 'accessory':
            stock = stock.filter(snapshot__slot='accessory')
        else:
            stock = stock.filter(snapshot__slot=slot)
    else:
        stock = stock.none()
    slots = ('weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory', 'ring_1', 'ring_2')
    return {'loadout': {key: worn.get(loadout.get(key)) for key in slots},
            'owned_by_slot': dict(counts), 'same_slot_stock': [summary(row) for row in stock.order_by('-created_at', 'id')[:12]]}


def operations(action):
    from .blacksmith_models import BlacksmithOperation
    return list(BlacksmithOperation.objects.filter(opportunity_id=action.pk).order_by('piece_index'))


@guarded
@transaction.atomic
def finish(action, scheduler=None, *, reason=None, failed=False):
    action = WorldAction.objects.select_for_update().get(pk=action.pk)
    rows = operations(action)
    if reason is not None:
        action.status = 'failed' if failed else 'success' if rows else 'skipped'
        action.snapshot = {**action.snapshot, 'phase': 'done', 'current': {}}
        action.snapshot.pop('retry_at', None)
    action.result = {**action.result, 'reason': reason or action.result.get('reason', '本次打造已结束'),
        'pieces_made': len(rows), 'stages': copy.deepcopy(action.snapshot.get('decisions', [])), 'operations': [
            {'id': row.pk, 'recipe_id': row.recipe_id, 'piece_index': row.piece_index,
             'snapshot': row.snapshot, 'result': row.result, 'reason': row.reason} for row in rows]}
    action.effects_done = True
    action.save(update_fields=['status', 'snapshot', 'result', 'effects_done', 'updated_at'])
    if action.record:
        record = action.record
        status = 'failed' if failed or action.status == 'failed' else 'success'
        summary = f'已打造 {len(rows)} 件装备。' + action.result['reason']
        finish_record(record, status, summary, json.dumps(action.result, ensure_ascii=False), '铁匠铺打造结束')
        if action.agent:
            update_work_activity(record, action.agent, status=status, summary=summary,
                                 current_action='打造结束', output=record.output)


def advance(action, agent, agent_token, world_token, scheduler=None):
    from .blacksmith_catalog import MAX_PIECES
    from .blacksmith_candidates import recipe_options, template_options
    from .blacksmith_decisions import choose
    from .alchemy_materials import allocate
    from .blacksmith_service import commit_piece
    while action.status == 'claimed':
        action.refresh_from_db()
        require_ready(action, agent)
        phase, cursor = action.snapshot['phase'], action.snapshot['cursor']
        if phase == 'done' or cursor >= MAX_PIECES:
            finish(action, scheduler, reason='已达到本次最多 3 件的上限。')
            return
        if phase == 'commit':
            current = action.snapshot['current']
            progress(action.record, '正在打造装备', f'第 {cursor + 1}/{MAX_PIECES} 件')
            reason = current.get('reason', '系统选择说明：按本件已确认的合法选择打造。')
            commit_piece(agent.pk, action.pk, cursor, current['recipe_id'], current['snapshot'],
                         reason, action.task, agent_token, world_token)
            action.refresh_from_db()
            continue
        facts = facts_for(action, agent)
        options = recipe_options(facts['rules'], facts['catalog'], facts['profile'], facts['pool'], facts['energy'])
        if not options:
            finish(action, scheduler, reason='当前没有材料、体力和职业路线均满足的打造选项。')
            return
        current = copy.deepcopy(action.snapshot['current'])
        rows = operations(action)
        state = {'piece_number': cursor + 1, 'max_pieces': MAX_PIECES,
                 'completed': [{'result': row.result, 'recipe_id': row.recipe_id} for row in rows],
                 'preferences': action.task.prompt or '', 'energy_allowance': str(facts['energy']),
                 'life_preferences': facts.get('preferences', ''),
                 'personality': (getattr(agent, 'role_profile', {}) or {}).get('personality', ''),
                 'job': facts['profile'].progression['job'],
                 'character_level': facts['profile'].progression['level']}
        state['equipment'] = equipment_summary(facts['profile'], slot=current.get('rule', {}).get('slot'))
        if phase == 'continue':
            decision = choose(action, agent, phase, state, {'continue': '继续打造下一件', 'finish': '结束本次打造'})
            if decision['choice'] == 'finish':
                save_stage(action, agent, phase='done', current={}, decision=decision)
                finish(action, scheduler, reason='居民选择结束本次打造。')
                return
            save_stage(action, agent, phase='band', current={}, decision=decision)
        elif phase == 'band':
            bands = {}
            for rule in options.values():
                bands.setdefault(rule['band_id'], {'name': rule.get('band_label', rule['band_id']),
                    'level_min': rule['level_min'], 'level_max': rule['level_max']})
            decision = choose(action, agent, phase, state, bands)
            save_stage(action, agent, phase='slot', current={'band_id': decision['choice']}, decision=decision)
        elif phase == 'slot':
            slots = {key: {k: copy.deepcopy(value) for k, value in rule.items() if k not in ('types', 'max_pieces')}
                     for key, rule in options.items() if rule['band_id'] == current['band_id']}
            if not slots:
                raise ValueError('已选等级档的材料或合法类型已失效')
            decision = choose(action, agent, phase, state, slots)
            rule = copy.deepcopy(slots[decision['choice']])
            current.update(recipe_id=decision['choice'], rule=rule,
                reservation={'ingredients': [{'sku': row['sku'], 'quantity': row['quantity']} for row in rule['ingredients']]})
            save_stage(action, agent, phase='type', current=current, decision=decision)
        elif phase == 'type':
            rule = current['rule']
            if current['recipe_id'] not in recipe_options({current['recipe_id']: rule}, facts['catalog'],
                    facts['profile'], facts['pool'], facts['energy']):
                raise ValueError('已选打造部位的材料或体力已不足')
            types = {row['template_id']: row for row in template_options(facts['catalog'], facts['profile'], rule)}
            if not types:
                raise ValueError('已选打造部位没有合法装备类型')
            decision = choose(action, agent, phase, {**state, 'recipe': rule}, types)
            template = types[decision['choice']]
            snapshot = {'version': 1, 'rule': copy.deepcopy(rule), 'catalog_id': facts['catalog'].version,
                'template_id': template['template_id'], 'level_min': template['level_min'], 'level_max': template['level_max'],
                'job': facts['profile'].progression['job'],
                'materials': allocate(copy.deepcopy(facts['pool']), rule['ingredients']),
                'quality_rules': {'version': 1, 'white': 70, 'blue': 25, 'gold': 5}}
            current.update(template_id=template['template_id'], snapshot=snapshot, reason=decision['reason'])
            save_stage(action, agent, phase='commit', current=current, decision=decision)
        else:
            raise ValueError('未知打造阶段')


def resume(action, scheduler=None, *, locked=False):
    from .blacksmith_authorization import authorized, BlacksmithAuthorizationRequired
    if not authorized(action.pk, manual=bool(action.snapshot.get('manual'))):
        clear_if_cancelled(action, scheduler)
        return action.record
    if not locked:
        with execution_lease(WorldActionRuntime, {'pk': 'world'}) as world:
            if not world:
                return action.record
            return resume(action, scheduler, locked=world)
    agent = Agent.objects.filter(pk=action.actor_id, archived_at__isnull=True).first()
    if not agent or not action.task:
        finish(action, scheduler, reason='居民或打造能力已不可用，已完成装备保留。')
        action.refresh_from_db()
        return action.record
    item = item_for(action)
    from .life_scope import life_scope
    scope = life_scope(item, {}) if item else nullcontext()
    with scope:
        try:
            with execution_lease(AgentExecutionLease, {'agent': agent}) as token:
                if not token:
                    return action.record
                advance(action, agent, token, locked, scheduler)
        except Exception as exc:
            from system_settings.decision.jev import DecisionUnavailable
            action.refresh_from_db()
            if isinstance(exc, BlacksmithAuthorizationRequired) or not authorized(
                    action.pk, manual=bool(action.snapshot.get('manual'))):
                clear_if_cancelled(action, scheduler)
                return action.record
            if isinstance(exc, DecisionUnavailable):
                question = f'{action.snapshot["cursor"]}:{action.snapshot["phase"]}'
                failures = {**action.snapshot.get('decision_failures', {})}
                failures[question] = failures.get(question, 0) + 1
                action.snapshot = {**action.snapshot, 'decision_failures': failures}
                if failures[question] >= MAX_DECISION_FAILURES:
                    action.save(update_fields=['snapshot', 'updated_at'])
                    finish(action, scheduler, reason='同一步打造决策连续三次不可用，本次停止；已完成装备保留。', failed=True)
                else:
                    action.snapshot['retry_at'] = (timezone.now() + timedelta(minutes=5 * failures[question])).isoformat()
                    action.result = {**action.result, 'reason': '打造决策暂不可用，等待接续；已完成装备保留。'}
                    action.save(update_fields=['snapshot', 'result', 'updated_at'])
                    progress(action.record, '等待打造决策恢复', str(exc)[:200])
            else:
                logger.warning('打造停止 action=%s reason=%s', action.pk, str(exc))
                finish(action, scheduler, reason='打造停止，已完成装备保留：' + str(exc)[:250],
                       failed=not isinstance(exc, ValueError))
    action.refresh_from_db()
    if action.record:
        action.record.refresh_from_db()
    return action.record


def run_blacksmith_opportunity(task, scheduler=None, *, key=None, manual=False, locked=False):
    key = key or hashlib.sha256(f'blacksmith-manual:{uuid.uuid4()}'.encode()).hexdigest()
    if not locked:
        with execution_lease(WorldActionRuntime, {'pk': 'world'}) as world:
            if world:
                return run_blacksmith_opportunity(task, scheduler, key=key, manual=manual, locked=world)
        if defer_when_world_busy.get():
            raise WorldLeaseBusy()
        return None
    action = WorldAction.objects.filter(pk=key).first()
    if action:
        from .blacksmith_authorization import authorize, authorized
        if manual and action.snapshot.get('manual'):
            authorize(action.pk)
        if not authorized(action.pk, manual=bool(action.snapshot.get('manual'))):
            clear_if_cancelled(action, scheduler)
            return action.record
        return resume(action, scheduler, locked=locked) if action.status == 'claimed' else action.record
    from .action_schedule import select_agent
    from .blacksmith_catalog import ENERGY_COST
    from .life_scope import CURRENT
    from .life_models import LifeItem
    scope = CURRENT.get()
    item = LifeItem.objects.filter(pk=scope['item_id']).first() if scope else None
    agent = select_agent(task, cost=ENERGY_COST)
    blocked = agent is None
    if blocked and item:
        agent = Agent.objects.filter(pk=item.actor_id).first()
    if not agent:
        return None
    from .blacksmith_catalog import catalog_for
    catalog_for(task.blacksmith_config['owner_id'])
    from .life_interleaving_usage import record_for
    record = record_for(item) if item else None
    if record is None:
        record = AgentRunRecord.objects.create(task=task, task_name=task.name, agent=agent, agent_name=agent.name,
            trigger='手动执行' if manual or (item and item.context.get('manual')) else '系统行动',
            status='running', summary='正在查看可打造装备')
    else:
        record.task, record.task_name = task, task.name
        record.save(update_fields=['task', 'task_name'])
    action = WorldAction.objects.create(pk=key, task=task, agent=agent, actor_id=agent.pk, record=record,
        snapshot={'blacksmith': True, 'owner_id': task.blacksmith_config['owner_id'], 'version': 1,
            'cursor': 0, 'phase': 'band', 'decisions': [], 'current': {},
            'life_item_id': item.pk if item else '', 'manual': bool(manual or (item and item.context.get('manual')))})
    if manual and action.snapshot['manual']:
        from .blacksmith_authorization import authorize
        authorize(action.pk)
    if item and item.record_id != record.pk:
        item.record_id = record.pk
        item.save(update_fields=['record_id', 'updated_at'])
    from .blacksmith_authorization import authorized
    if not authorized(action.pk, manual=bool(action.snapshot.get('manual'))):
        clear_if_cancelled(action, scheduler)
        return record
    if blocked:
        finish(action, scheduler, reason='居民正忙碌或体力不足，本次未开始打造。')
        record.refresh_from_db()
        return record
    return resume(action, scheduler, locked=locked)


def tick_blacksmith(scheduler=None):
    from .blacksmith_authorization import authorized, BlacksmithAuthorizationRequired
    for action in WorldAction.objects.filter(snapshot__blacksmith=True, status='claimed').select_related('task', 'agent', 'record')[:20]:
        if not authorized(action.pk, manual=bool(action.snapshot.get('manual'))):
            clear_if_cancelled(action, scheduler)
            continue
        retry_at = action.snapshot.get('retry_at')
        if retry_at and datetime.fromisoformat(retry_at) > timezone.now():
            # Cancellation must release reservations even during connection backoff.
            try:
                require_ready(action, action.agent)
            except BlacksmithAuthorizationRequired:
                continue
            except ValueError as exc:
                if not authorized(action.pk, manual=bool(action.snapshot.get('manual'))):
                    continue
                finish(action, scheduler, reason='打造停止，已完成装备保留：' + str(exc)[:250])
            continue
        resume(action, scheduler)
