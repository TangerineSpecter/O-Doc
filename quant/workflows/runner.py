"""Versioned bounded calls with append-only inputs/outcomes and explicit reuse."""
import time
from django.db import transaction
from rest_framework.exceptions import ValidationError
from utils.ai_service import AIService
from utils.bounded_completion import AIOutputTruncated, AIRequestTimeout
from utils.token_usage import usage_scope
from quant.locking import collection_lock
from quant.models import AIRun, WorkflowStep, WorkflowOutcome, SourceRevision, Job
from quant.research.contracts import digest
from quant.research.analysis import validate_analysis
from .contracts import stages, budget, NAMES, MODEL_STAGES, input_snapshot, normalized, combined, decode, validate_output, may_reuse, uses_snippets, uses_vocabulary, snippet_plan_version
from .prompts import prompt


def validation_reason(exc: ValidationError) -> str:
    from quant.algorithms.correction import ExtractionIncomplete
    if isinstance(exc, ExtractionIncomplete):
        return '源码算法转换未完成，自动纠正后仍未生成可入库算法；前序分析已保留'
    from .model_response import validation_detail
    return validation_detail(exc)


def completion_limits(stage: str, version: int, config: dict) -> tuple[int, int]:
    # DeepSeek Flash supports larger outputs; keep the frozen v28 model-input
    # contract and all other providers' request limits unchanged.
    if (stage == 'extract' and version in (21, 22, 23, 24, 25, 26, 27, 29, 31, 33, 35, 37, 39, 41)
            and config.get('provider_type') == 'DeepSeek' and config.get('model_name') == 'deepseek-flash'):
        return 65536, 480
    return 32000, 300 if stage in ('extract', 'plan') else 180 if stage == 'review' else 120


def model_identity(config: dict) -> dict:
    value = {key: str(config.get(key) or '') for key in ('model_id', 'model_name', 'provider_type')}
    value['configuration_hash'] = digest({key: str(config.get(key) or '') for key in
        ('model_id', 'model_name', 'provider_type', 'base_url', 'model_type', 'thinking_mode', 'thinking_protocol', 'reasoning_effort')})
    return value


def usage(run_id: str, stage: str) -> dict:
    from system_settings.token_usage.models import AgentTokenUsage
    rows = list(AgentTokenUsage.objects.filter(record_key=run_id, purpose='quant', phase=f'research.{stage}'))
    return {'request_count': len(rows), 'event_ids': [row.pk for row in rows],
        **{key: sum(getattr(row, key) for row in rows) if rows and all(getattr(row, key) is not None for row in rows) else None
           for key in ('input_tokens', 'output_tokens', 'total_tokens')}}


def save_outcome(step, status, output, error, reused_from, elapsed, run, check_cancel):
    data = {'version': 1, 'status': status, 'output': output, 'error': error, 'reused_from': reused_from,
        'elapsed_ms': max(0, round(elapsed * 1000)),
        'usage': usage(run.pk, step.stage) if step.stage in MODEL_STAGES and not reused_from else {
            'request_count': 0, 'event_ids': [], 'input_tokens': None, 'output_tokens': None, 'total_tokens': None}}
    with collection_lock(run.entry.anthology_id), transaction.atomic():
        check_cancel()
        return WorkflowOutcome.objects.create(id=digest(['workflow-outcome-1', step.pk])[:40], step=step,
            data=data, content_hash=digest(data))


def execute(run, config: dict, complete, check_cancel, progress) -> dict:
    old = AIRun.objects.filter(pk=run.resume_run_id).first() if run.resume_run_id else None
    previous = {row.stage: row for row in old.workflow_steps.select_related('outcome')} if old else {}
    outputs, calls, started = {}, 0, time.monotonic()
    max_calls, max_seconds = budget(run.workflow_version)
    snippet_plan, baseline = None, {}
    vocabulary_ref, vocabulary = None, None
    if uses_snippets(run.workflow_version):
        from . import snippets
        from .baseline import from_run, cache_for
        baseline = cache_for(from_run(run), run.restart_stage)
    for ordinal, stage in enumerate(stages(run.workflow_version), 1):
        check_cancel()
        if time.monotonic() - started >= max_seconds:
            raise ValidationError('阶段研究达到总耗时上限，已完成步骤保留')
        source = run.source if stage == 'normalize' else run.resolved_source or run.source
        if stage == 'snippets':
            snippet_plan = snippets.plan(source.payload, outputs['normalize']['structure'], run.requirements,
                model_identity(config), baseline, version=snippet_plan_version(run.workflow_version))
        with collection_lock(run.entry.anthology_id), transaction.atomic():
            check_cancel()
            if stage == 'normalize' and uses_vocabulary(run.workflow_version):
                from quant.taxonomy.services import current, resolve
                prior = previous.get(stage)
                vocabulary_ref = prior.input['vocabulary_ref'] if prior and old.source_id == run.source_id and may_reuse(stage, run.restart_stage) else current(run.entry.anthology_id)[1]
                vocabulary = resolve(run.entry.anthology_id, vocabulary_ref)
            candidates, library = [], None
            if stage == 'compare':
                from .comparison import library_snapshot
                prior = previous.get(stage)
                # A targeted rerun retains the upstream comparison's research
                # scope. Starting at compare (or earlier) queries the live library.
                from .memory import retain_on_resume
                retain=bool(prior and old and not run.restart_stage and retain_on_resume(run.workflow_version,old.source_id,run.source_id,old.requirements,run.requirements,prior.input,outputs))
                frozen = prior.input.get('library') if prior and run.restart_stage and may_reuse(stage,run.restart_stage) else None
                from quant.repairs.contracts import research_factors
                candidates, library = library_snapshot(run, frozen, research_factors(outputs),prior.input.get('library') if retain else None)
            from .stage_reuse import request as model_request
            model_input, prepared_text, context_error = model_request(stage, source.payload, run.requirements, outputs,
                run.workflow_version, snippet_plan, vocabulary)
            inputs = input_snapshot(stage, source.pk, source.payload, run.requirements, model_identity(config), outputs, library,
                run.workflow_version, snippet_plan, vocabulary_ref, model_input)
            step = WorkflowStep.objects.create(id=digest(['workflow-step-1', run.pk, ordinal])[:40],
                run=run, ordinal=ordinal, stage=stage, input=inputs, content_hash=digest(inputs))
            Job.objects.filter(run=run).update(stage=NAMES[stage], preview=NAMES[stage])
        progress('stage', NAMES[stage], 'info', {})
        stage_start = time.monotonic()
        try:
            reusable = previous.get(stage)
            outcome = getattr(reusable, 'outcome', None) if reusable else None
            from .optional_analysis import incomplete_reason
            if outcome and incomplete_reason(stage, outcome.data.get('output', {})):
                outcome = None  # A saved fallback is not reusable successful analysis.
            reused_from = ''
            if context_error:
                raise context_error
            from .stage_reuse import compatible, revalidate
            model_reuse = bool(reusable and outcome and outcome.data['status'] == 'completed'
                and may_reuse(stage, run.restart_stage) and compatible(reusable.input, inputs))
            reused_output = None
            if model_reuse:
                try:
                    reused_output = revalidate(stage, outcome.data['output'], outputs, source.payload, run.workflow_version, snippet_plan, vocabulary)
                except ValidationError:
                    # An unchanged model view never overrides a failed current
                    # evidence/definition check. Use the normal model path.
                    model_reuse = False
            if 'model_input' not in inputs and may_reuse(stage, run.restart_stage) and outcome and outcome.data['status'] == 'completed' and reusable.input == inputs:
                output, reused_from = outcome.data['output'], outcome.pk
                if stage == 'normalize' and output['source_id'] != run.source_id:
                    with collection_lock(run.entry.anthology_id), transaction.atomic():
                        check_cancel()
                        run.resolved_source = SourceRevision.objects.get(pk=output['source_id'])
                        run.save(update_fields=['resolved_source', 'updated_at'])
            elif model_reuse:
                output, reused_from = reused_output, outcome.pk
            elif stage == 'normalize':
                from quant.research.acquisition import acquire_source
                acquired = acquire_source(run, check_cancel)
                output = normalized(acquired.pk, acquired.payload, run.workflow_version, vocabulary_ref)
            elif stage == 'compare':
                from .comparison import compare
                with collection_lock(run.entry.anthology_id), transaction.atomic():
                    check_cancel()
                    from quant.repairs.contracts import research_factors
                    output = compare(candidates, library, research_factors(outputs),run.workflow_version)
            elif stage == 'publish':
                output = validate_output(stage, {}, outputs, source.payload, run.workflow_version)
            else:
                pending = stage != 'snippets' or any(not unit['reused_from'] for unit in snippet_plan['units'])
                if stage == 'repair':
                    from quant.repairs.contracts import plan as repair_plan
                    pending = bool(repair_plan(outputs['extract']['factors'])['selected'])
                if pending and calls >= max_calls:
                    raise ValidationError('超过模型调用预算')
                if pending:
                    text = prepared_text or (snippets.prompt(source.payload, snippet_plan, run.requirements) if stage == 'snippets' else prompt(
                        stage, source.payload, run.requirements, outputs, run.workflow_version, snippet_plan, vocabulary))
                    calls += 1
                    with usage_scope(owner_id=run.entry.anthology.user_id, record=run, purpose='quant', phase=f'research.{stage}'):
                        max_tokens, call_limit = completion_limits(stage, run.workflow_version, config)
                        try:
                            raw = complete(config, text, json_output=True, max_tokens=max_tokens,
                                extra_body=AIService._thinking_options(config),
                                deadline_seconds=min(call_limit, max(1, max_seconds - (time.monotonic() - started))),
                                max_deadline_seconds=call_limit, allow_retries=False)
                        except AIOutputTruncated:
                            if stage == 'repair':
                                raw = None
                            elif stage == 'snippets':
                                raise
                            else:
                                if calls >= max_calls or time.monotonic() - started >= max_seconds:
                                    raise
                                from .model_response import correction_prompt
                                correction = correction_prompt(text, stage, '', ValidationError(
                                    '模型输出被长度上限截断：请压缩重复说明和重复算法，重新返回完整结果'))
                                progress('stage', NAMES[stage] + '：正在精简重复内容并重新生成完整结果', 'info', {})
                                check_cancel()
                                calls += 1
                                raw = complete(config, correction, json_output=True, max_tokens=max_tokens,
                                    extra_body=AIService._thinking_options(config),
                                    deadline_seconds=min(call_limit, max(1, max_seconds - (time.monotonic() - started))),
                                    max_deadline_seconds=call_limit, allow_retries=False)
                        except AIRequestTimeout:
                            if stage != 'repair':
                                raise
                            raw = None  # Optional repair failed; preserve the extracted originals.
                check_cancel()
                if stage == 'snippets':
                    output = snippets.assemble(decode(raw) if pending else {'units': []}, source.payload, snippet_plan, baseline)
                else:
                    if stage == 'repair' and pending:
                        from quant.repairs.model_response import normalize as normalize_repair
                        try:
                            value = decode(raw) if raw is not None else None
                        except ValidationError:
                            value = None
                        def validate_repair_candidate(candidate):
                            checked = validate_output(stage, candidate, outputs, source.payload, run.workflow_version, snippet_plan)
                            if uses_vocabulary(run.workflow_version):
                                from quant.taxonomy.prompts import validate_tags
                                validate_tags(stage, checked, vocabulary)
                        value = normalize_repair(value, outputs['extract']['factors'], validate_repair_candidate, unavailable=raw is None)
                    else:
                        value = None
                    from .model_response import source_parameters, source_quotes, correction_prompt
                    for attempt in range(2):
                        try:
                            if value is None:
                                value = decode(raw) if pending else {'items': []}
                            if stage == 'parameters':
                                value = source_parameters(value, outputs)
                            if stage == 'extract':
                                value = source_quotes(value, source.payload)
                                from quant.algorithms.python_output import validate_generated_outputs
                                validate_generated_outputs(value)
                            output = validate_output(stage, value, outputs, source.payload, run.workflow_version, snippet_plan)
                            if stage == 'extract' and run.workflow_version >= 31:
                                from quant.algorithms.correction import require_algorithms
                                require_algorithms(value, output, source.payload)
                            if uses_vocabulary(run.workflow_version):
                                from quant.taxonomy.prompts import validate_tags
                                validate_tags(stage, output, vocabulary)
                            break
                        except ValidationError as exc:
                            if attempt or not pending or calls >= max_calls or time.monotonic() - started >= max_seconds:
                                raise
                            correction = correction_prompt(text, stage, raw, exc)
                            progress('stage', NAMES[stage] + '：正在自动修正输出格式', 'info', {})
                            check_cancel()
                            calls += 1
                            with usage_scope(owner_id=run.entry.anthology.user_id, record=run, purpose='quant', phase=f'research.{stage}'):
                                raw = complete(config, correction, json_output=True, max_tokens=max_tokens,
                                    extra_body=AIService._thinking_options(config),
                                    deadline_seconds=min(call_limit, max(1, max_seconds - (time.monotonic() - started))),
                                    max_deadline_seconds=call_limit, allow_retries=False)
                            check_cancel()
                            value = None
            if stage != 'publish':
                save_outcome(step, 'completed', output, '', reused_from, time.monotonic()-stage_start, run, check_cancel)
            outputs[stage] = output
        except Exception as exc:
            # If authority was revoked, leave the durable input without outcome;
            # never let a stale worker publish failure facts after restore.
            check_cancel()
            reason = ('模型输出超过长度限制，已保留前面完成的阶段' if isinstance(exc, AIOutputTruncated)
                else '模型调用超时，已保留前面完成的阶段' if isinstance(exc, AIRequestTimeout)
                else validation_reason(exc) if isinstance(exc, ValidationError) else '模型调用或阶段处理失败')
            from system_logs.capture import capture, exception_metadata
            capture('量化研究阶段失败', module='quant', task_id=run.pk, operation=stage,
                error_type=type(exc).__name__, reason=reason, stack=exception_metadata(exc)['stack'],
                path=f'/quant/{run.entry.anthology_id}/entries/{run.entry_id}',
                duration_ms=round((time.monotonic()-stage_start)*1000))
            if isinstance(exc, (ValidationError, AIOutputTruncated, AIRequestTimeout)):
                from .optional_analysis import fallback
                auxiliary = fallback(stage, outputs, source.payload, run.workflow_version, snippet_plan,
                    '辅助阶段输入超出容量。' if isinstance(exc, ValidationError) and '输入超过上限' in str(exc) else reason)
                if auxiliary is not None:
                    save_outcome(step, 'completed', auxiliary, '', '', time.monotonic()-stage_start, run, check_cancel)
                    outputs[stage] = auxiliary
                    continue
            error = NAMES[stage] + '未完成：' + reason
            save_outcome(step, 'failed', {}, error, '', time.monotonic()-stage_start, run, check_cancel)
            raise
    return validate_analysis(combined(outputs))


def finish(run):
    """Only inside the caller's authorized atomic report publication."""
    step = run.workflow_steps.get(stage='publish')
    data = {'version': 1, 'status': 'completed', 'output': {'report_result_hash': digest(run.result)},
        'error': '', 'reused_from': '', 'elapsed_ms': 0,
        'usage': {'request_count': 0, 'event_ids': [], 'input_tokens': None, 'output_tokens': None, 'total_tokens': None}}
    WorkflowOutcome.objects.create(id=digest(['workflow-outcome-1', step.pk])[:40], step=step,
        data=data, content_hash=digest(data))
