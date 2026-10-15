"""社交使用的生活背景投影，不改动生活规划输入或持久化事实。"""


def social_life_context(life: dict) -> dict:
    # 预算、报价及任务安排用于规划；社交不需要据此逐项汇报执行情况。
    planning_keys = {'activities', 'custom_commitments', 'upcoming', 'upcoming_total',
                     'travel_costs', 'farm_prices', 'farm_queue_rules', 'rules'}
    context = {key: value for key, value in life.items() if key not in planning_keys}
    # 历史表达仅作为重复检查线索，不把内部决策理由和完整旧文当成写作范本。
    context['recent_social'] = [
        {'id': row['id'], 'created_at': row['created_at'],
         'action': row['result'].get('action'),
         'content_excerpt': str(row['result'].get('content') or '')[:240]}
        for row in life.get('recent_social', [])
    ]
    if 'recent_experiences' in context:
        context['recent_experiences'] = context['recent_experiences'][:8]
    context['recent_social'] = context['recent_social'][:5]
    return context


def _relation_summary(relations: list[dict], counterpart_id: str) -> dict | None:
    row = next((item for item in relations if item.get('counterpart_id') == counterpart_id), None)
    if not row:
        return None
    summary = {key: row[key] for key in ('familiarity', 'familiarity_label', 'affinity', 'band') if key in row}
    emotion = row.get('emotion') or {}
    if emotion:
        summary['emotion'] = {key: emotion[key] for key in ('kind', 'intensity') if key in emotion}
    return summary


def _discussion_projection(discussion: dict, own_actor_id: str | None) -> dict:
    result = {}
    if discussion.get('title'):
        result['title'] = discussion['title']
    # Article replies target a comment, so a long article body is not copied into every
    # social decision. Keep short articles intact and explicitly mark omitted long ones.
    body = discussion.get('content')
    if body:
        if discussion.get('title') and len(body) > 1800:
            result['content_note'] = '原文较长；请依据标题、目标评论和讨论记录回应，不推测未提供的正文细节。'
        else:
            result['content'] = body
    if discussion.get('source') is not None:
        result['source'] = discussion['source']
    entries = []
    for row in (discussion.get('entries') or [])[-6:]:
        entry = {'speaker': 'self' if own_actor_id and row.get('actor_id') == f'agent-id:{own_actor_id}' else 'other',
                 'content': row.get('content', '')}
        if row.get('name'):
            entry['name'] = row['name']
        entries.append(entry)
    if entries:
        result['entries'] = entries
    return result


def social_decision_context(context: dict) -> dict:
    """Build the ephemeral model input; callers retain the full commit snapshot."""
    allowed = context.get('allowed') or []
    model = {'now': context.get('now'), 'allowed': allowed}
    life = context.get('life') or {}
    own_actor_id = life.get('actor_id')
    relations = context.get('relations') or []

    if any(action in allowed for action in ('reply', 'read', 'publish')):
        projected_life = {key: life[key] for key in ('preferences', 'direction') if life.get(key)}
        experiences = life.get('recent_experiences') or []
        if experiences:
            projected_life['recent_experiences'] = [
                {key: row[key] for key in ('task_name', 'status', 'summary', 'created_at') if key in row}
                for row in experiences[:8]
            ]
        social = life.get('recent_social') or []
        if social:
            projected_life['recent_social'] = [
                {key: row[key] for key in ('created_at', 'action', 'content_excerpt') if key in row}
                for row in social[:5]
            ]
        travel = life.get('ongoing_travel') or []
        if travel:
            projected_life['ongoing_travel'] = [
                {key: row[key] for key in ('phase', 'status') if key in row}
                for row in travel[:5]
            ]
        if projected_life:
            model['life'] = projected_life

    inbox = context.get('inbox')
    if inbox and any(action in allowed for action in ('reply', 'ignore', 'defer')):
        projected_inbox = {'discussion': _discussion_projection(inbox.get('discussion') or {}, own_actor_id)}
        relation = _relation_summary(relations, inbox.get('sender_id'))
        if relation:
            projected_inbox['relation'] = relation
        model['inbox'] = projected_inbox

    if 'read' in allowed:
        moments = []
        for moment in context.get('moments') or []:
            row = {key: moment[key] for key in ('id', 'content', 'created_at') if key in moment}
            identity = moment.get('identity') or {}
            if isinstance(identity, dict) and identity.get('name'):
                row['identity'] = {'name': identity['name']}
            elif identity and not isinstance(identity, dict):
                row['identity'] = identity
            relation = _relation_summary(relations, moment.get('actor_id'))
            if relation:
                row['relation'] = relation
            moments.append(row)
        if moments:
            model['moments'] = moments

    if 'publish' in allowed:
        model['image_choices'] = context.get('image_choices') or ['none']
        if 'existing' in model['image_choices']:
            model['existing_images'] = [image.get('id') if isinstance(image, dict) else image
                                        for image in context.get('existing_images') or []]
    return model
