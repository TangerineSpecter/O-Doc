"""Authored definitions are local research artifacts, never source excerpts."""
import copy
import json
from rest_framework.exceptions import ValidationError
from quant.factors.contracts import Candidate
from quant.research.contracts import digest

VERSION = 1


def definition(raw: object) -> dict:
    if not isinstance(raw, dict) or set(raw) != set(Candidate().fields) - {'evidence'}:
        raise ValidationError('公式定义须包含完整候选字段，不携带原文引证或实验谱系')
    serializer = Candidate(data=dict(raw, evidence=[]))
    serializer.fields['evidence'].min_length = 0
    serializer.is_valid(raise_exception=True)
    result = dict(serializer.validated_data)
    result.pop('evidence')
    if len(json.dumps(result, ensure_ascii=False, allow_nan=False)) > 120000:
        raise ValidationError('公式定义超过大小上限')
    return result


def authored(data: dict, identity: str, root_id: str) -> dict:
    return copy.deepcopy(data['definition']) | {'evidence': [], 'formula_version': {
        'version': VERSION, 'version_id': identity, 'root_id': root_id,
        'origin': 'authored', 'parent_candidate_ids': [ref['id'] for ref in data['parents']],
        'claim': 'authored_definition_not_source_extraction'}}


def version_id(root_id: str, request_key: str) -> str:
    return digest(['factor-formula-version-1', root_id, request_key])[:40]


def candidate_id(identity: str) -> str:
    return digest(['factor-authored-candidate-1', identity])[:40]


def experiment_version(candidate, parents: list) -> dict:
    return {'version': VERSION, 'origin': 'experiment', 'parents': [{'id': row.pk, 'hash': row.content_hash} for row in parents],
        'reason': '本机受控实验生成，归档为研究版本；独立表现与原平台仍待验证。',
        'checkpoint_id': candidate.derived_checkpoint_id}


def selection_data(candidate, reason: str) -> dict:
    return {'version': VERSION, 'kind': 'working_version_only', 'candidate_hash': candidate.content_hash,
        'reason': reason, 'claim': 'does_not_change_scores_or_empirical_evidence'}
