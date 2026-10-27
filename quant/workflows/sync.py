"""Rebuild stage contracts and reuse links without issuing model/tool requests."""
import re
from quant.models import AIRun, WorkflowStep, WorkflowOutcome
from quant.research.contracts import digest
from quant.research.analysis import validate_analysis
from .contracts import stages, MODEL_STAGES, input_snapshot, normalized, validate_output, combined, may_reuse, uses_snippets, uses_vocabulary
from .comparison import match

LABELS = {'quant.workflowstep', 'quant.workflowoutcome'}


def validate_workflows(rows: dict, fail) -> None:
    runs = rows.get('quant.airun', {})
    sources = rows.get('quant.sourcerevision', {})
    steps = rows.get('quant.workflowstep', {})
    outcomes = rows.get('quant.workflowoutcome', {})
    from quant.native_reviews.sync import validate_workflows as validate_native_workflows
    native_runs=validate_native_workflows(rows,fail)
    native_steps={key for key,value in steps.items() if value.get('run') in native_runs}
    steps={key:value for key,value in steps.items() if value.get('run') not in native_runs}
    outcomes={key:value for key,value in outcomes.items() if value.get('step') not in native_steps}
    by_step, by_run = {}, {}
    # Workflow identity is a business fact, even though execution state may
    # change during recovery. A rehashed snapshot cannot downgrade it away.
    frozen = ('workflow_version', 'resume_run_id', 'restart_stage', 'source_id', 'requirements', 'model_id', 'entry_id')
    for local in AIRun.objects.filter(pk__in=runs, workflow_version__in=(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28)).values('id', *frozen):
        for key in frozen:
            field = AIRun._meta.get_field(key).name
            if local[key] != runs[local['id']].get(field, '' if field == 'restart_stage' else None):
                fail('已有研究工作流输入不可覆盖')
    for identity, row in outcomes.items():
        parent = row.get('step')
        if parent not in steps or parent in by_step:
            fail('阶段结果重复或缺少步骤')
        value = row.get('data')
        if (not isinstance(value, dict) or set(value) != {'version', 'status', 'output', 'error', 'reused_from', 'elapsed_ms', 'usage'}
                or type(value['version']) is not int or value['version'] != 1
                or value['status'] not in ('completed', 'failed') or not isinstance(value['output'], dict)
                or not isinstance(value['error'], str) or len(value['error']) > 300
                or not isinstance(value['reused_from'], str) or type(value['elapsed_ms']) is not int or value['elapsed_ms'] < 0
                or row.get('content_hash') != digest(value) or identity != digest(['workflow-outcome-1', parent])[:40]):
            fail('阶段结果合同或哈希无效')
        usage = value['usage']
        if (not isinstance(usage, dict) or set(usage) != {'request_count', 'event_ids', 'input_tokens', 'output_tokens', 'total_tokens'}
                or type(usage['request_count']) is not int or usage['request_count'] < 0
                or not isinstance(usage['event_ids'], list) or len(usage['event_ids']) != usage['request_count']
                or any(not isinstance(key, str) or not key or len(key) > 40 for key in usage['event_ids'])
                or len(set(usage['event_ids'])) != len(usage['event_ids'])
                or any(usage[key] is not None and (type(usage[key]) is not int or usage[key] < 0) for key in ('input_tokens', 'output_tokens', 'total_tokens'))):
            fail('阶段用量记录无效')
        if value['status'] == 'failed' and (value['output'] or not value['error'] or value['reused_from']):
            fail('失败阶段不能携带正式结果或复用引用')
        if value['status'] == 'completed' and value['error']:
            fail('成功阶段不能同时携带失败状态')
        by_step[parent] = (identity, value)
    for identity, row in steps.items():
        run = runs.get(row.get('run'), {})
        ordinal, stage = row.get('ordinal'), row.get('stage')
        order = stages(run.get('workflow_version', 0))
        if (run.get('kind') != 'analyze' or run.get('workflow_version') not in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28) or type(ordinal) is not int
                or not 1 <= ordinal <= len(order) or stage != order[ordinal - 1]
                or identity != digest(['workflow-step-1', row['run'], ordinal])[:40]
                or not isinstance(row.get('input'), dict) or row.get('content_hash') != digest(row['input'])):
            fail('阶段输入版本、身份或归属无效')
        by_run.setdefault(row['run'], []).append((identity, row))
    for run_id, run in runs.items():
        version = run.get('workflow_version', 0)
        previous_id = run.get('resume_run_id', '')
        restart_stage = run.get('restart_stage', '')
        if type(version) is not int or version not in (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28) or not isinstance(previous_id, str):
            fail('研究工作流版本无效')
        if restart_stage not in ('', *stages(version)) or restart_stage and not previous_id:
            fail('重跑阶段或原研究引用无效')
        if not version:
            if previous_id or restart_stage or run_id in by_run:
                fail('历史单次研究不能携带阶段重试')
            continue
        if run.get('kind') != 'analyze':
            fail('此任务类型不支持阶段研究')
        seen, parent, child = {run_id}, previous_id, run
        while parent:
            old = runs.get(parent, {})
            child_restart = child.get('restart_stage', '')
            allowed = ('failed', 'cancelled', 'interrupted', 'completed') if child_restart else ('failed', 'cancelled', 'interrupted')
            cross_source = old.get('source') != child.get('source')
            old_source = sources.get(old.get('resolved_source') or old.get('source'), {})
            child_source = sources.get(child.get('source'), {})
            valid_link = (uses_snippets(child.get('workflow_version')) and not child_restart and old.get('status') == 'completed'
                and old.get('workflow_version') in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28) and old_source.get('material') == child_source.get('material')) if cross_source else (
                old.get('workflow_version') == child.get('workflow_version') and old.get('status') in allowed)
            if (parent in seen or old.get('entry') != run['entry'] or old.get('kind') != 'analyze' or not valid_link):
                fail('阶段重试链缺失、循环或来源不一致')
            if child_restart and not any(row['stage'] == child_restart for _, row in by_run.get(parent, [])):
                fail('原研究没有开始所选重跑阶段')
            seen.add(parent)
            child = old
            parent = old.get('resume_run_id', '')
        ordered = sorted(by_run.get(run_id, []), key=lambda pair: pair[1]['ordinal'])
        outputs, snippet_plan = {}, None
        vocabulary_ref, vocabulary = None, None
        baseline = {}
        if uses_snippets(version):
            from .baseline import resolve_rows, cache_for
            from . import snippets
            baseline = cache_for(resolve_rows(run, rows), restart_stage)
        for expected_ordinal, (identity, row) in enumerate(ordered, 1):
            stage = row['stage']
            if row['ordinal'] != expected_ordinal:
                fail('阶段序号不连续')
            source_id = run['source'] if stage == 'normalize' else run.get('resolved_source') or run['source']
            payload = sources[source_id]['payload']
            model = row['input'].get('model')
            if stage in MODEL_STAGES:
                if (not isinstance(model, dict) or set(model) != {'model_id', 'model_name', 'provider_type', 'configuration_hash'}
                        or any(not isinstance(v, str) or len(v) > 200 for v in model.values())
                        or model['model_id'] != run['model_id'] or not re.fullmatch(r'[0-9a-f]{64}', model['configuration_hash'])):
                    fail('阶段模型快照无效')
            elif model != {}:
                fail('确定性步骤不能伪装为模型调用')
            library = row['input'].get('library')
            if stage == 'compare':
                validate_library(library, run, rows, fail)
                from .memory import retain_on_resume
                prior=next((old for _,old in by_run.get(previous_id,[]) if old['stage']==stage),None)
                ancestor=runs.get(previous_id,{})
                retain=bool(prior and not restart_stage and retain_on_resume(version,ancestor.get('source'),run['source'],ancestor.get('requirements'),run['requirements'],prior['input'],outputs))
                if retain and prior and all(library.get(key)==prior['input']['library'].get(key) for key in ('candidates','truncated')) and library.get('research_memory')!=prior['input']['library'].get('research_memory'):
                    fail('同输入同候选集合的继续研究须保留原记忆')
                if restart_stage and may_reuse(stage, restart_stage):
                    prior = next((old for _, old in by_run.get(previous_id, []) if old['stage'] == stage), None)
                    if prior and library != prior['input'].get('library'):
                        fail('指定后续阶段重跑不能改写前序比对范围')
            if stage == 'normalize' and uses_vocabulary(version):
                from quant.taxonomy.sync import resolve_rows as vocabulary_from_rows
                vocabulary_ref = row['input'].get('vocabulary_ref')
                vocabulary = vocabulary_from_rows(rows['quant.entry'][run['entry']]['anthology'], vocabulary_ref, rows)
                prior = next((old for _, old in by_run.get(previous_id, []) if old['stage'] == stage), None)
                if prior and runs[previous_id]['source'] == run['source'] and may_reuse(stage, restart_stage) and prior['input'].get('vocabulary_ref') != vocabulary_ref:
                    fail('同源续跑不能改写冻结的分类词表')
            if stage == 'snippets':
                snippet_plan = snippets.plan(payload, outputs['normalize']['structure'], run['requirements'], model, baseline,
                    version=4 if version in (27, 28) else 3 if version in (20, 22, 24, 26, 27, 28) else 2 if version == 18 else 1)
            from .stage_reuse import request as model_request, compatible, revalidate
            model_input, _, _ = model_request(stage, payload, run['requirements'], outputs, version, snippet_plan, vocabulary)
            expected_input = input_snapshot(stage, source_id, payload, run['requirements'], model, outputs, library, version, snippet_plan, vocabulary_ref, model_input)
            if row['input'] != expected_input or version >= 3 and row['content_hash'] != digest(expected_input):
                fail('阶段输入或依赖被改写')
            outcome_id, value = by_step.get(identity, ('', None))
            if value and stage not in MODEL_STAGES and (value['usage']['request_count'] or any(
                    value['usage'][key] is not None for key in ('input_tokens', 'output_tokens', 'total_tokens'))):
                fail('确定性步骤不能携带模型用量')
            if not value or value['status'] != 'completed':
                if expected_ordinal != len(ordered) or run['status'] == 'completed':
                    fail('阶段未完成却存在后续成果')
                break
            if value['reused_from']:
                if not may_reuse(stage, restart_stage):
                    fail('指定重跑阶段及后续步骤不得复用旧结果')
                old = outcomes.get(value['reused_from'], {})
                old_step = steps.get(old.get('step'), {})
                same = old_step.get('input') == row['input']
                by_model = compatible(old_step.get('input', {}), row['input'])
                if (old_step.get('run') != previous_id or old_step.get('stage') != stage or not (same or by_model)
                        or old.get('data', {}).get('status') != 'completed'
                        or value['usage']['request_count'] or any(value['usage'][key] is not None for key in ('input_tokens', 'output_tokens', 'total_tokens'))):
                    fail('复用阶段与原始结果不一致')
                expected_reuse = revalidate(stage, old['data']['output'], outputs, payload, version, snippet_plan, vocabulary) if by_model else old['data']['output']
                if expected_reuse != value['output']:
                    fail('复用阶段未按本次来源重新校验或与原始意见不一致')
            output = value['output']
            if stage == 'publish' and run['status'] != 'completed':
                fail('发布阶段必须与最终报告同时完成')
            if stage == 'normalize':
                actual_source = run.get('resolved_source') or run['source']
                expected = normalized(actual_source, sources[actual_source]['payload'], version, vocabulary_ref)
            elif stage == 'snippets':
                expected = snippets.validate_output(output, payload, snippet_plan, baseline)
                if (not any(not unit['reused_from'] for unit in snippet_plan['units']) and
                        (value['usage']['request_count'] or any(value['usage'][key] is not None for key in ('input_tokens', 'output_tokens', 'total_tokens')))):
                    fail('全部片段复用或无源码时不能携带模型用量')
            elif stage == 'compare':
                from quant.repairs.contracts import research_factors
                factors = research_factors(outputs)
                validate_comparison(output, factors, run, rows, fail)
                from .comparison import compare
                from types import SimpleNamespace
                candidates = [SimpleNamespace(pk=ref['id'], content_hash=ref['hash'],
                    data=rows['quant.factorcandidate'][ref['id']]['data']) for ref in library['candidates']]
                if output != compare(candidates, library, factors,run['workflow_version']):
                    fail('比对结果与冻结的候选集合不一致')
                expected = output
            else:
                expected = validate_output(stage, output, outputs, payload, version, snippet_plan)
                if uses_vocabulary(version):
                    from quant.taxonomy.prompts import validate_tags
                    validate_tags(stage, expected, vocabulary)
            if stage == 'repair':
                from quant.repairs.contracts import plan as repair_plan
                if not repair_plan(outputs['extract']['factors'])['selected'] and (value['usage']['request_count'] or any(value['usage'][key] is not None for key in ('input_tokens', 'output_tokens', 'total_tokens'))):
                    fail('没有修订目标的步骤不能携带模型用量')
            if output != expected:
                fail('阶段输出与校验合同不一致')
            outputs[stage] = output
        if run['status'] == 'completed':
            if len(outputs) != len(stages(version)) or validate_analysis(combined(outputs)) != run.get('result'):
                fail('最终报告缺少完整阶段或与阶段结果不一致')
    for model in (WorkflowStep, WorkflowOutcome):
        incoming = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=incoming).values('id', *model.SNAPSHOT_FIELDS):
            for key in model.SNAPSHOT_FIELDS:
                if local[key] != incoming[local['id']].get(model._meta.get_field(key).name):
                    fail('已有阶段快照不可覆盖')


def validate_library(value, run, rows, fail):
    from .memory import uses_history
    keys={'candidates','truncated'} | ({'research_memory'} if uses_history(run.get('workflow_version')) else set())
    if (not isinstance(value, dict) or set(value) != keys
            or type(value['truncated']) is not bool or not isinstance(value['candidates'], list)
            or len(value['candidates']) > 2000 or value['truncated'] and len(value['candidates']) != 2000):
        fail('比对库快照无效')
    collection = rows['quant.entry'][run['entry']]['anthology']
    seen = set()
    for ref in value['candidates']:
        if not isinstance(ref, dict) or set(ref) != {'id', 'hash'} or not isinstance(ref['id'], str):
            fail('比对库引用无效')
        candidate = rows.get('quant.factorcandidate', {}).get(ref['id'], {})
        report = rows.get('quant.researchreport', {}).get(candidate.get('report'), {})
        entry = rows['quant.entry'].get(report.get('entry'), {})
        if ref['id'] in seen or entry.get('anthology') != collection or candidate.get('content_hash') != ref['hash']:
            fail('比对库内容缺失或跨文集')
        seen.add(ref['id'])


def validate_comparison(value, factors, run, rows, fail):
    from .memory import uses_history,options
    keys={'method','scope_limit','scanned','truncated','semantic_status','matches'} | ({'research_memory'} if uses_history(run.get('workflow_version')) else set())
    if (not isinstance(value, dict) or set(value) != keys
            or value['method'] != ('bounded-structure-family-v2' if run.get('workflow_version') in (23, 24, 25, 26, 27, 28) else 'bounded-structure-family-v1') or value['scope_limit'] != 2000
            or type(value['scanned']) is not int or not 0 <= value['scanned'] <= 2000
            or type(value['truncated']) is not bool or value['semantic_status'] != 'not_requested'
            or not isinstance(value['matches'], list) or len(value['matches']) != len(factors)):
        fail('检索比对合同无效')
    collection = rows['quant.entry'][run['entry']]['anthology']
    if uses_history(run.get('workflow_version')):
        memory=value.get('research_memory')
        if not isinstance(memory,dict) or memory.get('version')!=3: fail('源码比对缺少固定验证研究记忆')
        from quant.research_memory import validate_from_rows as validate_memory
        validate_memory(memory,rows,collection_id=str(collection),latest_at=run['created_at'],options=options(factors))
    for index, group in enumerate(value['matches']):
        if (not isinstance(group, dict) or set(group) != {'factor_index', 'items', 'matched_in_scope'}
                or type(group['factor_index']) is not int or group['factor_index'] != index
                or not isinstance(group['items'], list) or len(group['items']) > 5
                or type(group['matched_in_scope']) is not int or not len(group['items']) <= group['matched_in_scope'] <= value['scanned']):
            fail('检索候选数量或序号无效')
        identities = set()
        for item in group['items']:
            if not isinstance(item, dict) or not isinstance(item.get('candidate_id'), str):
                fail('检索候选结构无效')
            candidate = rows.get('quant.factorcandidate', {}).get(item.get('candidate_id'), {})
            report = rows.get('quant.researchreport', {}).get(candidate.get('report'), {})
            entry = rows['quant.entry'].get(report.get('entry'), {})
            if entry.get('anthology') != collection or item['candidate_id'] in identities:
                fail('检索候选跨文集或重复')
            identities.add(item['candidate_id'])
            if item != match(factors[index], candidate['data'], item['candidate_id'], candidate['content_hash'], run.get('workflow_version', 0)):
                fail('检索依据与候选不一致')
