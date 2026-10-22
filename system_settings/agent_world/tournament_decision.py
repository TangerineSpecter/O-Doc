"""A tiny reward-slot question. No role text or general-purpose model fallback."""
import logging
import random
import time
from system_settings.decision.routing import choose_scene
from .tournament_rules import SLOTS

logger = logging.getLogger(__name__)


def pick_slot(owner: str, agent, plan: dict, question_id: str, seed: str) -> dict:
    choices = {slot: SLOTS[slot] for slot in plan['slots']}
    fallback = random.Random(seed).choice(sorted(choices))
    if len(choices) == 1:
        return {'slot': fallback, 'source': 'single_candidate'}
    try:
        picked = choose_scene(owner, agent, 'tournament_reward_slot',
            {'equipment': plan['wearing'], 'reward_quality': plan['quality'], 'available_slots': choices}, choices,
            deadline=time.monotonic() + 45, question_id=question_id, include_role=False, max_probability=True,
            instructions='选择本次武道大会装备奖励的部位。只考虑当前各部位品质和空槽；具体装备类型和词条由系统随机生成。')
        if picked in choices:
            return {'slot': picked, 'source': 'decision_model'}
    except Exception as exc:
        logger.warning('大会奖励部位选择失败 reward=%s type=%s', question_id, type(exc).__name__)
    return {'slot': fallback, 'source': 'code_fallback'}
