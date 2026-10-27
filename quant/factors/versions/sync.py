"""Rebuild authored formulas and experiment lineages; never execute on restore."""
from types import SimpleNamespace
import re
from quant.models import FactorFormulaVersion, FactorFormulaSelection
from quant.research.contracts import digest
from quant.factors.expression import expression_hash
from .contracts import definition, authored, version_id, candidate_id, experiment_version, selection_data


def validate_versions(rows: dict, fail) -> None:
    candidates = rows.get('quant.factorcandidate', {})
    versions = rows.get('quant.factorformulaversion', {})
    selections = rows.get('quant.factorformulaselection', {})
    reports, entries = rows.get('quant.researchreport', {}), rows.get('quant.entry', {})
    def collection(identity):
        return entries.get(reports.get(candidates.get(identity, {}).get('report'), {}).get('entry'), {}).get('anthology')
    def root_of(identity):
        candidate = candidates.get(identity, {})
        pointer = candidate.get('formula_version_id', '')
        return versions.get(pointer, {}).get('root') if pointer else identity
    used, keys, dependencies = set(), set(), {}
    for identity, row in versions.items():
        child_id, root_id, data = row.get('candidate'), row.get('root'), row.get('data')
        child, root = candidates.get(child_id, {}), candidates.get(root_id, {})
        if (not child or not root or child_id in used or child.get('formula_version_id') != identity
                or not isinstance(row.get('request_key'), str) or len(row['request_key']) > 64
                or not isinstance(data, dict) or type(data.get('version')) is not int or data['version'] != 1
                or data.get('origin') not in ('authored', 'experiment', 'ai_repair', 'ai_study') or row.get('content_hash') != digest(data)):
            fail('公式版本缺少候选、根身份或不可变合同')
        used.add(child_id)
        parents = data.get('parents')
        if (not isinstance(parents, list) or not 1 <= len(parents) <= 8
                or any(not isinstance(ref, dict) or set(ref) != {'id', 'hash'} or not isinstance(ref['id'], str)
                    or ref['id'] not in candidates or ref['hash'] != candidates[ref['id']].get('content_hash') for ref in parents)
                or len({ref['id'] for ref in parents}) != len(parents)):
            fail('公式版本父代缺失、重复或内容改变')
        parent_ids = [ref['id'] for ref in parents]
        if any(collection(key) != collection(child_id) for key in [root_id, *parent_ids]):
            fail('公式版本不能跨文集引用')
        roots = {root_of(key) for key in parent_ids}
        dependencies[child_id] = set(parent_ids)
        if data['origin'] == 'authored':
            key = (root_id, row['request_key'])
            if (set(data) != {'version', 'origin', 'parents', 'definition', 'reason'} or len(parents) != 1
                    or not re.fullmatch(r'[A-Za-z0-9_-]{16,64}', row['request_key']) or key in keys
                    or not isinstance(data['reason'], str) or not 0 < len(data['reason'].strip()) <= 3000
                    or digest(definition(data['definition'])) != digest(data['definition']) or roots != {root_id}
                    or identity != version_id(root_id, row['request_key']) or child_id != candidate_id(identity)
                    or child.get('derived_checkpoint_id') or type(child.get('ordinal')) is not int or child['ordinal'] != 0
                    or child.get('report') != candidates[parent_ids[0]].get('report')):
                fail('人工公式版本定义、来源上下文或请求标识无效')
            from quant.parameters.bindings import validate_inheritance
            validate_inheritance(data['definition']['parameters'], candidates[parent_ids[0]]['data']['parameters'])
            keys.add(key)
            expected = authored(data, identity, root_id)
            if child.get('data') != expected or child.get('content_hash') != digest(expected) or child.get('expression_hash') != expression_hash(expected):
                fail('人工公式候选与版本定义不一致')
        elif data['origin'] == 'ai_repair':
            from quant.repairs.contracts import identifiers, candidate_data as repaired_data
            from quant.repairs.services import version_data as repair_version
            report_id, index = data.get('report_id'), data.get('factor_index')
            report = reports.get(report_id, {})
            item = next((item for item in report.get('data', {}).get('factor_repair', {}).get('items', [])
                if item['factor_index'] == index and item['status'] == 'revised'), None)
            if not item or type(index) is not int:
                fail('AI 修订版本缺少原始阶段结果')
            expected_root, expected_version, expected_candidate = identifiers(report_id, index)
            expected = repaired_data(item, report_id)
            if (row['request_key'] or row.get('root') != expected_root or identity != expected_version or child_id != expected_candidate
                    or child.get('qualification_version') != 1
                    or len(parents) != 1 or parent_ids != [expected_root] or child.get('report') != report_id
                    or data != repair_version(item, expected_root, candidates[expected_root]['content_hash'], report_id)
                    or child.get('derived_checkpoint_id') or type(child.get('ordinal')) is not int or child['ordinal'] != 0
                    or child['data'] != expected or child.get('content_hash') != digest(expected)
                    or child.get('expression_hash') != expression_hash(expected)):
                fail('AI 修订版本与冻结的修订定义或父代不一致')
        elif data['origin'] == 'ai_study':
            from quant.studies.sync import validate_formula
            expected_root = next(iter(roots)) if len(roots) == 1 else child_id
            if root_id != expected_root: fail('AI研究谱系根无效')
            validate_formula(identity, row, child, root_id, parent_ids, rows, fail)
        else:
            expected = experiment_version(SimpleNamespace(derived_checkpoint_id=child.get('derived_checkpoint_id')), [
                SimpleNamespace(pk=key, content_hash=candidates[key]['content_hash']) for key in parent_ids])
            expected_root = next(iter(roots)) if len(roots) == 1 else child_id
            if (row['request_key'] or data != expected or not child.get('derived_checkpoint_id')
                    or child['data'].get('derivation', {}).get('parent_candidate_ids') != parent_ids
                    or root_id != expected_root
                    or identity != digest(['factor-formula-experiment-1', child['derived_checkpoint_id']])[:40]):
                fail('实验公式版本与已验证的实验父代不一致')
    from quant.repairs.contracts import identifiers as repair_identifiers
    for report_id, report in reports.items():
        for item in report.get('data', {}).get('factor_repair', {}).get('items', []):
            if item['status'] == 'revised':
                root, version, child = repair_identifiers(report_id, item['factor_index'])
                if versions.get(version, {}).get('candidate') != child or child not in candidates or root not in candidates:
                    fail('AI 修订产物或谱系记录缺失')
    for identity, row in candidates.items():
        pointer = row.get('formula_version_id', '')
        if pointer and (not isinstance(pointer, str) or versions.get(pointer, {}).get('candidate') != identity):
            fail('候选公式版本记录缺失或跨候选')
        # Include legacy derived edges as well, so new authored links cannot
        # close a cycle through older experiments without version records.
        if row.get('derived_checkpoint_id'):
            dependencies.setdefault(identity, set(row['data']['derivation']['parent_candidate_ids']))
        head = row.get('formula_selection_id', '')
        if not isinstance(head, str) or head and (root_of(identity) != identity or selections.get(head, {}).get('root') != identity):
            fail('当前研究版本选择指针无效')
    pending = {key: len(parents & dependencies.keys()) for key, parents in dependencies.items()}
    children = {}
    for key, parents in dependencies.items():
        for parent in parents: children.setdefault(parent, []).append(key)
    ready, done = [key for key, count in pending.items() if count == 0], 0
    while ready:
        done += 1
        for child in children.get(ready.pop(), []):
            pending[child] -= 1
            if not pending[child]: ready.append(child)
    if done != len(dependencies): fail('公式版本父代存在循环')
    keys = set()
    for identity, row in selections.items():
        root_id, child_id, data = row.get('root'), row.get('candidate'), row.get('data')
        key = (root_id, row.get('request_key'))
        if (root_id not in candidates or child_id not in candidates or root_of(root_id) != root_id
                or root_of(child_id) != root_id or key in keys or not isinstance(row.get('request_key'), str)
                or not re.fullmatch(r'[A-Za-z0-9_-]{16,64}', row['request_key']) or not isinstance(row.get('parent_id'), str)
                or not isinstance(data, dict) or type(data.get('version')) is not int or data['version'] != 1
                or not isinstance(data.get('reason'), str) or not 0 < len(data['reason'].strip()) <= 3000
                or data != selection_data(SimpleNamespace(content_hash=candidates[child_id]['content_hash']), data['reason'])
                or row.get('content_hash') != digest(data)
                or identity != digest(['factor-formula-selection-1', root_id, row['request_key']])[:40]):
            fail('当前研究版本选择无效或被伪装为实证晋级')
        keys.add(key)
        parent, seen = row['parent_id'], {identity}
        while parent:
            previous = selections.get(parent, {})
            if parent in seen or previous.get('root') != root_id: fail('研究版本选择链循环、缺失或跨因子')
            seen.add(parent); parent = previous.get('parent_id')
    for model in (FactorFormulaVersion, FactorFormulaSelection):
        incoming = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=incoming).values('id', *model.SNAPSHOT_FIELDS):
            if any(local[key] != incoming[local['id']].get(model._meta.get_field(key).name) for key in model.SNAPSHOT_FIELDS):
                fail('已有公式版本或选择事实不可覆盖')
