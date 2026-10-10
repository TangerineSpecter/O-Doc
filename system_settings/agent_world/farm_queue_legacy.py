"""仅兼容校验旧固定窗口快照，绝不恢复旧执行器。"""
from datetime import datetime
from system_settings.models import WorldAction
from .farm_clock import DAY
from .farm_models import AgentFarm, FarmOperation

def validate_legacy_plan(farm: AgentFarm) -> None:
    """拒绝缺少原始规划身份和非法轮数的同步快照，旧农场无需迁移。"""
    from utils.sync_manager import SyncError
    plan = farm.state.get('automation')
    if plan is None:
        return
    try:
        action = WorldAction.objects.get(pk=plan['id'], actor_id=farm.pk)
        original = action.snapshot['automatic_plan']
        if plan['version'] != 1 or plan['status'] not in ('active', 'completed', 'blocked'):
            raise ValueError('经营计划版本或状态无效')
        for key in ('id', 'task_id', 'reviewed_at', 'expires_at', 'signature'):
            if plan[key] != original[key]:
                raise ValueError('经营计划依据被改写')
        if (type(plan['reviewed_at']) not in (int, float) or plan['reviewed_at'] <= 0
                or plan['expires_at'] != plan['reviewed_at'] + 3 * DAY):
            raise ValueError('经营计划时间无效')
        if plan['last_window']:
            day, hour = plan['last_window'].split(':')
            datetime.fromisoformat(day)
            if hour not in ('9', '18'):
                raise ValueError('集中打理窗口无效')
        originals = {p['id']: p for p in original['plots']}
        if len(plan['plots']) != len(originals) or {p['id'] for p in plan['plots']} != set(originals):
            raise ValueError('经营地块不一致')
        for entry in plan['plots']:
            if (type(entry['replants_left']) is not int or entry['replants_left'] not in (0, 1)
                    or entry['crop'] != originals[entry['id']]['crop']
                    or entry['status'] not in ('growing', 'empty', 'done', 'blocked')):
                raise ValueError('经营轮数或作物无效')
            replants = [op for op in FarmOperation.objects.filter(farm=farm, pk__in=farm.state.get('operation_keys', []), result__automatic_plan_id=plan['id'])
                        if op.operation['kind'] == 'plant' and entry['id'] in op.operation['targets']]
            if entry['replants_left'] != originals[entry['id']]['replants_left'] - len(replants):
                raise ValueError('续种轮数缺少真实经营依据')
            if replants:
                last = replants[-1]
                target_index = last.operation['targets'].index(entry['id'])
                if entry['cycle_id'] != last.result['cycles'][target_index]['cycle_id']:
                    raise ValueError('续种周期缺少真实经营依据')
            elif entry['cycle_id'] != originals[entry['id']]['cycle_id']:
                raise ValueError('经营周期被改写')
        if not set(plan['animal_ids']) <= set(original['animal_ids']):
            raise ValueError('经营动物不一致')
    except (KeyError, TypeError, ValueError, WorldAction.DoesNotExist) as exc:
        raise SyncError(f'农场自动经营计划不完整：{exc}') from exc
