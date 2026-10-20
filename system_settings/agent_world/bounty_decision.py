"""悬赏接单询问：优先结构化决策，未配置时回退居民自身模型。"""
import json
import time

from django.utils import timezone

from system_settings.decision.routing import choose_scene, complete_json
from system_settings.agent_role import role_text

INSTRUCTIONS = (
    '你在决定是否接下一条悬赏。只有愿意投入时间完成调研并在指定文集发帖时才选择 accept；'
    '资金紧张、对主题没有把握或近期事务过多可以选择 decline。不要承诺无法完成的交付。'
)


def ask_accept(owner: str, bounty, agent) -> tuple:
    """返回 (是否接受, 决策记录)。任何异常都按不接受处理，不阻塞下一位居民。"""
    from .models import WorldCategory
    category = WorldCategory.objects.filter(pk=bounty.category_id).values_list('name', flat=True).first() or ''
    state = {
        'bounty': {'title': bounty.title, 'objective': bounty.objective,
                   'requirements': bounty.requirements, 'reward': str(bounty.reward),
                   'category': category, 'collection': bounty.collection_id},
        'resident': {'name': agent.name, 'money': str(agent.money), 'profession': agent.profession.name if agent.profession else ''},
        'now': timezone.now().isoformat(),
    }
    choices = {'accept': '接受悬赏并开始调研', 'decline': '这次不接'}
    try:
        picked = choose_scene(owner, agent, 'bounty_accept', state, choices,
                              deadline=time.monotonic() + 90,
                              question_id=f'bounty_accept:{bounty.pk}:{agent.pk}',
                              instructions=INSTRUCTIONS)
    except Exception:
        picked = None
    if picked in choices:
        accept = picked == 'accept'
        return accept, {'source': 'decision', 'accept': accept,
                        'reason': '决策模型选择接受' if accept else '决策模型选择不接'}
    prompt = (
        role_text(agent, 'decision')
        + '\n' + INSTRUCTIONS
        + '\n只返回 JSON：{"accept":true/false,"reason":"不超过200字的理由"}。\n'
        + '资料：' + json.dumps(state, ensure_ascii=False)
    )

    def validate(value):
        if type(value.get('accept')) is not bool:
            raise ValueError('accept 必须是布尔值')
        reason = value.get('reason')
        if not isinstance(reason, str) or len(reason) > 500:
            raise ValueError('reason 无效')
        return {'accept': value['accept'], 'reason': reason}

    try:
        value = complete_json(agent, prompt, validate, decision=True, owner=owner, scene='悬赏接单')
    except Exception as exc:
        return False, {'source': 'model', 'accept': False,
                       'reason': f'本次没有做出接单决定（{type(exc).__name__}）'}
    return bool(value['accept']), {'source': 'model', 'accept': bool(value['accept']),
                                   'reason': value['reason']}
