"""Frozen trial accounting across requests; never pools returns or selects a winner."""
import copy
import json
from quant.research.contracts import digest

SCOPE = 'same_owner_private_quant_exact_symbol_timeframe_requests_v1'
REQUEST_LIMIT = 200
MAX_CHARS = 160000
STATUSES = ('evaluated', 'rejected', 'cancelled', 'budget_stopped')
LIMITATIONS = [
    '按同一所有者私密量化库的精确标的和周期保守归集，包含软删研究；不判断这些请求是否属于同一假设。',
    '累计每次已保存尝试，不跨请求去重；相同配方重复尝试仍计数。预约候选上限不是实际尝试数或剩余额度。',
    '未发布成果、失败和取消不会清除已保存尝试；没有检查点不能推断从未计算，执行队列和未保存尝试未知。',
    '只有本机当时已记录且在扫描预算内的业务事实；其他市场别名、周期、外部或尚未同步设备的试验未知；扫描完整只描述当时本机范围，时间戳不是全局可见性证明。',
    '只累计次数，不汇合不同数据或成本的收益，不扩大本次CSCV家族；不是跨请求显著性校正或全局独立证明。',
]


def amount(value: dict) -> int:
    return len(json.dumps(value, ensure_ascii=False, allow_nan=False))


def request_fact(request: dict, dataset: dict, checkpoints: list[dict], outcome: dict | None) -> dict:
    """Same projection is used by the live reader and snapshot reconstruction."""
    return {'request_id': request['id'], 'request_hash': request['content_hash'],
        'collection_id': request['anthology'], 'dataset_id': request['dataset'], 'dataset_hash': dataset['content_hash'],
        'created_at': request['created_at'], 'candidate_budget': request['candidate_budget'],
        'outcome': outcome, 'checkpoints': sorted(checkpoints, key=lambda row: (row['ordinal'], row['id']))}


def build(market: dict, current_id: str, cutoff: str, eligible: int, records: list[dict]) -> dict:
    ordered = sorted(records, key=lambda row: (row['request_id'] != current_id, row['request_id']))
    selected = []
    chars = 0
    for record in ordered[:REQUEST_LIMIT]:
        size = amount(record)
        if chars + size > MAX_CHARS:
            break
        selected.append(copy.deepcopy(record)); chars += size
    selected.sort(key=lambda row: row['request_id'])
    counts = {status: 0 for status in STATUSES}
    for record in selected:
        for checkpoint in record['checkpoints']:
            counts[checkpoint['status']] += 1
    return {'version': 1, 'scope': SCOPE, 'market': copy.deepcopy(market), 'current_request_id': current_id,
        'observed_at': cutoff, 'scan_limit': REQUEST_LIMIT, 'max_chars': MAX_CHARS, 'eligible_requests': eligible,
        'complete_scan': len(selected) == eligible, 'request_count': len(selected),
        'attempt_count': sum(counts.values()), 'status_counts': counts,
        'reserved_candidate_budget': sum(row['candidate_budget'] for row in selected),
        'without_published_result': sum(row['outcome'] is None for row in selected),
        'manifest': selected, 'external_trials': 'unattested', 'independent_validation': False,
        'limitations': copy.deepcopy(LIMITATIONS)}


def summary(value: dict) -> dict:
    """All aggregate counts, bounded concrete records, no source/price/checkpoint bodies."""
    result = copy.deepcopy({key: item for key, item in value.items() if key != 'manifest'})
    records = value['manifest']
    negative = next((row for row in records if (row['outcome'] or {}).get('status') in ('failed','cancelled')
        or any(item['status'] != 'evaluated' for item in row['checkpoints'])), None)
    chosen = ([negative] if negative else []) + [row for row in records if row is not negative]
    result['request_sample'] = [{key: item for key, item in row.items() if key != 'checkpoints'} | {
        'attempt_count': len(row['checkpoints']),
        'status_counts': {status: sum(item['status'] == status for item in row['checkpoints']) for status in STATUSES}}
        for row in chosen[:12]]
    result['omitted_requests'] = len(records) - len(result['request_sample'])
    result['manifest_hash'] = digest(records)
    return result


def attach(diagnostic: dict, history: dict) -> dict:
    result=copy.deepcopy(diagnostic)
    result.update(version=2,search_history=copy.deepcopy(history))
    result['limitations'][0]='本次CSCV只描述本请求逐折已记录且可评价的固定候选；跨请求次数另见search_history，不扩大本次数值家族。'
    return result
