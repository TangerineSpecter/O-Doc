"""Reconstruct statistical observations from their immutable direct comparison."""
from quant.research.contracts import digest
from quant.research_memory.contract import instant
from .correlation import METHOD, KIND, compute, evidence


def validate(identity, fields, rows, fail):
    value = fields.get('evidence')
    if not isinstance(value, dict) or set(value) != {'version', 'method', 'comparison_id', 'comparison_hash', 'dataset_id', 'dataset_hash', 'statistics', 'claim'}:
        fail('统计关系证据格式无效')
    comparison = rows.get('quant.factorcomparison', {}).get(value['comparison_id'], {})
    dataset = rows.get('quant.marketdataset', {}).get(value['dataset_id'], {})
    if (not comparison or not dataset or comparison.get('content_hash') != value['comparison_hash']
            or comparison.get('dataset') != value['dataset_id'] or dataset.get('content_hash') != value['dataset_hash']
            or comparison.get('anthology') != dataset.get('anthology')
            or comparison.get('result', {}).get('evaluation_status') != 'completed'
            or {comparison.get('left'), comparison.get('right')} != {fields.get('left'), fields.get('right')}
            or fields.get('kind') != KIND or instant(comparison['created_at']) > instant(fields['created_at'])):
        fail('统计关系的固定对照、行情、端点或时间无效')
    try:
        statistics = compute(comparison['plan'], dataset['snapshot'])
    except TimeoutError:
        fail('统计关系重建超过预算，请使用兼容环境核对；未启动新实验')
    if statistics['output_hashes'] != comparison['result']['output_hashes']:
        fail('统计关系的原输出发生变化，请核对计算环境')
    expected = evidence(value['comparison_id'], comparison['content_hash'], comparison['plan'], statistics)
    fingerprint = digest(expected)
    if (digest(value) != fingerprint or fields.get('content_hash') != fingerprint
            or identity != digest([METHOD, fields['left'], fields['right'], fingerprint])[:40]):
        fail('统计关系与固定样本重建不一致，拒绝重哈希伪造')
