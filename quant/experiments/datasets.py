from quant.models import MarketDataset
from quant.research.contracts import digest
from .data import META, parse_csv, dataset_hash


def create_dataset(collection, data):
    snapshot = parse_csv(data['csv_text'], {key: data[key] for key in META})
    content_hash = dataset_hash(snapshot)
    identity = digest(['market-dataset-v1', collection.pk, data['name'], content_hash])[:40]
    dataset, _ = MarketDataset.objects.get_or_create(id=identity, defaults={'anthology': collection,
        'name': data['name'], 'raw_csv': data['csv_text'], 'snapshot': snapshot, 'content_hash': content_hash})
    return dataset


def dataset_data(dataset, detail=False):
    snapshot = dataset.snapshot
    rows = snapshot['rows']
    result = {'id': dataset.pk, 'name': dataset.name, 'created_at': dataset.created_at.isoformat(),
        'content_hash': dataset.content_hash, 'row_count': len(rows), 'start': rows[0]['timestamp'],
        'end': rows[-1]['timestamp'], **{key: snapshot[key] for key in META},
        'missing_volume': sum(row['volume'] is None for row in rows),
        'warnings': [message for condition, message in [
            (not snapshot['source'], '数据来源未填写'), (not snapshot['price_adjustment'], '复权口径未填写'),
            (any(row['volume'] is None for row in rows), '成交量存在缺失，相关表达式会传播缺失'),
            (bool(snapshot['discarded_columns']), '存在未进入计算合同的列，原 CSV 已保留'),
        ] if condition]}
    if detail:
        result['preview'] = rows[:8]
        result['discarded_columns'] = snapshot['discarded_columns']
        result['parser_version'] = snapshot['parser_version']
        result['timestamp_semantics'] = snapshot['timestamp_semantics']
    return result
