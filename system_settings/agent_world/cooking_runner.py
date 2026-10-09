"""只选择服务端给出的合法候选，模型不能自由改写美食制作或余额。"""
import hashlib
import json
import logging
import uuid
from django.utils import timezone
from django.db import transaction
from system_settings.models import AgentRunRecord, WorldAction, WorldActionRuntime, AgentExecutionLease, SystemSetting
from system_settings.agent_activity import update_work_activity
from system_settings.agent_prompts import build_agent_system_prompt
from utils.ai_service import AIService
from .run_diagnostics import failure_detail, progress, finish_record
from .execution import WorldLeaseBusy, defer_when_world_busy, execution_lease, stamina
from .action_schedule import select_agent
from .cooking_models import CookingOperation
from .cooking_catalog import catalog_for
from .cooking_queries import recipes, overview, validate_actor
from .cooking_service import commit_portion
from .cooking_plan import build_plan
from .cooking_quality import STRATEGIES
from .farm_gate import farm_gate


logger = logging.getLogger(__name__)


def decide(task, agent, options):
    from .life_scope import enrich
    context = enrich({'skill': overview(task.cooking_config['owner_id'], agent.pk),
                      'stamina': str(stamina(agent)), 'recipes': options})
    prompt = build_agent_system_prompt(f'当前 Agent：{agent.name}\n{agent.prompt}', conversation=False)
    prompt += '\n你用自己的食材制作美食。根据偏好、原料机会成本、预期收益和成长选择可制作菜，合计最多六份，也可休息。每道菜选择 low_stars_first（日常制作）或 high_stars_first（精品制作），同星先进先出；高星材料不保证加工盈利，挂牌溢价不计保证收入。quality_previews 按当前等级估算，实际每份采用制作时等级。仅输出 JSON {"choices":[{"recipe_id":"食谱ID","quantity":1,"ingredient_strategy":"low_stars_first"}],"reason":"简短理由"}。不修改规则。'
    messages = [{'role': 'system', 'content': prompt}, {'role': 'user', 'content': json.dumps(context, ensure_ascii=False) + '\n制作偏好：' + task.prompt}]
    for attempt in range(2):
        output = AIService.chat_completion_messages(messages, model_id=agent.model_id) or ''
        try:
            value = json.loads(output.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip())
            decision = validate_decision(value, options)
            build_plan(task.cooking_config['owner_id'], agent.pk, decision['choices'], options, stamina(agent))
            return decision
        except (ValueError, TypeError, KeyError) as exc:
            if attempt:
                raise ValueError('模型未返回有效制作计划')
            messages.append({'role': 'user', 'content': f'计划无效：{exc}。请仅返回 choices 和 reason，选择合法食谱和材料策略，确保材料和体力满足整个计划，数量合计不超过六份。'})


def validate_decision(value, options):
    choices = value['choices']
    if not isinstance(choices, list) or len(choices) > 6 or not isinstance(value.get('reason'), str) or not value['reason'].strip() or len(value['reason']) > 500:
        raise ValueError('制作计划格式无效')
    available = {row['id']: row for row in options}
    total, seen = 0, set()
    for choice in choices:
        if (not isinstance(choice, dict) or set(choice) not in ({'recipe_id', 'quantity'}, {'recipe_id', 'quantity', 'ingredient_strategy'})
                or choice.get('ingredient_strategy', 'low_stars_first') not in STRATEGIES):
            raise ValueError('制作选择格式无效')
        key, quantity = choice['recipe_id'], choice['quantity']
        if not isinstance(key, str) or key not in available or key in seen or type(quantity) is not int or not 1 <= quantity <= available[key]['max_portions']:
            raise ValueError('食谱或份数无效')
        seen.add(key)
        total += quantity
    if total > 6:
        raise ValueError('一次最多制作六份')
    return value


def finish(action, scheduler=None):
    ops = list(CookingOperation.objects.filter(opportunity_id=action.pk).order_by('created_at', 'id'))
    summary = action.result.get('reason', '本次美食制作机会结束')
    action.result = {**action.result, 'operations': [{'id': o.pk, 'recipe_id': o.recipe_id, 'snapshot': o.snapshot, 'result': o.result} for o in ops]}
    if action.record:
        record = action.record
        status = 'failed' if action.status == 'failed' else 'success'
        finish_record(record, status, summary, json.dumps(action.result, ensure_ascii=False), '美食制作机会结束')
        if action.agent:
            update_work_activity(record, action.agent, status=status, summary=summary, current_action='美食制作完成' if ops else '本次制作机会结束', output=record.output)
    action.effects_done = True
    action.save(update_fields=['result', 'effects_done', 'updated_at'])


def run_cooking_opportunity(task, scheduler=None, *, key=None, manual=False, locked=False):
    key = key or hashlib.sha256(f'cooking-manual:{uuid.uuid4()}'.encode()).hexdigest()
    if not locked:
        with execution_lease(WorldActionRuntime, {'pk': 'world'}) as token:
            if token:
                return run_cooking_opportunity(task, scheduler, key=key, manual=manual, locked=token)
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
        trigger='手动执行' if manual else '系统行动', status='running', summary='正在查看美食制作',
        agent_runs=[{'agent': agent.pk, 'agentName': agent.name, 'agentAvatar': agent.avatar,
            'modelName': agent.model.name if agent.model else '', 'status': 'running', 'steps': []}] if agent else [])
    action = WorldAction.objects.create(pk=key, task=task, agent=agent, actor_id=agent.pk if agent else '', record=record, snapshot={'cooking': True})
    phase = '准备美食制作执行'
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
                phase = '读取美食制作状态'
                progress(record, phase)
                owner = task.cooking_config['owner_id']
                validate_actor(owner, agent.pk)
                update_work_activity(record, agent, status='running', current_action='正在决定制作哪些美食')
                options = [row for row in recipes(owner, agent) if row['state'] == 'ready']
                phase = '模型选择制作计划'
                progress(record, phase)
                decision = decide(task, agent, options) if options else {'choices': [], 'reason': '暂时没有可执行的制作操作'}
                with farm_gate(), transaction.atomic():
                    selected = build_plan(owner, agent.pk, decision['choices'], options, stamina(agent))
                    if selected:
                        # Protect the confirmed plan even if execution stops before
                        # its first portion creates a skill/operation record.
                        catalog_for(owner)
                    action.snapshot = {'cooking': True, 'owner_id': owner, 'plan': selected, 'reason': decision['reason']}
                    action.save(update_fields=['snapshot', 'updated_at'])
                for index, operation in enumerate(selected):
                    phase = '制作' + operation['rule']['name']
                    progress(record, phase, f'第 {index + 1}/{len(selected)} 项制作操作')
                    update_work_activity(record, agent, status='running', current_action=phase)
                    commit_portion(agent.pk, key, index, operation['recipe_id'], operation['rule'], decision['reason'], task, token, locked)
                action.status = 'success' if selected else 'skipped'
                action.result = {'reason': decision['reason']}
        action.save()
    except Exception as exc:
        logger.exception('美食制作机会执行失败 action=%s', key)
        action.refresh_from_db()
        action.status, action.result = 'failed', {'reason': failure_detail(phase, exc)}
        action.save(update_fields=['status', 'result', 'updated_at'])
    finish(action, scheduler)
    # 失败路径会刷新行动并清掉关联缓存，终态写在另一份记录上。返回前同步，生活安排才能看到失败。
    record.refresh_from_db()
    if scheduler and action.status == 'success':
        scheduler._send_task_notification(task, record)
    return record



def tick_cooking(scheduler):
    from datetime import timedelta
    stale = timezone.now() - timedelta(minutes=15)
    for action in WorldAction.objects.filter(snapshot__cooking=True, status='claimed', updated_at__lt=stale).select_related('record', 'agent')[:20]:
        action.status, action.result = 'failed', {'reason': '制作中断，已提交成品与经验保留，剩余制作停止'}
        action.save(update_fields=['status', 'result', 'updated_at'])
        finish(action, scheduler)
    for action in WorldAction.objects.filter(snapshot__cooking=True, status__in=['success', 'failed', 'skipped'], effects_done=False).select_related('record', 'agent')[:20]:
        finish(action, scheduler)
