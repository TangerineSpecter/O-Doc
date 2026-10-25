"""Datasets are research evidence; received CSV and normalization must agree."""
from quant.models import MarketDataset
from quant.research.contracts import digest
from .data import META, parse_csv, dataset_hash

LABELS = {'quant.marketdataset'}


def validate_datasets(rows, anthologies, fail):
    records = rows.get('quant.marketdataset', {})
    for identity, fields in records.items():
        anthology_id = str(fields.get('anthology'))
        anthology = anthologies.get(anthology_id, {})
        snapshot = fields.get('snapshot')
        if anthology.get('type') != 'quant' or anthology.get('permission') != 'private' or not anthology.get('user_id'):
            fail('行情快照所属文集无效')
        if not isinstance(fields.get('name'), str) or not fields['name'].strip() or len(fields['name']) > 200 or not isinstance(snapshot, dict):
            fail('行情快照名称或结构无效')
        expected = parse_csv(fields.get('raw_csv'), {key: snapshot.get(key) for key in META})
        if expected != snapshot or fields.get('content_hash') != dataset_hash(snapshot):
            fail('行情原 CSV 与规范化结果不一致')
        if identity != digest(['market-dataset-v1', anthology_id, fields['name'], fields['content_hash']])[:40]:
            fail('行情快照稳定标识不一致')
    for local in MarketDataset.objects.filter(pk__in=records):
        fields = records[local.pk]
        if any(fields.get(field.removesuffix('_id') if field.endswith('_id') else field) != getattr(local, field) for field in local.SNAPSHOT_FIELDS):
            fail('同一行情快照的不可变内容发生冲突')
