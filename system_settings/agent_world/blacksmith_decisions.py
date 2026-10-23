"""Finite forging choices; the model never chooses quality, rolls or quantities."""
import time


SCENES = {
    'band': 'blacksmith_level_band', 'slot': 'blacksmith_slot',
    'type': 'blacksmith_type', 'continue': 'blacksmith_continue',
    'goal_count': 'blacksmith_goal_count', 'goal_priority': 'blacksmith_goal_priority',
}


def choose(action, agent, phase: str, state: dict, choices: dict) -> dict:
    from system_settings.decision.jev import DecisionUnavailable
    from system_settings.decision.routing import choose_connections
    from utils.token_usage import usage_scope
    if not choices or len(choices) > 255:
        raise ValueError('打造候选数量无效')
    scene = SCENES[phase]
    if len(choices) == 1:
        selected, source = next(iter(choices)), 'system'
        reason = '系统选择说明：当前只有一个合法选项。'
    else:
        with usage_scope(owner_id=action.snapshot['owner_id'], agent=agent, task=action.task,
                         record=action.record, purpose='task', phase=scene):
            selected, _ = choose_connections(action.snapshot['owner_id'], state, choices,
                deadline=time.monotonic() + 60, scene=scene,
                question_id=f'{action.pk}:{action.snapshot["cursor"]}:{action.snapshot.get("goal_sequence", 0)}:{phase}',
                instructions='仅从合法候选选择一个。目标是一件指定等级档、部位和类型的装备；品质和属性由系统抽取。')
        if selected not in choices:
            raise DecisionUnavailable('打造决策返回了候选外选项')
        source = 'model'
        # The finite connection returns a choice and confidence, not a reason.
        reason = '系统选择说明：采用结构化决策返回的合法选项，连接未提供文字理由。'
    return {'piece_index': action.snapshot['cursor'], 'phase': phase, 'scene': scene,
            'choice': selected, 'source': source, 'reason': reason}
