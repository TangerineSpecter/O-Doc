"""Semantic suggestions sync as evidence; raw vectors and execution never do."""
import math
from quant.research.contracts import digest
from .projection import projection_data

LABELS = {'quant.factorrelation'}


def validate_relations(rows: dict, fail) -> None:
    factors = rows.get('quant.factorcandidate', {})
    reports = rows.get('quant.researchreport', {})
    entries = rows.get('quant.entry', {})
    revisions = rows.get('quant.factorrevision', {})
    for identity, fields in rows.get('quant.factorrelation', {}).items():
        left, right = str(fields.get('left')), str(fields.get('right'))
        a, b = factors.get(left), factors.get(right)
        if not a or not b or left >= right or fields.get('kind') != 'semantic_similar':
            fail('因子关系端点或类型无效')
        owners = [entries[reports[factor['report']]['entry']]['anthology'] for factor in (a, b)]
        if owners[0] != owners[1]:
            fail('因子关系跨文集引用')
        evidence = fields.get('evidence')
        required = {'method', 'projection_version', 'model_signature', 'model_name', 'similarity', 'threshold',
            'left_projection_hash', 'right_projection_hash', 'left_revision_id', 'right_revision_id', 'claim', 'comparison_limit'}
        if (not isinstance(evidence, dict) or set(evidence) != required or evidence['method'] != 'embedding-cosine-v1'
                or type(evidence['projection_version']) is not int or evidence['projection_version'] != 1
                or evidence['claim'] != 'semantic_similarity_only' or evidence['threshold'] != .7
                or evidence['comparison_limit'] != 2000 or type(evidence['similarity']) not in (int, float)
                or not math.isfinite(evidence['similarity']) or not .7 <= evidence['similarity'] <= 1
                or not isinstance(evidence['model_name'], str) or not evidence['model_name']
                or not isinstance(evidence['model_signature'], str) or len(evidence['model_signature']) != 64):
            fail('语义关系方法、模型或相似度格式无效')
        for side, candidate_id, factor in [('left', left, a), ('right', right, b)]:
            revision_id = evidence[side + '_revision_id']
            if not isinstance(revision_id, str):
                fail('关系引用的标签版本格式无效')
            if revision_id:
                revision = revisions.get(revision_id, {})
                if revision.get('candidate') != candidate_id:
                    fail('关系引用了其他候选的修订')
                curated = revision['data']
            else:
                curated = {key: factor['data'][key] for key in ('name', 'family', 'tags')} | {'aliases': [], 'note': ''}
            if projection_data(factor['data'], curated)[1] != evidence[side + '_projection_hash']:
                fail('关系输入投影与来源版本不一致')
        content_hash = digest(evidence)
        if fields.get('content_hash') != content_hash or identity != digest(['semantic-relation-v1', left, right, content_hash])[:40]:
            fail('因子关系证据哈希不一致')
