"""Complete research snapshots. Local execution permissions are never restored."""
import hashlib
import json
from datetime import date
from django.core import serializers
from rest_framework.exceptions import ValidationError as ResultValidationError
from utils.sync_datetime import SyncJSONEncoder
from system_settings.sync_state import canonical_hash

from .research.sync import LABELS as RESEARCH_LABELS, validate_research

from .intake.sync import LABELS as INTAKE_LABELS

SCHEMA_VERSION = 90
LABELS = {'quant.entry', 'quant.implementation', 'quant.codeversion', 'quant.backtest', 'quant.attachment', 'quant.airun'} | RESEARCH_LABELS | {'quant.marketdataset', 'quant.experimentrequest', 'quant.experimentresult', 'quant.experimentcheckpoint', 'quant.experimentproposal', 'quant.researchcampaign', 'quant.researchround', 'quant.researchevaluation', 'quant.researchoutcome'}
LABELS |= INTAKE_LABELS
LABELS.add('quant.strategyartifact')
LABELS.add('quant.selectiondiagnostic')
LABELS |= {'quant.nativepythonrequest','quant.nativepythonresult'}
from .validation_studies.sync import LABELS as VALIDATION_LABELS
LABELS |= VALIDATION_LABELS
from .workflows.sync import LABELS as WORKFLOW_LABELS
LABELS |= WORKFLOW_LABELS
from .comparisons.sync import LABELS as COMPARISON_LABELS
LABELS |= COMPARISON_LABELS
from .taxonomy.sync import LABELS as VOCABULARY_LABELS
LABELS |= VOCABULARY_LABELS
from .verification.sync import LABELS as VERIFICATION_LABELS
LABELS |= VERIFICATION_LABELS
LABELS.add('quant.factoradmission')
from .studies.sync import LABELS as STUDY_LABELS
LABELS |= STUDY_LABELS
LABELS |= {'quant.mt4expert', 'quant.mt4backtest', 'quant.mt4attachment'}


def complete_legacy_fields(data: list) -> None:
    """Missing version pointers in old complete backups mean no selection.

    Do this before the generic local-field fill: borrowing today's pointer
    into an older backup would leave it pointing at pruned history records.
    """
    for row in data:
        if row.get('model') == 'quant.airun':
            row['fields'].setdefault('validation_result', None)
            row['fields'].setdefault('feedback_workflow_version',0)
            row['fields'].setdefault('audit_report_id','')
            row['fields'].setdefault('native_resume_run_id','')
        if row.get('model') == 'quant.researchreport':
            row['fields'].setdefault('publication_mode', 'legacy')
            row['fields'].setdefault('factor_bindings', {})
        if row.get('model') == 'quant.codeversion':
            row['fields'].setdefault('strategy_artifact_id', '')
        if row.get('model') == 'quant.factorcandidate':
            row['fields'].setdefault('formula_version_id', '')
            row['fields'].setdefault('formula_selection_id', '')
            row['fields'].setdefault('qualification_version', 0)
            row['fields'].setdefault('admission_version', 0)
        if row.get('model') == 'quant.factorevidencelink':
            row['fields'].setdefault('admission_version', 0)


def manifest(data: list) -> dict:
    return {label: sorted(str(row['pk']) for row in data if row.get('model') == label)
            for label in sorted({row['model'] for row in data if row.get('model', '').startswith('quant.')})}


def metadata(data=None) -> dict:
    if data is None:
        from django.apps import apps
        from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
        data = []
        for model in apps.get_app_config('quant').get_models():
            if model._meta.label_lower not in LOCAL_ONLY_MODEL_LABELS:
                data += json.loads(serializers.serialize('json', model.objects.all(), cls=SyncJSONEncoder))
    return {'quant_schema_version': SCHEMA_VERSION, 'quant_manifest': manifest(data),
        'quant_record_hashes': {f"{row['model']}:{row['pk']}": canonical_hash(row['fields'])
                                for row in data if row.get('model', '').startswith('quant.')}}


def validate(data: list, meta=None) -> None:
    from utils.sync_manager import SyncError
    from .models import CodeVersion, Entry, Implementation
    from .services import parse_result
    meta = meta or {}

    def fail(message='量化快照归属、版本或附件引用不完整，拒绝恢复'):
        raise SyncError(message)

    schema_version = meta.get('quant_schema_version', 0)
    if type(schema_version) is not int or schema_version < 0:
        fail('量化快照版本格式无效，拒绝恢复')
    if schema_version > SCHEMA_VERSION:
        fail('量化快照版本高于本机，请升级所有设备')
    actual = metadata(data)
    for field in ('quant_manifest', 'quant_record_hashes'):
        if field in meta and meta[field] != actual[field]:
            fail('量化快照记录或校验不完整，拒绝恢复')
    rows = {}
    for row in data:
        label = row.get('model', '')
        if label.startswith('quant.'):
            if label not in LABELS or not isinstance(row.get('fields'), dict):
                fail('量化快照包含未知类型或本机执行授权，拒绝恢复')
            identity = str(row['pk'])
            if identity in rows.setdefault(label, {}):
                fail('量化快照包含重复记录，拒绝恢复')
            rows[label][identity] = row['fields']
    if 'quant_schema_version' in meta and schema_version < 90 and any(r.get('workflow_version') in (41, 42) for r in rows.get('quant.airun', {}).values()):
        fail('严格源码计算目录需要量化同步格式90，请升级其他设备')
    if 'quant_schema_version' in meta and schema_version < 89 and (rows.get('quant.researchdocument') or any(r.get('publication_mode', 'legacy') != 'legacy' for r in rows.get('quant.researchreport', {}).values())):
        fail('当前研究与分区采用状态需要同步格式89，请升级其他设备')
    if 'quant_schema_version' in meta and schema_version < 72 and any(row.get('kind') == 'sample_correlation' for row in rows.get('quant.factorrelation', {}).values()):
        fail('固定样本统计关系需要量化同步版本72或更高，拒绝降级解释')
    if 'quant_schema_version' in meta and schema_version < 73 and any(row.get('review_version') == 16 for row in rows.get('quant.airun', {}).values()):
        fail('组合增量解读需要量化同步版本73或更高，拒绝降级解释')
    if 'quant_schema_version' in meta and schema_version < 74 and any(row.get('review_version') == 17 for row in rows.get('quant.airun', {}).values()):
        fail('冻结统计解读需要量化同步版本74或更高，拒绝降级解释')
    if 'quant_schema_version' in meta and schema_version < 75 and any(rows.get(label) for label in STUDY_LABELS):
        fail('AI研究与动态连接器需要量化同步版本75或更高')
    if 'quant_schema_version' in meta and schema_version < 79 and any(row.get('plan', {}).get('version') == 2 for row in rows.get('quant.aistudy', {}).values()):
        fail('新版AI研究去重需要量化同步版本79或更高')
    if 'quant_schema_version' in meta and schema_version < 80 and any(row.get('plan', {}).get('version') == 3 for row in rows.get('quant.aistudy', {}).values()):
        fail('AI研究公式核对需要量化同步版本80或更高')
    if 'quant_schema_version' in meta and schema_version < 81 and any(row.get('plan', {}).get('version') == 4 for row in rows.get('quant.aistudy', {}).values()):
        fail('AI研究当代复核需要量化同步版本81或更高')
    if 'quant_schema_version' in meta and schema_version < 82 and any(row.get('plan', {}).get('version') == 5 for row in rows.get('quant.aistudy', {}).values()):
        fail('AI研究输出格式修复需要量化同步版本82或更高')
    if 'quant_schema_version' in meta and schema_version < 76 and any(rows.get(label) for label in ('quant.mt4expert', 'quant.mt4backtest', 'quant.mt4attachment')):
        fail('回测文集需要量化同步版本76或更高')
    if 'quant_schema_version' in meta and schema_version < 77 and rows.get('quant.mt4expert'):
        fail('结构化 EA 要求需要量化同步版本77或更高')
    def has_program(value, operators=('program', 'python')):
        if isinstance(value, dict): return value.get('op') in operators or any(has_program(item, operators) for item in value.values())
        if isinstance(value, list): return any(has_program(item, operators) for item in value)
        return False
    if 'quant_schema_version' in meta and schema_version < 83 and (any(row.get('workflow_version') in (29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42) for row in rows.get('quant.airun', {}).values()) or has_program(rows.get('quant.factorcandidate', {}))):
        fail('统一算法提取需量化同步格式83')
    if 'quant_schema_version' in meta and schema_version < 84 and any(row.get('workflow_version') in (31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42) for row in rows.get('quant.airun', {}).values()):
        fail('源码输出目录与自动纠正需量化同步格式84')
    if 'quant_schema_version' in meta and schema_version < 85 and (any(row.get('workflow_version') in (33, 34, 35, 36, 37, 38, 39, 40, 41, 42) for row in rows.get('quant.airun', {}).values()) or has_program(rows, ('python',))):
        fail('Python算法资产需量化同步格式85')
    if 'quant_schema_version' in meta and schema_version < 86 and any(row.get('workflow_version') in (35, 36, 37, 38, 39, 40, 41, 42) for row in rows.get('quant.airun', {}).values()):
        fail('中英文算法命名流程需量化同步格式86')
    if 'quant_schema_version' in meta and schema_version < 87 and any(row.get('workflow_version') in (37, 38, 39, 40, 41, 42) for row in rows.get('quant.airun', {}).values()):
        fail('分节阅读报告流程需量化同步格式87')
    if 'quant_schema_version' in meta and schema_version < 88 and any(row.get('workflow_version') in (39, 40, 41, 42) for row in rows.get('quant.airun', {}).values()):
        fail('完整导读报告流程需量化同步格式88')
    if 'quant_schema_version' in meta:
        for attachment in rows.get('quant.mt4attachment', {}).values():
            if schema_version >= 78 and 'note' not in attachment:
                fail('回测附件备注字段不完整，拒绝恢复')
            if schema_version < 78 and 'note' in attachment:
                fail('回测附件备注需要量化同步版本78或更高')
    anthologies = {str(row['pk']): row['fields'] for row in data if row.get('model') == 'anthology.anthology'}
    from .experiments.sync import validate_datasets
    from .experiments.snapshot import validate_experiments
    assets = {str(row['pk']): row['fields'] for row in data if row.get('model') == 'assets.asset'}
    entries, implementations, versions, backtests, runs = (rows.get('quant.' + name, {})
        for name in ('entry', 'implementation', 'codeversion', 'backtest', 'airun'))
    for anthology in anthologies.values():
        if anthology.get('type') == 'quant' and anthology.get('permission') != 'private':
            fail('量化文集必须保持私密，拒绝恢复')
        if anthology.get('type') == 'backtest' and anthology.get('permission') != 'private':
            fail('回测文集必须保持私密，拒绝恢复')

    from .mt4_reports.sync import validate_mt4
    validate_mt4(rows, anthologies, assets, fail)

    def version_entry(version_id):
        version = versions.get(str(version_id), {})
        implementation = implementations.get(str(version.get('implementation')), {})
        return str(implementation.get('entry', ''))

    for identity, fields in entries.items():
        anthology = anthologies.get(str(fields.get('anthology')), {})
        if anthology.get('type') != 'quant' or anthology.get('permission') != 'private' or not anthology.get('user_id'):
            fail()
        if fields.get('kind') not in Entry.KINDS or not isinstance(fields.get('title'), str) or not fields['title'].strip():
            fail()
        if not isinstance(fields.get('content', ''), str) or not isinstance(fields.get('tags', []), list) or any(not isinstance(tag, str) for tag in fields.get('tags', [])):
            fail()
        source_url = fields.get('source_url', '')
        if not isinstance(source_url, str) or (source_url and not source_url.lower().startswith(('https://', 'http://'))):
            fail('量化研究来源链接格式无效，拒绝恢复')
    for identity, fields in implementations.items():
        if str(fields.get('entry')) not in entries or fields.get('language') not in Implementation.LANGUAGES:
            fail()
        pointer = fields.get('current_version_id')
        version = versions.get(str(pointer), {})
        if str(version.get('implementation')) != identity:
            fail()
        if any(fields.get(field, '') != version.get(field, '') for field in ('language', 'language_version', 'dependencies', 'parameters')):
            fail('量化实现与当前代码版本快照不一致，拒绝恢复')
    local_versions = {str(item['id']): item for item in CodeVersion.objects.filter(pk__in=versions)
                      .values('id', *CodeVersion.SNAPSHOT_FIELDS)} if versions else {}
    for identity, fields in versions.items():
        implementation = implementations.get(str(fields.get('implementation')))
        code = fields.get('code')
        if not implementation or not isinstance(code, str) or hashlib.sha256(code.encode()).hexdigest() != fields.get('content_hash'):
            fail('量化代码缺失或哈希不一致，拒绝恢复')
        if fields.get('language') not in Implementation.LANGUAGES or any(fields.get(field) not in CodeVersion.CHECKS for field in ('compile_check', 'run_check', 'result_check')):
            fail()
        source = fields.get('source_version_id')
        if source and (str(source) == identity or version_entry(source) != str(implementation['entry'])):
            fail()
        local = local_versions.get(identity)
        if local:
            for field in CodeVersion.SNAPSHOT_FIELDS:
                incoming = fields.get('implementation' if field == 'implementation_id' else field, '' if field == 'strategy_artifact_id' else None)
                if local[field] != incoming:
                    fail('同一量化代码版本的不可变内容发生冲突，拒绝覆盖')
    for fields in backtests.values():
        eid = str(fields.get('entry'))
        if eid not in entries or (fields.get('version') and version_entry(fields['version']) != eid):
            fail()
        metrics = fields.get('metrics', [])
        if not isinstance(metrics, list) or any(not isinstance(metric, dict) or not all(isinstance(metric.get(key), str) for key in ('name', 'value')) for metric in metrics):
            fail('量化回测指标格式无效，拒绝恢复')
        for field in ('start_date', 'end_date'):
            value = fields.get(field, '')
            if value:
                try:
                    if date.fromisoformat(value).isoformat() != value:
                        fail()
                except (ValueError, TypeError):
                    fail()
        if fields.get('start_date') and fields.get('end_date') and fields['start_date'] > fields['end_date']:
            fail()
    for fields in rows.get('quant.attachment', {}).values():
        eid = str(fields.get('entry'))
        entry = entries.get(eid, {})
        anthology = anthologies.get(str(entry.get('anthology')), {})
        asset = assets.get(str(fields.get('asset')), {})
        if not entry or not asset or not asset.get('is_valid', True) or asset.get('uploader') != anthology.get('user_id'):
            fail('量化附件缺失或不属于文集所有者，拒绝恢复')
        implementation_id, version_id, backtest_id = (fields.get(key) for key in ('implementation', 'version', 'backtest'))
        if implementation_id and str(implementations.get(str(implementation_id), {}).get('entry')) != eid:
            fail()
        if version_id and (version_entry(version_id) != eid or (implementation_id and str(versions[str(version_id)]['implementation']) != str(implementation_id))):
            fail()
        if backtest_id and str(backtests.get(str(backtest_id), {}).get('entry')) != eid:
            fail()
        if backtest_id and version_id and backtests[str(backtest_id)].get('version') and str(backtests[str(backtest_id)]['version']) != str(version_id):
            fail()
    statuses = {'pending', 'running', 'completed', 'failed', 'cancelled', 'interrupted'}
    request_keys = set()
    for fields in runs.values():
        eid = str(fields.get('entry'))
        if eid not in entries or fields.get('kind') not in ('explain', 'convert', 'analyze', 'experiment_review', 'feedback_review') or fields.get('status') not in statuses:
            fail()
        if fields['kind'] in ('analyze', 'experiment_review', 'feedback_review'):
            source = rows.get('quant.sourcerevision', {}).get(str(fields.get('source')), {})
            material = rows.get('quant.sourcematerial', {}).get(str(source.get('material')), {})
            if str(material.get('entry')) != eid or fields.get('source_version'):
                fail('研究分析任务来源不属于当前研究')
            resolved = fields.get('resolved_source')
            if resolved:
                resolved_source = rows.get('quant.sourcerevision', {}).get(str(resolved), {})
                if (resolved_source.get('material') != source.get('material')
                        or resolved_source.get('payload', {}).get('origin_source_id') != str(fields['source'])):
                    fail('网页快照与原始分析来源不一致')
        elif version_entry(fields.get('source_version')) != eid or fields.get('source') or fields.get('resolved_source'):
            fail('代码任务来源无效')
        if fields.get('kind')=='analyze' and fields.get('result',{}).get('source_memory_version') and fields.get('workflow_version') not in (12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40, 41, 42):
            fail('历史源码分析不能追加未冻结的研究记忆')
        if fields.get('kind') == 'analyze':
            from .research.findings import validate_admission
            validate_admission(fields.get('result', {}), fields.get('workflow_version', 0))
        if type(fields.get('review_version', 1)) is not int or fields.get('review_version', 1) not in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17) or (fields['kind'] != 'experiment_review' and fields.get('review_version', 1) != 1):
            fail('实验解读输入版本无效')
        if not isinstance(fields.get('planning_context', {}), dict) or (fields['kind'] != 'feedback_review' and (fields.get('review_version', 1) in (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17)) != bool(fields.get('planning_context'))):
            fail('跨库研究上下文与解读版本不一致')
        if fields.get('review_version') == 9 and not fields.get('validation_result') or fields.get('validation_result') and fields.get('review_version') not in (9,10,11,12,13,14,15,16,17):
            fail('固定验证解读版本与结果引用不匹配')
        if fields['kind'] != 'experiment_review' and fields.get('experiment_result'):
            fail('非实验解读任务包含实验引用')
        request_key = (eid, fields.get('request_key'))
        if not request_key[1] or request_key in request_keys:
            fail('量化任务请求标识冲突，拒绝恢复')
        request_keys.add(request_key)
        if fields.get('kind') == 'convert' and fields.get('target_language') not in Implementation.LANGUAGES:
            fail()
        if fields.get('status') == 'completed':
            try:
                parse_result(fields['kind'], json.dumps(fields.get('result', {}), ensure_ascii=False),model_output=False)
            except Exception as exc:
                # Snapshot validation only; no provider calls or business writes.
                raise SyncError('量化 AI 成果格式不完整，拒绝恢复') from exc
        elif fields.get('result'):
            fail('量化快照包含未完成的候选结果，拒绝恢复')
        adopted = fields.get('adopted_implementation_id')
        if adopted and (fields.get('status') != 'completed' or fields.get('kind') != 'convert' or str(implementations.get(str(adopted), {}).get('entry')) != eid):
            fail()

    try:
        from .taxonomy.sync import validate_vocabularies
        validate_vocabularies(rows, anthologies, fail)
        from .workflows.sync import validate_workflows
        validate_workflows(rows, fail)
        validate_datasets(rows, anthologies, fail)
        validate_experiments(rows, fail)
        from .search_diagnostics.sync import validate_diagnostics
        validate_diagnostics(rows,fail,anthologies)
        from .validation_studies.sync import validate_studies
        validate_studies(rows, anthologies, fail)
        from .experiments.review_sync import review_evidence_from_rows, validate_local_review_links
        validate_local_review_links(rows, fail)
        for identity, run in runs.items():
            if run['kind'] == 'experiment_review':
                review_evidence_from_rows(run, rows, fail)
                if run['status'] == 'completed' and sum(report.get('run') == identity for report in rows.get('quant.researchreport', {}).values()) != 1:
                    fail('已完成的实验解读缺少对应研究报告')
        from .native_python.sync import validate_native
        validate_native(rows,anthologies,fail)
        from .feedback.sync import validate_feedback
        validate_feedback(rows, fail)
        validate_research(rows, fail)
        from .studies.sync import validate as validate_studies
        validate_studies(rows, anthologies, fail)
        from .strategy_exports.sync import validate_artifacts
        validate_artifacts(rows, fail)
        from .comparisons.sync import validate_comparisons
        validate_comparisons(rows, anthologies, fail)
        from .verification.sync import validate_verification
        validate_verification(rows, fail)
        from quant.admissions.sync import validate_admissions
        validate_admissions(rows,fail)
        from .experiments.proposal_sync import validate_proposals
        validate_proposals(rows, fail)
        from .experiments.campaigns.sync import validate_campaigns
        validate_campaigns(rows, anthologies, fail)
        from .intake.sync import validate_batches
        validate_batches(rows, anthologies, fail)
    except (ValueError, TypeError, KeyError, IndexError, OverflowError, ResultValidationError) as exc:
        raise SyncError('研究快照数据格式无效') from exc


def reset_execution(*, upgrade_legacy=False) -> None:
    from .models import AIStudyJob
    AIStudyJob.objects.all().delete()
    from .models import NativePythonJob
    NativePythonJob.objects.all().delete()
    from .models import ValidationJob
    ValidationJob.objects.all().delete()
    from .models import IntakeBatchJob
    IntakeBatchJob.objects.all().delete()
    from .models import AIRun, Job, FactorVector, FactorIndexJob, ExperimentJob, ResearchCampaignJob
    Job.objects.all().delete()
    ResearchCampaignJob.objects.all().delete()
    ExperimentJob.objects.all().delete()
    FactorIndexJob.objects.all().delete()
    FactorVector.objects.all().delete()
    for run in AIRun.objects.filter(status__in=['pending', 'running']):
        run.status = 'interrupted'
        run.error = '数据已恢复，请手动重试；不会自动调用模型'
        run.save(update_fields=['status', 'error', 'updated_at'])

    if upgrade_legacy:
        from django.apps import apps
        from .research.legacy_v1 import upgrade
        upgrade(apps)
