"""Frozen v1 scope and validation, shared by execution, publication and restore."""
import copy
from rest_framework.exceptions import ValidationError
from quant.factors.versions.contracts import definition
from quant.factors.contracts import Candidate, Evidence, validate_evidence
from quant.parameters.domains import validate_evidence as validate_domains
from quant.research.contracts import digest
from quant.verification.structure import qualification


def plan(factors: list[dict]) -> dict:
    targets = []
    for index, factor in enumerate(factors):
        if (factor.get('expression') or {}).get('op') == 'python':
            continue  # A Python implementation does not need conversion to our DSL.
        checked = qualification(factor)
        if checked['reuse_status'] != 'reusable' or checked['configuration']['status'] != 'declared_defaults_valid':
            targets.append(index)
    return {'version': 1, 'selected': targets[:4], 'omitted': targets[4:]}


def original_definition(factor: dict) -> dict:
    return {key: copy.deepcopy(factor[key]) for key in Candidate().fields if key != 'evidence'}


def validate(value: dict, factors: list[dict], source: dict | None = None) -> dict:
    scope = plan(factors)
    if not isinstance(value, dict) or set(value) - {'version', 'selected', 'omitted', 'items'} or not isinstance(value.get('items'), list):
        raise ValidationError('AI 修订必须返回当前范围的 items 数组')
    if 'version' in value and (type(value['version']) is not int or value['version'] != 1):
        raise ValidationError('AI 修订策略版本无效')
    for key in ('selected', 'omitted'):
        if key in value and (not isinstance(value[key], list) or any(type(i) is not int for i in value[key]) or value[key] != scope[key]):
            raise ValidationError('AI 修订范围不能改写或用布尔值代替序号')
    items, seen = [], set()
    for row in value['items']:
        if not isinstance(row, dict) or set(row) - {'factor_index', 'status', 'summary', 'definition', 'evidence', 'remaining_unknowns', 'before_hash', 'after_hash', 'changed_fields'}:
            raise ValidationError('AI 修订条目结构无效')
        index = row.get('factor_index')
        if type(index) is not int or index not in scope['selected'] or index in seen:
            raise ValidationError('AI 修订只能覆盖本次固定范围，不能重复或漏项')
        seen.add(index)
        if row.get('status') not in ('revised', 'unresolved') or not isinstance(row.get('summary'), str) or not 0 < len(row['summary'].strip()) <= 3000:
            raise ValidationError('AI 修订需说明结果与原因')
        unknowns = row.get('remaining_unknowns')
        if not isinstance(unknowns, list) or len(unknowns) > 8 or any(not isinstance(v, str) or not v.strip() or len(v) > 1000 for v in unknowns):
            raise ValidationError('AI 修订的未知项格式无效')
        evidence = Evidence(data=row.get('evidence'), many=True, max_length=5)
        evidence.is_valid(raise_exception=True)
        old = original_definition(factors[index])
        revised, changed = None, []
        if row['status'] == 'revised':
            revised = definition(row.get('definition'))
            changed = [key for key in old if digest(old[key]) != digest(revised[key])]
            if revised['role'] != old['role'] or not set(old['dependencies']) <= set(revised['dependencies']):
                raise ValidationError('AI 修订不能变更模块用途或删除原平台依赖声明来规避检查')
            categories = {p['name']: p['category'] for p in old['parameters']}
            if any(p['category'] == 'signal' and categories.get(p['name'], 'signal') != 'signal' for p in revised['parameters']):
                raise ValidationError('AI 修订不能将展示、风险或执行参数改为收益优化信号参数')
            if not changed or not evidence.validated_data or qualification(dict(revised, evidence=[]))['reuse_status'] != 'reusable':
                raise ValidationError('AI 修订须有实际变化、原文依据并通过受控引用／类型检查')
            if source is not None:
                validate_domains(revised['parameters'], source)
        elif row.get('definition') is not None:
            raise ValidationError('未解决的修订不能携带可执行定义')
        if source is not None:
            validate_evidence([{'evidence': list(evidence.validated_data)}], source)
        items.append({'factor_index': index, 'status': row['status'], 'summary': row['summary'].strip(),
            'definition': revised, 'evidence': list(evidence.validated_data), 'remaining_unknowns': copy.deepcopy(unknowns),
            'before_hash': digest(old), 'after_hash': digest(revised) if revised is not None else '', 'changed_fields': changed})
    if seen != set(scope['selected']):
        raise ValidationError('AI 修订未覆盖所有选中的问题，无法修订也须说明原因')
    return {**scope, 'items': sorted(items, key=lambda row: row['factor_index'])}


def identifiers(report_id: str, index: int) -> tuple[str, str, str]:
    root = digest(['factor-occurrence-v1', report_id, index])[:40]
    version = digest(['factor-repair-version-1', report_id, index])[:40]
    return root, version, digest(['factor-repaired-candidate-1', version])[:40]


def candidate_data(item: dict, report_id: str) -> dict:
    root, version, _ = identifiers(report_id, item['factor_index'])
    return copy.deepcopy(item['definition']) | {'evidence': [], 'formula_version': {'version': 1,
        'version_id': version, 'root_id': root, 'origin': 'ai_repair', 'parent_candidate_ids': [root],
        'claim': 'ai_revised_definition_not_source_extraction_or_platform_equivalence'}}


def selected_factor(result: dict, index: int, report_id: str = '') -> tuple[str, dict]:
    item = next((row for row in result.get('factor_repair', {}).get('items', []) if row['factor_index'] == index and row['status'] == 'revised'), None)
    if item:
        return identifiers(report_id, index)[2] if report_id else f'factor:{index}', candidate_data(item, report_id)
    return (identifiers(report_id, index)[0] if report_id else f'factor:{index}'), result['factors'][index]


def research_factors(outputs: dict) -> list[dict]:
    result = dict(outputs['extract'], factor_repair=outputs.get('repair', {}))
    return [selected_factor(result, i)[1] for i in range(len(result['factors']))]
