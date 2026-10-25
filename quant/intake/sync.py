"""Verify fixed membership, child identities, retry lineage and terminal counts."""
import re
from quant.models import IntakeBatch, IntakeDispatch, IntakeOutcome
from quant.research.contracts import digest
from .contracts import validate_plan, ACTIVE, REASONS, SKIPS

LABELS = {'quant.intakebatch', 'quant.intakedispatch', 'quant.intakeoutcome'}


def validate_batches(rows, anthologies, fail):
    batches, dispatches, outcomes, runs, sources, materials, entries = (rows.get('quant.' + name, {}) for name in
        ('intakebatch', 'intakedispatch', 'intakeoutcome', 'airun', 'sourcerevision', 'sourcematerial', 'entry'))
    grouped, terminal, used_runs, keys = {key: [] for key in batches}, {}, set(), set()
    for identity, batch in batches.items():
        plan = validate_plan(batch['plan'])
        collection = anthologies.get(str(batch.get('anthology')), {})
        key = batch.get('request_key')
        if collection.get('type') != 'quant' or collection.get('permission') != 'private' or not collection.get('user_id'):
            fail('收集批次必须属于私密量化文集')
        if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,64}', key) or (batch['anthology'], key) in keys:
            fail('收集批次请求标识无效或重复')
        keys.add((batch['anthology'], key))
        if identity != digest(['intake-batch-v1', str(batch['anthology']), key])[:40] or batch.get('content_hash') != digest(plan):
            fail('收集批次身份或内容摘要不一致')
        for ordinal, source_id in enumerate(plan['sources'], 1):
            source = sources.get(source_id, {})
            material = materials.get(str(source.get('material')), {})
            entry = entries.get(str(material.get('entry')), {})
            if entry.get('anthology') != batch['anthology'] or source.get('payload', {}).get('provenance') != 'intake':
                fail('批次来源跨文集或不是收集原件')
            if not plan['parent_id']:
                request = digest(['intake-material-v1', str(batch['anthology']), key, ordinal])[:40]
                if source_id != digest(['intake', str(batch['anthology']), request])[:40]:
                    fail('批次来源顺序或归档身份不一致')
    for identity, step in dispatches.items():
        parent, ordinal, run_id = str(step.get('batch')), step.get('ordinal'), step.get('run')
        if parent not in batches or type(ordinal) is not int or not 1 <= ordinal <= len(batches[parent]['plan']['sources']):
            fail('批次分析顺序无效')
        if identity != digest(['intake-dispatch-v1', parent, ordinal])[:40]:
            fail('批次分析身份无效')
        if not batches[parent]['plan']['analyze']:
            fail('未授权分析的批次包含分析任务')
        grouped[parent].append(step)
        if run_id:
            run = runs.get(str(run_id), {})
            if (run_id in used_runs or step.get('reason') != '' or run.get('kind') != 'analyze'
                    or run.get('source') != batches[parent]['plan']['sources'][ordinal - 1]
                    or run.get('model_id') != batches[parent]['plan']['model_id']
                    or run.get('request_key') != digest(['intake-analysis-v1', parent, ordinal])[:40]):
                fail('批次分析引用、模型或请求不一致')
            used_runs.add(run_id)
        elif step.get('reason') not in SKIPS:
            fail('未发起的分析缺少原因')
    for identity, result in outcomes.items():
        parent, data = str(result.get('batch')), result.get('data')
        if parent not in batches or parent in terminal or not isinstance(data, dict):
            fail('批次终态引用无效')
        if identity != digest(['intake-outcome-v1', parent])[:40] or result.get('content_hash') != digest(data):
            fail('批次终态身份或摘要无效')
        steps = grouped[parent]
        complete = sum(runs.get(str(step.get('run')), {}).get('status') == 'completed' for step in steps)
        calls = sum(bool(step.get('run')) for step in steps)
        reason = data.get('reason')
        if reason not in REASONS:
            fail('批次停止原因无效')
        status = ('completed' if complete == len(batches[parent]['plan']['sources']) else 'partial') if reason == 'completed' else reason
        expected = {'version': 1, 'reason': reason, 'status': status, 'message': REASONS[reason],
            'dispatched': len(steps), 'reserved_calls': calls, 'completed': complete}
        if digest(data) != digest(expected) or any(runs.get(str(step.get('run')), {}).get('status') in ACTIVE for step in steps):
            fail('批次终态计数或子任务状态不一致')
        if reason == 'completed' and len(steps) != len(batches[parent]['plan']['sources']):
            fail('批次仍有未处理来源')
        if (reason == 'archived') != (not batches[parent]['plan']['analyze']) or (reason == 'archived' and steps):
            fail('仅归档批次与执行事实不一致')
        terminal[parent] = data
    for identity, batch in batches.items():
        steps = sorted(grouped[identity], key=lambda step: step['ordinal'])
        if [step['ordinal'] for step in steps] != list(range(1, len(steps) + 1)):
            fail('批次分析序号重复或不连续')
        if any(runs.get(str(step.get('run')), {}).get('status') in ACTIVE for step in steps[:-1]):
            fail('批次在前一分析结束前启动后续任务')
        parent = batch['plan']['parent_id']
        if parent:
            previous = batches.get(parent)
            if not previous or previous['anthology'] != batch['anthology'] or not batch['plan']['analyze']:
                fail('重试来源批次无效')
            done = {step['ordinal'] for step in grouped[parent] if runs.get(str(step.get('run')), {}).get('status') == 'completed'}
            expected = [source for ordinal, source in enumerate(previous['plan']['sources'], 1) if ordinal not in done]
            if batch['plan']['sources'] != expected or any(runs.get(str(step.get('run')), {}).get('status') in ACTIVE for step in grouped[parent]):
                fail('重试包含已完成资料或遗漏未完成资料')
        seen, ancestor = {identity}, parent
        while ancestor:
            if ancestor in seen or ancestor not in batches:
                fail('批次重试谱系有循环或缺失')
            seen.add(ancestor)
            ancestor = batches[ancestor]['plan']['parent_id']
    for model in (IntakeBatch, IntakeDispatch, IntakeOutcome):
        records = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=records):
            for field in model.SNAPSHOT_FIELDS:
                key = field[:-3] if field.endswith('_id') else field
                if digest(records[local.pk].get(key)) != digest(getattr(local, field)):
                    fail('已有批次研究事实不可覆盖')
