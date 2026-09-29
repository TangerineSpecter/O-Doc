"""只选择服务端给出的合法候选，模型不能自由改写农场或余额。"""
import hashlib
import json
import logging
import uuid
from django.utils import timezone
from system_settings.models import AgentTask, AgentRunRecord, WorldAction, WorldActionRuntime, AgentExecutionLease, SystemSetting
from system_settings.agent_activity import update_work_activity
from system_settings.agent_prompts import build_agent_system_prompt
from utils.ai_service import AIService
from .execution import execution_lease, stamina
from .action_schedule import select_agent, take_due
from .farm_catalog import catalog_for
from .farm_models import AgentFarm, FarmOperation
from .farm_service import ensure_farms, advance_farm, commit_operation, LABELS

from .inventory_stock import inventory_items, stock_quantity

logger = logging.getLogger(__name__)


def candidates(farm, money):
    rules, state = catalog_for(farm.owner_id).rules, farm.state
    options = []
    def add(op, detail):
        options.append({'id': str(len(options)), 'operation': op, 'description': detail})
    empty = [p['id'] for p in state['plots'] if not p['crop']]
    for kind, rule in rules['crops'].items():
        quantity = stock_quantity(farm.pk, farm.owner_id, 'seed.'+kind)
        ids = empty[:min(4, quantity)]
        if ids:
            add({'kind': 'plant', 'crop': kind, 'targets': ids}, f'种植{rule["name"]}')
    growing = [p['id'] for p in state['plots'] if p['crop'] and p['crop']['grown'] < p['crop']['rules']['growth_seconds'] and p['watered_until'] < timezone.now().timestamp()+43200]
    ripe = [p['id'] for p in state['plots'] if p['crop'] and p['crop']['grown'] >= p['crop']['rules']['growth_seconds']]
    for ids, kind in ((growing, 'water'), (ripe, 'harvest')):
        for offset in range(0, len(ids), 4):
            add({'kind': kind, 'targets': ids[offset:offset+4]}, LABELS[kind])
    hungry = [a['id'] for a in state['animals'] if a['fed_until'] < timezone.now().timestamp()+43200]
    feed = stock_quantity(farm.pk, farm.owner_id, 'feed')
    if feed:
        hungry = hungry[:feed]
        for offset in range(0, len(hungry), 4):
            add({'kind': 'feed', 'targets': hungry[offset:offset+4]}, '喂养动物并培养好感')
    ready = [a['id'] for a in state['animals'] if a['cycle'].get('result')]
    for offset in range(0, len(ready), 4):
        add({'kind': 'collect', 'targets': ready[offset:offset+4]}, '领取已经生产的产物')
    group = len(state['plots'])//4
    if group < 4 and money >= rules['land_prices'][group-1]:
        add({'kind': 'expand'}, '购买相邻四块耕地')
    for kind, rule in rules['buildings'].items():
        level = state['buildings'].get(kind, {}).get('level', 0)
        capacity = state['buildings'].get(kind, {}).get('capacity', 0)
        occupied = sum(a['building'] == kind for a in state['animals'])
        if level < 3 and money >= rule['prices'][level] and rule['capacities'][level] > capacity and rule['capacities'][level] >= occupied:
            add({'kind': 'upgrade' if level else 'build', 'building': kind}, f'{"升级" if level else "建造"}{rule["name"]}')
    return options


def farm_inventory(farm):
    return list(inventory_items(farm.pk, farm.owner_id))


def decide(task, agent, farm, options):
    # 同步审计链与库存批次不属于决策输入，不能随经营历史扩大模型上下文。
    state = {field: farm.state[field] for field in ('plots', 'buildings', 'animals')}
    context = {'balance': str(agent.money), 'stamina': str(stamina(agent)), 'farm': state,
               'inventory': [{'name': i.name, 'quantity': i.quantity} for i in farm_inventory(farm)], 'candidates': options}
    prompt = build_agent_system_prompt(f'当前 Agent：{agent.name}\n{agent.prompt}', conversation=False)
    prompt += '\n你在经营自己的农场。按兴趣选择最多六个不同候选，按顺序执行，允许休息。优先考虑照料、收获及资金；不必花光余额。仅输出 JSON {"choices":["候选ID"],"reason":"简短理由"}，休息时 choices=[]。'
    messages = [{'role': 'system', 'content': prompt}, {'role': 'user', 'content': json.dumps(context, ensure_ascii=False)+'\n补充经营偏好：'+task.prompt}]
    for attempt in range(2):
        output = AIService.chat_completion_messages(messages, model_id=agent.model_id) or ''
        try:
            value = json.loads(output.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip())
            choices = value['choices']
            if not isinstance(choices, list) or len(choices) > 6 or any(not isinstance(i, str) or i not in {o['id'] for o in options} for i in choices) or len(set(choices)) != len(choices):
                raise ValueError('经营候选无效')
            if not isinstance(value.get('reason'), str) or not value['reason'].strip() or len(value['reason']) > 500:
                raise ValueError('经营理由无效')
            return value
        except (ValueError, TypeError, KeyError):
            if attempt:
                raise ValueError('模型未返回有效经营计划')
            messages.append({'role': 'user', 'content': '格式不符合要求，请只返回候选 ID 列表和不超过500字的理由。'})


def finish(action, scheduler=None):
    ops = list(FarmOperation.objects.filter(opportunity_id=action.pk).order_by('created_at', 'id'))
    summary = action.result.get('reason', '本次农场机会结束')
    action.result = {**action.result, 'operations': [{'id': o.pk, 'operation': o.operation, 'result': o.result} for o in ops]}
    if action.record:
        record = action.record
        status = 'failed' if action.status == 'failed' else 'success'
        record.status, record.summary, record.output = status, summary, json.dumps(action.result, ensure_ascii=False)
        record.agent_runs = [{**r, 'status': status, 'summary': summary} for r in record.agent_runs]
        record.save(update_fields=['status', 'summary', 'output', 'agent_runs', 'updated_at'])
        if action.agent:
            update_work_activity(record, action.agent, status=status, summary=summary, current_action='农场经营完成' if ops else '本次经营机会结束', output=record.output)
    action.effects_done = True
    action.save(update_fields=['result', 'effects_done', 'updated_at'])


def run_farm_opportunity(task, scheduler=None, *, key=None, manual=False, locked=False):
    key = key or hashlib.sha256(f'farm-manual:{uuid.uuid4()}'.encode()).hexdigest()
    if not locked:
        with execution_lease(WorldActionRuntime, {'pk': 'world'}) as token:
            if token:
                return run_farm_opportunity(task, scheduler, key=key, manual=manual, locked=token)
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
    ensure_farms(task)
    agent = select_agent(task, cost=2)
    record = AgentRunRecord.objects.create(task=task, task_name=task.name, agent=agent, agent_name=agent.name if agent else '',
        trigger='手动执行' if manual else '系统行动', status='running', summary='正在查看农场',
        agent_runs=[{'agent': agent.pk, 'agentName': agent.name, 'agentAvatar': agent.avatar,
            'modelName': agent.model.name if agent.model else '', 'status': 'running', 'steps': []}] if agent else [])
    action = WorldAction.objects.create(pk=key, task=task, agent=agent, actor_id=agent.pk if agent else '', record=record, snapshot={'farm': True})
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
                farm = advance_farm(agent.pk)
                update_work_activity(record, agent, status='running', current_action='正在决定农场经营')
                options = candidates(farm, agent.money)
                decision = decide(task, agent, farm, options) if options else {'choices': [], 'reason': '暂时没有可执行的经营操作'}
                selected = [options[int(i)]['operation'] for i in decision['choices']]
                action.snapshot = {'farm': True, 'plan': selected, 'reason': decision['reason']}
                action.save(update_fields=['snapshot', 'updated_at'])
                for index, operation in enumerate(selected):
                    update_work_activity(record, agent, status='running', current_action=LABELS[operation['kind']])
                    commit_operation(agent.pk, key, index, operation, decision['reason'], task, token, locked)
                action.status = 'success' if selected else 'skipped'
                action.result = {'reason': decision['reason']}
        action.save()
    except Exception as exc:
        logger.exception('农场机会执行失败 action=%s', key)
        action.refresh_from_db()
        action.status, action.result = 'failed', {'reason': str(exc)[:500]}
        action.save(update_fields=['status', 'result', 'updated_at'])
    finish(action, scheduler)
    if scheduler and action.status == 'success':
        scheduler._send_task_notification(task, record)
    return record


def tick_farms(scheduler, token, enabled):
    from datetime import timedelta
    stale = timezone.now() - timedelta(minutes=15)
    for action in WorldAction.objects.filter(snapshot__farm=True, status='claimed', updated_at__lt=stale).select_related('record', 'agent')[:20]:
        action.status, action.result = 'failed', {'reason': '经营中断，已提交操作保留，剩余操作停止'}
        action.save(update_fields=['status', 'result', 'updated_at'])
        finish(action, scheduler)
    for action in WorldAction.objects.filter(snapshot__farm=True, status__in=['success', 'failed', 'skipped'], effects_done=False).select_related('record', 'agent')[:20]:
        finish(action, scheduler)
    if not enabled:
        return
    # 即使任务暂停，也继续已承诺的自然生长；不自动补料或重做经营。
    for farm_id in AgentFarm.objects.values_list('pk', flat=True):
        advance_farm(farm_id)
    for task in AgentTask.objects.filter(task_kind='farm', enabled=True, trigger='定时任务'):
        key = take_due(task)
        if key:
            run_farm_opportunity(task, scheduler, key=key, locked=token)
