"""日程购票执行：租约保护模型检查点及单次扣款。"""
from django.db import transaction
from system_settings.models import AgentExecutionLease, WorldActionRuntime
from .execution import execution_lease
from .farm_gate import farm_gate
from .life_scope import life_scope, check_item_authorization
from .life_schedule import revise
from .lottery_decision import pick_numbers, LotteryDecisionUnavailable, defer
from .lottery_service import purchase, validate_plan


def execute(item, agent):
    from .lottery_models import LotteryRound
    from .lottery_service import check_open
    try:
        plan = validate_plan(item.context.get('lottery_plan'))
        check_open(item.owner_id, LotteryRound.objects.filter(pk=plan['round_id']).first())
        with life_scope(item, {'current': {'id': item.pk, 'activity': 'lottery'}}):
            with execution_lease(WorldActionRuntime, {'pk': 'world'}) as world_token:
                if not world_token:
                    return
                with execution_lease(AgentExecutionLease, {'agent': agent}) as actor_token:
                    if not actor_token:
                        return
                    check_item_authorization(item)
                    selected = pick_numbers(item, agent)
                    purchase(item.pk, selected)
    except LotteryDecisionUnavailable as exc:
        defer(item, exc)
    except ValueError as exc:
        with farm_gate(), transaction.atomic():
            item.refresh_from_db()
            if item.status in ('pending', 'deferred'):
                revise(item, str(exc), status='failed', result={'reason': str(exc)})
