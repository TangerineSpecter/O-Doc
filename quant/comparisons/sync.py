"""Rebuild direct output evidence; merging never edits its original candidates."""
from rest_framework.exceptions import ValidationError

from quant.models import FactorComparison, FactorMerge, FactorMergeWithdrawal
from quant.research.contracts import digest
from quant.research_memory.contract import instant
from .contracts import comparison_hash, merge_hash, request_key, validate_plan, withdrawal_hash
from .kernel import evaluate_pair, failure_result, validate_policy

LABELS = {'quant.factorcomparison', 'quant.factormerge', 'quant.factormergewithdrawal'}


def validate_comparisons(rows: dict, anthologies: dict, fail) -> None:
    comparisons = rows.get('quant.factorcomparison', {})
    merges = rows.get('quant.factormerge', {})
    withdrawals = rows.get('quant.factormergewithdrawal', {})
    factors = rows.get('quant.factorcandidate', {})
    reports = rows.get('quant.researchreport', {})
    sources = rows.get('quant.sourcerevision', {})
    entries = rows.get('quant.entry', {})
    datasets = rows.get('quant.marketdataset', {})
    revisions = rows.get('quant.factorrevision', {})

    def owner(fields):
        identity = str(fields.get('anthology'))
        collection = anthologies.get(identity, {})
        if collection.get('type') != 'quant' or collection.get('permission') != 'private' or not collection.get('user_id'):
            fail('因子对照或合并不属于私密量化文集')
        return identity

    def before(dependency, record):
        # Both live and restored records use the sync format's millisecond precision.
        if instant(dependency['created_at']) > instant(record['created_at']):
            fail('因子对照或合并引用未来记录')

    seen = set()
    for identity, fields in comparisons.items():
        collection = owner(fields)
        key = (collection, fields.get('request_key'))
        if not request_key(key[1]) or key in seen or identity != digest(['factor-comparison-v1', *key])[:40]:
            fail('因子对照请求标识重复或无效')
        seen.add(key)
        plan, result = fields.get('plan'), fields.get('result')
        validate_plan(plan)
        for side in ('left', 'right'):
            frozen = plan[side]
            factor = factors.get(str(fields.get(side)), {})
            report = reports.get(str(factor.get('report')), {})
            source = sources.get(str(report.get('source')), {})
            entry = entries.get(str(report.get('entry')), {})
            if (str(fields.get(side)) != frozen['id'] or entry.get('anthology') != collection
                    or factor.get('data') != frozen['candidate'] or factor.get('content_hash') != frozen['candidate_hash']
                    or frozen['report_id'] != factor.get('report') or frozen['report_hash'] != report.get('content_hash')
                    or frozen['source_id'] != report.get('source') or frozen['source_hash'] != source.get('content_hash')):
                fail('因子对照的候选、原始出处或所属文集被改写')
            for dependency in (factor, report, source):
                before(dependency, fields)
        dataset = datasets.get(str(fields.get('dataset')), {})
        if (fields.get('dataset') != plan['dataset_id'] or dataset.get('anthology') != collection
                or dataset.get('content_hash') != plan['dataset_hash']):
            fail('因子对照行情归属或版本无效')
        before(dataset, fields)
        validate_policy(plan['policy'], len(dataset['snapshot']['rows']))
        if not isinstance(result, dict):
            fail('因子对照结果缺失')
        if result.get('evaluation_status') == 'timed_out':
            expected = failure_result(dataset['snapshot'], plan['policy'])
        elif result.get('evaluation_status') == 'completed':
            try:
                expected = evaluate_pair(*[{key: plan[side][key] for key in ('candidate', 'bindings', 'parameters')}
                    for side in ('left', 'right')], dataset['snapshot'], plan['policy'])
            except TimeoutError as exc:
                raise ValidationError('重新核对因子比较超过计算预算，请使用与原记录兼容的计算环境') from exc
        else:
            fail('因子对照执行状态无效')
        if expected != result or fields.get('content_hash') != comparison_hash(plan, result):
            fail('因子对照结果、完整输出或范围与固定输入不一致；请核对计算依赖版本')

    seen = set()
    for identity, fields in merges.items():
        collection = owner(fields)
        key = (collection, fields.get('request_key'))
        if not request_key(key[1]) or key in seen or identity != digest(['factor-merge-v1', *key])[:40]:
            fail('因子合并请求标识重复或无效')
        seen.add(key)
        comparison = comparisons.get(str(fields.get('comparison')), {})
        if (comparison.get('anthology') != collection or comparison.get('result', {}).get('status') != 'pass'
                or comparison.get('result', {}).get('evaluation_status') != 'completed'):
            fail('因子合并缺少同文集已完成的直接一致性依据')
        before(comparison, fields)
        if (not isinstance(fields.get('name'), str) or not 1 <= len(fields['name'].strip()) <= 200
                or not isinstance(fields.get('reason'), str) or len(fields['reason']) > 3000):
            fail('因子合并名称或说明无效')
        curated = fields.get('curation')
        if not isinstance(curated, dict) or set(curated) != {'version', 'left', 'right'} or type(curated['version']) is not int or curated['version'] != 1:
            fail('因子合并的名称别名快照无效')
        for side in ('left', 'right'):
            candidate_id = comparison[side]
            frozen = curated[side]
            if not isinstance(frozen, dict) or set(frozen) != {'candidate_id', 'revision_id', 'data'} or frozen['candidate_id'] != candidate_id or not isinstance(frozen['revision_id'], str):
                fail('因子合并的整理出处引用无效')
            if frozen['revision_id']:
                revision = revisions.get(frozen['revision_id'], {})
                if revision.get('candidate') != candidate_id:
                    fail('因子合并引用其他候选的名称修订')
                before(revision, fields)
                expected = revision['data']
            else:
                original = factors[candidate_id]['data']
                expected = {key: original[key] for key in ('name', 'family', 'tags')} | {'aliases': [], 'note': ''}
            if frozen['data'] != expected:
                fail('因子合并未完整保留当时名称和别名')
        expected_hash = merge_hash(collection, fields['comparison'], comparison['content_hash'], fields['name'], fields['reason'], curated)
        if fields.get('content_hash') != expected_hash:
            fail('因子合并证据哈希不一致')

    seen, targets = set(), set()
    for identity, fields in withdrawals.items():
        collection = owner(fields)
        key = (collection, fields.get('request_key'))
        if (not request_key(key[1]) or key in seen or fields.get('merge') in targets
                or identity != digest(['factor-merge-withdrawal-v1', *key])[:40]):
            fail('因子合并撤销重复或请求标识无效')
        seen.add(key); targets.add(fields.get('merge'))
        merge = merges.get(str(fields.get('merge')), {})
        if merge.get('anthology') != collection or not isinstance(fields.get('reason'), str) or len(fields['reason']) > 3000:
            fail('因子合并撤销缺少同文集的原合并记录')
        before(merge, fields)
        if fields.get('content_hash') != withdrawal_hash(collection, fields['merge'], merge['content_hash'], fields['reason']):
            fail('因子合并撤销哈希不一致')

    for model in (FactorComparison, FactorMerge, FactorMergeWithdrawal):
        incoming = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=incoming).values('id', *model.SNAPSHOT_FIELDS):
            fields = incoming[str(local['id'])]
            if any(local[key] != fields.get(model._meta.get_field(key).name) for key in model.SNAPSHOT_FIELDS):
                fail('因子对照或合并的已有不可变事实冲突')
