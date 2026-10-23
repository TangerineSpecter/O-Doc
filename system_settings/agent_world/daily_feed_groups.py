"""按稳定执行身份聚合展示；原始操作和账本保持独立。"""
from collections import Counter, defaultdict
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
        if all(row.get('_execution_batch') for row in rows):
            # 旧批量记录的离场时间可能早于逐件装备交易；完成序列才是实际顺序。
            rows.sort(key=lambda row: (row.get('_execution_order', 0), row['occurredAt'], row['id']))
        else:
            rows.sort(key=lambda row: (row['occurredAt'], row.get('_execution_order', 0), row['id']))
        for row in rows:
            row.pop('_execution_order', None)
            row.pop('_execution_batch', None)
        latest = rows[-1]
        if identity.startswith('activity:') and len(rows) == 1:
            projected.append(latest)
            continue
        category = ('farm' if identity.startswith('farm:') else 'cooking' if identity.startswith('cooking:')
                    else 'alchemy' if identity.startswith('alchemy:')
                    else 'blacksmith' if identity.startswith('blacksmith:')
                    else 'trade' if identity.startswith('market-sale:')
                    else latest['category'] if identity.startswith('activity:') else 'market')
        operations = [row for row in rows if row['source'] in ('farm', 'cooking', 'alchemy', 'blacksmith', 'market', 'market-seller', 'activity')]
        closing = [row for row in rows if row['source'] == 'market-session']
        running = any(row.get('_execution_running') or row.get('status') == 'running' for row in rows)
        reason = (next((row.get('reason') for row in rows if row.get('reason')), '')
                  if category in ('farm', 'cooking', 'alchemy', 'blacksmith') else (closing[-1]['detail'] if closing else ''))
        values = [Decimal(row['amount']) for row in operations if row['amount'] is not None]
        steps = [{k: row[k] for k in ('id', 'title', 'detail', 'occurredAt', 'amount')} for row in rows]
        for step in steps:
            if reason and step.get('detail'):
                detail = step['detail']
                if detail == reason:
                    step['detail'] = ''
                elif detail.endswith(f' · {reason}'):
                    step['detail'] = detail[:-len(f' · {reason}')]
        if category in ('cooking', 'alchemy'):
            product_counts = Counter()
            for row in operations:
                product = row.get('_dish') or row.get('_potion')
                stars = row.get('_stars', 1)
                if product:
                    product_counts[(product, stars)] += 1
            unit, label = ('份美食', '已制作') if category == 'cooking' else ('瓶药水', '已炼制')
            if product_counts:
                products_text = '、'.join(f'{d} ★{s} ×{cnt}' for (d, s), cnt in product_counts.items())
                detail_text = f'{label} {len(operations)} {unit} · {products_text}' + (f' · {reason}' if reason else '')
            else:
                detail_text = (f'{label} {len(operations)} {unit}' if operations else ('未进行美食制作' if category == 'cooking' else '未进行炼金制作')) + (f' · {reason}' if reason else '')
        elif category == 'blacksmith':
            detail_text = f'已打造 {len(operations)} 件装备' + (f' · {reason}' if reason else '')
        else:
            detail_text = (f'已执行 {len(operations)} 项操作' if operations else '正在浏览市场' if running else '本次未进行交易') + (f' · {reason}' if reason else '')
        result = {**latest, 'id': f'execution:{identity}:{actor}', 'source': 'execution',
                  'category': category, 'title': {'farm': '农场经营', 'cooking': '美食制作', 'alchemy': '炼金制作', 'blacksmith': '铁匠铺打造', 'trade': '商品售出', 'publication': '作品发布', 'interaction': '阅读互动'}.get(category, '市场活动'),
                  'detail': detail_text,
                  'amount': str(sum(values, Decimal(0))) if values else None,
                  'reason': reason or latest.get('reason') or '',
                  'status': 'running' if running else 'failed' if any(row.get('_execution_failed') or row.get('status') == 'failed' for row in rows) else 'success',
                  'categories': sorted({category, *(row['category'] for row in rows)}),
                  'steps': steps}
        if identity.startswith('activity:'):
            result['rating'] = None
            result['target'] = {'kind': 'run', 'id': identity.removeprefix('activity:')}
            for step, row in zip(result['steps'], rows):
                if row.get('rating') is not None:
                    step['detail'] = f"★ {row['rating']} / 10 · {step['detail']}"
        if category == 'farm' and not operations:
            result['detail'] = '种植计划与队列状态（尚无实际操作）' + (f' · {reason}' if reason else '')
        projected.append(result)
    # 跨日执行只在最近业务事实所属日期出现，筛选与分页在聚合以后进行。
    lower, upper = local_time(start).isoformat(), local_time(end).isoformat()
    for row in projected:
        row.pop('_execution_running', None)
        row.pop('_execution_failed', None)
        row.pop('_dish', None)
        row.pop('_stars', None)
        row.pop('_exp', None)
    return [row for row in projected if lower <= row['occurredAt'] < upper]
