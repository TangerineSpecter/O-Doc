"""Select one social action, then load only the selected expression contract."""
import json
import time
from system_settings.agent_role import role_text
from system_settings.agent_prompts import build_agent_system_prompt
from system_settings.decision.routing import choose_scene, complete_json, owner_for
from .social_context import social_decision_context
from .social_prompt import decision_instruction, validate_auto_reply, AUTO_COMMENT_MAX_LENGTH
from .social_relations import RULES
from .social_content import text


def validate_result(value, context, selected):
    if value.get('action') != selected['action']:
        raise ValueError('正文不能改变已选社交行为')
    if selected.get('moment_id'):
        if value.get('moment_id') != selected['moment_id']:
            raise ValueError('不能改变已选动态')
    action = value['action']
    if action == 'reply':
        value['content'] = validate_auto_reply(value.get('content'))
    elif action == 'publish' or (action == 'read' and value.get('content')):
        text(value.get('content'), 3000 if action == 'publish' else AUTO_COMMENT_MAX_LENGTH)
    text(value.get('reason'), 1000)
    for key in ('received_appraisal', 'sent_appraisal'):
        if key in value:
            appraisal = value[key]
            if not isinstance(appraisal, dict) or appraisal.get('category') not in RULES:
                raise ValueError('事件理解类别无效')
            text(appraisal.get('reason'), 1000)
    moment_ids = {row['id'] for row in context.get('moments', [])}
    if not isinstance(value.get('likes', []), list) or any(identity not in moment_ids for identity in value.get('likes', [])):
        raise ValueError('点赞动态无效')
    if action == 'publish':
        choices = context.get('image_choices', ['none'])
        choice = value.get('image_choice', 'generate' if value.get('image_prompt') else 'existing' if value.get('existing_images') else 'none')
        if choices == ['none']:
            choice = 'none'
        if choice not in choices:
            raise ValueError('配图选择未开放')
        value['image_choice'] = choice
        from .social_image_prompt import encode_subject
        encode_subject(value)
    else:
        value['image_choice'] = 'none'
        for key in ('image_prompt', 'image_include_actor', 'existing_images'):
            value.pop(key, None)
    return value


def decide_social(agent, context, *, owner=None):
    owner = owner or owner_for(agent)
    deadline = time.monotonic() + 180
    from system_settings.agent_availability import require_active_agent
    check = lambda: require_active_agent(agent)
    check()
    projected = social_decision_context(context)
    options = {}
    for action in context.get('allowed', []):
        if action == 'read':
            for row in context.get('moments', []):
                options['read:' + row['id']] = {'action': 'read', 'moment_id': row['id']}
        else:
            options[action] = {'action': action}
    if not options:
        return {'action': 'rest', 'reason': '系统选择说明：没有可用社交行为', 'image_choice': 'none'}
    descriptions = {key: json.dumps(value, ensure_ascii=False) for key, value in options.items()}
    # The decision stage does not need image inventories or publishing schemas.
    selection_context = {k: v for k, v in projected.items() if k not in ('image_choices', 'existing_images')}
    selected_key = choose_scene(owner, agent, 'social_action', selection_context, descriptions, deadline=deadline)
    source = '唯一合法候选' if len(options) == 1 else '结构化决策模型' if selected_key else '普通模型'
    if selected_key is None:
        def validate_selection(value):
            if value.get('choice') not in options:
                raise ValueError('社交候选无效')
            return value['choice']
        prompt = role_text(agent, 'social') + '\n只选择一个合法候选，不写正文、配图或感受。返回 {"choice":"候选键"}。\n' + '\n资料：' + json.dumps({'context': selection_context, 'choices': descriptions}, ensure_ascii=False)
        selected_key = complete_json(agent, prompt, validate_selection, decision=True, owner=owner, deadline=deadline, scene='社交选择', check=check)
    selected = options[selected_key]
    if selected['action'] in ('rest', 'ignore', 'defer'):
        return {**selected, 'reason': f'系统选择说明：{source}选择{selected_key}，不是人物感受。', 'image_choice': 'none'}
    scoped = {**context, 'allowed': [selected['action']]}
    if selected['action'] != 'publish':
        scoped['image_choices'], scoped['existing_images'] = ['none'], []
    if selected['action'] != 'reply':
        scoped['inbox'] = None
    if selected['action'] != 'read':
        scoped['moments'] = []
    expression_context = social_decision_context(scoped)
    expression_context['selected_action'] = selected
    from .memory.recall import memory_context
    prompt = build_agent_system_prompt(role_text(agent), conversation=False) + '\n' + memory_context(agent, '社交 ' + json.dumps(expression_context, ensure_ascii=False)[:1500])
    prompt += '\n' + decision_instruction([selected['action']], has_inbox=bool(scoped.get('inbox')),
        image_choices=scoped['image_choices'], categories=tuple(RULES))
    prompt += '\n行为和目标已选定，不得改变。可不赞不评；说明只能根据真实资料。\n资料：' + json.dumps(expression_context, ensure_ascii=False)
    return complete_json(agent, prompt, lambda value: validate_result(value, context, selected),
                         owner=owner, deadline=deadline, scene='社交表达', check=check)
