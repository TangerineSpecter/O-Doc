"""生活日程自动炼金：服务端按库存与等级生成有限计划，模型不能改写产出。"""
import hashlib
import json
import logging
import uuid
from django.db import transaction
from django.utils import timezone
from system_settings.models import AgentRunRecord, WorldAction, WorldActionRuntime, AgentExecutionLease, SystemSetting
from system_settings.agent_activity import update_work_activity
from system_settings.agent_task_models import task_model_name
from .run_diagnostics import failure_detail, progress, finish_record
from .execution import WorldLeaseBusy, defer_when_world_busy, execution_lease, stamina
from .action_schedule import select_agent
from .alchemy_models import AlchemyOperation
from .alchemy_catalog import catalog_for
from .alchemy_queries import validate_actor
from .alchemy_service import commit_bottle
from .alchemy_plan import build_plan
from .farm_gate import farm_gate

logger = logging.getLogger(__name__)


def prepare_decision(task, agent):
    from .alchemy_schedule_plan import planning_facts, recipe_options, decide_plan, validate_plan
    from .life_scope import CURRENT
    from .life_models import LifeItem
    scope = CURRENT.get()
    item = LifeItem.objects.filter(pk=scope['item_id']).first() if scope else None
    specification = item.context.get('alchemy_plan') if item else None
    if specification:
        specification = validate_plan(specification)
    else:
        facts = planning_facts(task.alchemy_config['owner_id'], agent, exclude_ids=[item.pk] if item else [])
        if not recipe_options(facts['rules'], facts['level'], facts['pool'], facts['energy']):
            return [], [], '暂时没有可执行的炼金操作'
        specification = decide_plan(agent, task.alchemy_config['owner_id'], facts, task=task)
    choices = [{key: entry[key] for key in ('recipe_id', 'quantity')} for entry in specification['entries']]
    options = [{**entry['rule'], 'id': entry['recipe_id']} for entry in specification['entries']]
    return choices, options, '系统选择说明：按已确认的炼金配方和瓶数制作。'


def finish(action, scheduler=None):
    ops = list(AlchemyOperation.objects.filter(opportunity_id=action.pk).order_by('created_at', 'id'))
    summary = action.result.get('reason', '本次炼金机会结束')
    action.result = {**action.result, 'operations': [{'id': o.pk, 'recipe_id': o.recipe_id, 'snapshot': o.snapshot, 'result': o.result} for o in ops]}
    if action.record:
        record = action.record
        status = 'success' if action.status == 'success' else 'failed'
        finish_record(record, status, summary, json.dumps(action.result, ensure_ascii=False), '炼金机会结束')
        if action.agent:
            update_work_activity(record, action.agent, status=status, summary=summary, current_action='炼金完成' if ops else '本次炼金机会结束', output=record.output)
    action.effects_done = True
    action.save(update_fields=['result', 'effects_done', 'updated_at'])


def run_alchemy_opportunity(task, scheduler=None, *, key=None, manual=False, locked=False):
    key = key or hashlib.sha256(f'alchemy-manual:{uuid.uuid4()}'.encode()).hexdigest()
    if not locked:
        with execution_lease(WorldActionRuntime, {'pk': 'world'}) as token:
            if token:
                return run_alchemy_opportunity(task, scheduler, key=key, manual=manual, locked=token)
        if defer_when_world_busy.get():
            raise WorldLeaseBusy()
        if scheduler:
            from .action_runner import record_busy_opportunity
            return record_busy_opportunity(task, scheduler, key, manual)
        return None
    existing = WorldAction.objects.filter(pk=key).first()
    if existing:
        if existing.status != 'claimed':
            finish(existing, scheduler)
        return existing.record
    task.refresh_from_db()
    if not task.enabled:
        return None
    agent = select_agent(task, cost=1)
    record = AgentRunRecord.objects.create(task=task, task_name=task.name, agent=agent, agent_name=agent.name if agent else '',
        trigger='手动执行' if manual else '系统行动', status='running', summary='正在查看炼金素材',
        agent_runs=[{'agent': agent.pk, 'agentName': agent.name, 'agentAvatar': agent.avatar,
            'modelName': task_model_name(task, agent, default=''), 'status': 'running', 'steps': []}] if agent else [])
    action = WorldAction.objects.create(pk=key, task=task, agent=agent, actor_id=agent.pk if agent else '', record=record, snapshot={'alchemy': True})
    phase = '准备炼金执行'
    progress(record, phase)
    try:
        if not agent:
            action.status, action.result = 'skipped', {'reason': '没有空闲且体力足够的居民'}
        else:
            with execution_lease(AgentExecutionLease, {'agent': agent}) as token:
                if not token:
                    raise ValueError('居民正在执行其他任务')
                setting = SystemSetting.objects.filter(key='system_mcp_config').first()
                if setting and not (setting.value or {}).get('enabled', True):
                    raise ValueError('系统 MCP 已关闭')
                phase = '读取炼金状态'
                progress(record, phase)
                owner = task.alchemy_config['owner_id']
                validate_actor(owner, agent.pk)
                update_work_activity(record, agent, status='running', current_action='正在决定炼金配方')
                phase = '确认炼金计划'
                progress(record, phase)
                from utils.token_usage import usage_scope
                with usage_scope(agent=agent, task=task, record=record, purpose='task', phase=phase):
                    choices, options, reason = prepare_decision(task, agent)
                with farm_gate(), transaction.atomic():
                    from .alchemy_schedule_plan import available_pool
                    from .life_scope import CURRENT
                    scope = CURRENT.get()
                    pool = available_pool(owner, agent.pk, exclude_ids=[scope['item_id']] if scope else [])
                    selected = build_plan(owner, agent.pk, choices, options, stamina(agent), pool=pool)
                    if selected:
                        catalog_for(owner)
                    action.snapshot = {'alchemy': True, 'owner_id': owner, 'plan': selected, 'reason': reason}
                    action.save(update_fields=['snapshot', 'updated_at'])
                for index, operation in enumerate(selected):
                    phase = '炼制' + operation['rule']['name']
                    progress(record, phase, f'第 {index + 1}/{len(selected)} 瓶')
                    update_work_activity(record, agent, status='running', current_action=phase)
                    commit_bottle(agent.pk, key, index, operation['recipe_id'], operation['rule'], reason, task, token, locked)
                action.status = 'success' if selected else 'skipped'
                action.result = {'reason': reason}
        action.save()
    except Exception as exc:
        logger.exception('炼金机会执行失败 action=%s', key)
        action.refresh_from_db()
        action.status, action.result = 'failed', {'reason': failure_detail(phase, exc)}
        action.save(update_fields=['status', 'result', 'updated_at'])
    finish(action, scheduler)
    record.refresh_from_db()
    if scheduler and action.status == 'success':
        scheduler._send_task_notification(task, record)
    return record


def tick_alchemy(scheduler):
    from datetime import timedelta
    stale = timezone.now() - timedelta(minutes=15)
    for action in WorldAction.objects.filter(snapshot__alchemy=True, status='claimed', updated_at__lt=stale).select_related('record', 'agent')[:20]:
        from .life_craft_recovery import resume
        if resume(action, 'alchemy', scheduler):
            continue
        action.status, action.result = 'failed', {'reason': '炼金中断，已提交药水与经验保留，剩余制作停止'}
        action.save(update_fields=['status', 'result', 'updated_at'])
        finish(action, scheduler)
    for action in WorldAction.objects.filter(snapshot__alchemy=True, status__in=['success', 'failed', 'skipped'], effects_done=False).select_related('record', 'agent')[:20]:
        finish(action, scheduler)
