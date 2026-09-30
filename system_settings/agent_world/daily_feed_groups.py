"""按稳定执行身份聚合展示；原始操作和账本保持独立。"""
from collections import defaultdict
from decimal import Decimal
from .life_time import local_time


def grouped_execution_events(events, start, end):
    groups, projected = defaultdict(list), []
    for event in events:
        group = event.pop('_execution_group', None)
        if group:
            groups[(group, event['actorId'])].append(event)
        else:
            projected.append(event)
    for (identity, actor), rows in groups.items():
        rows.sort(key=lambda row: (row['occurredAt'], row['id']))
        latest = rows[-1]
        if identity.startswith('activity:') and len(rows) == 1:
            projected.append(latest)
            continue
        category = ('farm' if identity.startswith('farm:') else 'trade' if identity.startswith('market-sale:')
                    else latest['category'] if identity.startswith('activity:') else 'market')
        operations = [row for row in rows if row['source'] in ('farm', 'market', 'market-seller', 'activity')]
        closing = [row for row in rows if row['source'] == 'market-session']
        running = any(row.get('_execution_running') or row.get('status') == 'running' for row in rows)
        reason = closing[-1]['detail'] if closing else ''
        values = [Decimal(row['amount']) for row in operations if row['amount'] is not None]
        result = {**latest, 'id': f'execution:{identity}:{actor}', 'source': 'execution',
                  'category': category, 'title': {'farm': '农场经营', 'trade': '商品售出', 'publication': '作品发布', 'interaction': '阅读互动'}.get(category, '市场活动'),
                  'detail': (f'已执行 {len(operations)} 项操作' if operations else '正在浏览市场' if running else '本次未进行交易') + (f' · {reason}' if reason else ''),
                  'amount': str(sum(values, Decimal(0))) if values else None,
                  'status': 'running' if running else 'failed' if any(row.get('_execution_failed') or row.get('status') == 'failed' for row in rows) else 'success',
                  'categories': sorted({category, *(row['category'] for row in rows)}),
                  'steps': [{k: row[k] for k in ('id', 'title', 'detail', 'occurredAt', 'amount')} for row in rows]}
        if identity.startswith('activity:'):
            result['rating'] = None
            result['target'] = {'kind': 'run', 'id': identity.removeprefix('activity:')}
            for step, row in zip(result['steps'], rows):
                if row.get('rating') is not None:
                    step['detail'] = f"★ {row['rating']} / 10 · {step['detail']}"
        if category == 'farm' and not operations:
            result['detail'] = '本次未进行经营操作'
        projected.append(result)
    # 跨日执行只在最近业务事实所属日期出现，筛选与分页在聚合以后进行。
    lower, upper = local_time(start).isoformat(), local_time(end).isoformat()
    for row in projected:
        row.pop('_execution_running', None)
        row.pop('_execution_failed', None)
    return [row for row in projected if lower <= row['occurredAt'] < upper]
