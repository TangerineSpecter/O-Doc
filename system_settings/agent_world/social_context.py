"""社交使用的生活背景投影，不改动生活规划输入或持久化事实。"""


def social_life_context(life: dict) -> dict:
    # 预算、报价及任务安排用于规划；社交不需要据此逐项汇报执行情况。
    planning_keys = {'activities', 'custom_commitments', 'upcoming', 'upcoming_total',
                     'travel_costs', 'farm_prices', 'rules'}
    context = {key: value for key, value in life.items() if key not in planning_keys}
    # 历史表达仅作为重复检查线索，不把内部决策理由和完整旧文当成写作范本。
    context['recent_social'] = [
        {'id': row['id'], 'created_at': row['created_at'],
         'action': row['result'].get('action'),
         'content_excerpt': str(row['result'].get('content') or '')[:240]}
        for row in life.get('recent_social', [])
    ]
    return context
