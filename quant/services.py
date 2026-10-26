"""Transactional research changes. Callers hold the collection/snapshot lock."""
import hashlib
import json
import re
from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError
from assets.models import Asset
from system_settings.models import AIModel
from utils.ai_service import AIService
from system_settings.sync_state import canonical_hash
from .models import AIRun, Attachment, CodeVersion, Entry, Implementation, Job
from .serializers import AttachmentInputSerializer, CODE_LIMIT, ImplementationInputSerializer, VersionInputSerializer


class Conflict(APIException):
    status_code = 409
    default_detail = '资料已变化，请刷新后重试'


class ModelUnavailable(APIException):
    status_code = 503
    default_detail = '尚未配置可用的对话模型，请先检查模型设置'


class QueueCapacity(Conflict):
    default_detail = '当前已有多个量化任务，请等待完成或取消后再提交'


def touch(entry: Entry) -> None:
    entry.save(update_fields=['updated_at'])
    anthology = entry.anthology
    anthology.count = Entry.objects.filter(anthology=anthology, is_valid=True).count()
    anthology.rag_not_synced_count = 0
    anthology.save(update_fields=['count', 'rag_not_synced_count', 'updated_at'])


def save_version(implementation: Implementation, data: dict) -> CodeVersion:
    serializer = VersionInputSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    source_id = values.pop('source_version_id', None)
    if source_id and not CodeVersion.objects.filter(pk=source_id, implementation__entry=implementation.entry).exists():
        raise ValidationError('来源代码版本不属于当前研究')
    snapshot = {field: values.get(field, getattr(implementation, field))
                for field in ('language', 'language_version', 'dependencies', 'parameters')}
    version = CodeVersion.objects.create(implementation=implementation, source_version_id=source_id,
        content_hash=hashlib.sha256(values['code'].encode()).hexdigest(), code=values['code'],
        note=values.get('note', ''), **snapshot)
    for field, value in snapshot.items():
        setattr(implementation, field, value)
    implementation.current_version_id = version.pk
    implementation.save()
    from .research.services import capture_version
    capture_version(version)
    touch(implementation.entry)
    return version


def create_implementation(entry: Entry, data: dict) -> Implementation:
    serializer = ImplementationInputSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    values = dict(serializer.validated_data)
    implementation = Implementation.objects.create(entry=entry, name=values.pop('name'),
        **{field: values[field] for field in ('language', 'language_version', 'dependencies', 'parameters') if field in values})
    save_version(implementation, values)
    return implementation


def attach(entry: Entry, data: dict) -> Attachment:
    serializer = AttachmentInputSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    asset_id = data['asset_id']
    asset = get_object_or_404(Asset.objects.select_for_update(), pk=asset_id,
        uploader=entry.anthology.user_id, is_valid=True)
    refs = {}
    for field, model in (('implementation', Implementation), ('version', CodeVersion)):
        identity = data.get(field + '_id')
        if identity:
            filters = {'entry': entry} if field == 'implementation' else {'implementation__entry': entry}
            refs[field] = get_object_or_404(model, pk=identity, **filters)
    from .models import Backtest
    if data.get('backtest_id'):
        refs['backtest'] = get_object_or_404(Backtest, pk=data['backtest_id'], entry=entry, is_valid=True)
    version, implementation, backtest = (refs.get(field) for field in ('version', 'implementation', 'backtest'))
    if version and implementation and version.implementation_id != implementation.pk:
        raise ValidationError('附件的实现与版本不一致')
    if version and backtest and backtest.version_id and backtest.version_id != version.pk:
        raise ValidationError('附件的回测与版本不一致')
    if version and not implementation:
        refs['implementation'] = version.implementation
    # Optional FK NULLs do not deduplicate consistently across SQL backends.
    # The collection lock serializes this lookup/create with API attachment writes.
    filters = {field: refs.get(field) for field in ('implementation', 'version', 'backtest')}
    reference = Attachment.objects.filter(entry=entry, asset=asset, **filters).first()
    if not reference:
        reference = Attachment.objects.create(entry=entry, asset=asset, **filters)
        touch(entry)
    return reference


def read_script(reference: Attachment) -> dict:
    languages = {'.py': 'python', '.pine': 'pine', '.mq4': 'mql4', '.mqh': 'mql4'}
    asset = reference.asset
    extension = asset.file_extension.lower()
    if extension not in languages or asset.file_size > CODE_LIMIT:
        raise ValidationError('仅支持读取不超过 1 MiB 的 .py、.pine、.mq4 或 .mqh UTF-8 文本脚本')
    root = Path(settings.MEDIA_ROOT).resolve()
    try:
        path = (root / asset.file_path).resolve()
    except (OSError, RuntimeError) as exc:
        raise ValidationError('脚本文件当前不可用，请先恢复附件') from exc
    if path == root or not path.is_relative_to(root) or not path.is_file():
        raise ValidationError('脚本文件当前不可用，请先恢复附件')
    try:
        with path.open('rb') as stream:
            raw = stream.read(CODE_LIMIT + 1)
        if len(raw) > CODE_LIMIT or b'\x00' in raw:
            raise ValueError
        code = raw.decode('utf-8-sig')
    except (OSError, UnicodeError, ValueError) as exc:
        raise ValidationError('脚本不是可读取的 UTF-8 文本，仍可作为附件下载') from exc
    return {'code': code, 'language': languages[extension], 'name': asset.original_name}


def model_config(model_id: str = '') -> dict:
    if model_id and not AIModel.objects.filter(pk=model_id, type='chat').exists():
        raise ValidationError('请选择已配置的对话模型')
    try:
        config = AIService.get_client_config_for_model(model_id) if model_id else AIService.get_default_client_config()
        if config.get('model_type') != 'chat':
            raise ModelUnavailable('请选择对话模型')
        return config
    except ModelUnavailable:
        raise
    except Exception as exc:
        # Provider settings may contain secrets; never forward exception text.
        raise ModelUnavailable() from exc


def _run_input(entry: Entry, data: dict, existing=None) -> dict:
    from rest_framework import serializers
    from .workflows.contracts import stages, VERSION, INCREMENTAL_VERSION
    class Input(serializers.Serializer):
        kind = serializers.ChoiceField(choices=['explain', 'convert', 'analyze', 'experiment_review', 'feedback_review'])
        source_version_id = serializers.CharField(max_length=40, required=False, allow_null=True, default=None)
        source_id = serializers.CharField(max_length=40, required=False, allow_null=True, default=None)
        validation_result_id = serializers.CharField(max_length=40, required=False, allow_null=True, default=None)
        experiment_result_id = serializers.CharField(max_length=40, required=False, allow_null=True, default=None)
        target_language = serializers.ChoiceField(choices=Implementation.LANGUAGES, required=False, allow_blank=True, default='')
        target_version = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
        requirements = serializers.CharField(max_length=8000, required=False, allow_blank=True, default='')
        model_id = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
        resume_run_id = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
        restart_stage = serializers.ChoiceField(choices=stages(INCREMENTAL_VERSION), required=False, allow_blank=True, default='')
        audit_report_id=serializers.CharField(max_length=40,required=False,allow_blank=True,default='')
        native_resume_run_id=serializers.CharField(max_length=40,required=False,allow_blank=True,default='')
    serializer = Input(data=data)
    serializer.is_valid(raise_exception=True)
    values = dict(serializer.validated_data)
    if values['kind']!='feedback_review' and values['audit_report_id']:
        raise ValidationError('仅原始Python验证反馈支持复核已有报告')
    if not values['audit_report_id']:values.pop('audit_report_id')
    if values['native_resume_run_id']:
        if values['kind']!='feedback_review' or values.get('audit_report_id') or values.get('resume_run_id') or values.get('restart_stage'):
            raise ValidationError('Python事实审查续作不能同时改换报告或其他阶段来源')
    else:values.pop('native_resume_run_id')
    resume_id = values.pop('resume_run_id')
    restart_stage = values.pop('restart_stage')
    if restart_stage and not resume_id:
        raise ValidationError('指定重跑阶段时须选择原研究任务')
    if resume_id and existing and not existing.workflow_version:
        raise Conflict('历史请求不能追加阶段恢复，请使用新的请求标识')
    if resume_id and values['kind'] != 'analyze':
        raise ValidationError('只有资料研究可继续已完成阶段')
    if values['kind'] == 'experiment_review':
        from .experiments.reviews import validate_input
        return validate_input(entry, values, existing=existing)
    if values.pop('validation_result_id') is not None:
        raise ValidationError('只有固定验证解读可引用固定验证结果')
    if values.pop('experiment_result_id') is not None:
        raise ValidationError('只有实验解读可引用实验结果')
    if values['kind'] == 'feedback_review':
        from .feedback.services import validate_input
        return validate_input(entry, values, existing=existing)
    if values['kind'] == 'analyze':
        from .models import SourceRevision
        source = get_object_or_404(SourceRevision, pk=values['source_id'], material__entry=entry)
        if source.payload.get('provenance') == 'external_feedback':
            raise ValidationError('外部反馈请使用反馈分析，不作为源码研究输入')
        if len(json.dumps(source.payload, ensure_ascii=False)) + len(values['requirements']) > 200000:
            raise ValidationError('来源材料超过分析上限，请拆分后重试')
        values.update(source_version_id=None, target_language='', target_version='')
        if not existing or existing.workflow_version:
            values.update(workflow_version=existing.workflow_version if existing else VERSION, resume_run_id=resume_id)
            # Empty restart_stage is omitted from the fingerprint so pre-field
            # idempotency keys continue to identify exactly the same request.
            if restart_stage:
                values['restart_stage'] = restart_stage
        if resume_id:
            previous = get_object_or_404(AIRun, pk=resume_id, entry=entry, kind='analyze', workflow_version__in=(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17))
            values['workflow_version'] = previous.workflow_version
            from .worker import recover
            allowed = ('failed', 'cancelled', 'interrupted', 'completed') if restart_stage else ('failed', 'cancelled', 'interrupted')
            cross_source = previous.source_id != source.pk
            if cross_source:
                prior_source = previous.resolved_source or previous.source
                if (restart_stage or recover(previous).status != 'completed'
                        or prior_source.material_id != source.material_id):
                    raise ValidationError('跨源码研究须明确选择同材料的已完成研究，不指定重跑阶段')
                values['workflow_version'] = existing.workflow_version if existing else INCREMENTAL_VERSION
            elif recover(previous).status not in allowed:
                raise ValidationError('只能继续未完成的阶段研究')
            if restart_stage and not previous.workflow_steps.filter(stage=restart_stage).exists():
                raise ValidationError('只能从原研究已开始的阶段重新执行')
        return values
    values.pop('source_id')
    version = get_object_or_404(CodeVersion, pk=values['source_version_id'], implementation__entry=entry)
    if not version.code.strip():
        raise ValidationError('所选版本尚无代码，请先填写或导入脚本')
    if values['kind'] == 'convert' and not values['target_language']:
        raise ValidationError('请选择目标代码语言')
    if values['kind'] == 'explain':
        values['target_language'], values['target_version'] = '', ''
    # Preserve the exact source rather than silently slicing code or instructions.
    if len(version.code) + len(version.dependencies) + len(version.parameters) + len(values['requirements']) > 200000:
        raise ValidationError('所选代码及要求超过本次 AI 输入上限，请拆分实现后重试')
    return values


def queue(entry: Entry, data: dict) -> AIRun:
    key = data.get('request_key')
    if not isinstance(key, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{16,64}', key):
        raise ValidationError('缺少有效请求标识，请重新提交')
    existing = AIRun.objects.filter(entry=entry, request_key=key).first()
    values = _run_input(entry, data, existing)
    fingerprint = canonical_hash(values)
    from .worker import dispatch, recover
    if existing:
        # Legacy review fingerprints predate the version field. A retry keeps
        # its original contract instead of silently upgrading the same request.
        if existing.kind == 'experiment_review' and existing.review_version == 1:
            legacy_values = {name: value for name, value in values.items() if name != 'review_version'}
            fingerprint = canonical_hash(legacy_values)
        if existing.input_hash != fingerprint:
            raise Conflict('请求标识已用于其他输入，请重新提交')
        return recover(existing)
    # A restarted process loses its executor queue. Expired leases from any
    # entry must release capacity without dispatching those old requests again.
    active_count = 0
    for run in AIRun.objects.filter(entry__anthology=entry.anthology, status__in=['pending', 'running']):
        if recover(run).status in ('pending', 'running'):
            active_count += 1
    if active_count >= 4:
        raise QueueCapacity()
    config = model_config(values['model_id'])
    values['model_id'] = str(config.get('model_id') or values['model_id'])
    run = AIRun.objects.create(entry=entry, request_key=key, input_hash=fingerprint,
                               model_name=config['model_name'], **values)
    Job.objects.create(run=run, lease_until=timezone.now() + timedelta(minutes=3))
    transaction.on_commit(lambda: dispatch(run.pk))
    touch(entry)
    return run


def adopt(run: AIRun) -> dict:
    if run.status != 'completed':
        raise Conflict('仅可采用完整完成的 AI 结果')
    if run.kind in ('analyze', 'experiment_review', 'feedback_review'):
        raise ValidationError('分析报告已自动保存，无需采用')
    if run.kind == 'explain':
        return {'explanation': run.result.get('explanation', '')}
    if run.adopted_implementation_id:
        implementation = get_object_or_404(Implementation, pk=run.adopted_implementation_id, entry=run.entry)
    else:
        code = run.result.get('code')
        if not isinstance(code, str) or not code.strip():
            raise Conflict('候选代码不完整，不能采用')
        implementation = create_implementation(run.entry, {
            'name': f'{run.target_language.upper()} 转换实现', 'language': run.target_language,
            'language_version': run.target_version, 'dependencies': run.result.get('dependencies', ''),
            'parameters': run.source_version.parameters, 'code': code,
            'note': 'AI 转换候选，待编译、运行及结果核对', 'source_version_id': run.source_version_id,
        })
        run.adopted_implementation_id = implementation.pk
        run.save(update_fields=['adopted_implementation_id', 'updated_at'])
    return {'implementation': implementation}


def parse_result(kind: str, output: str, *,model_output=True) -> dict:
    if len(output) > CODE_LIMIT + 100000:
        raise ValidationError('模型输出超过上限，本次未采用')
    text = output.strip()
    if text.startswith('```') and text.endswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, count=1).rsplit('```', 1)[0].strip()
    try:
        value = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise ValidationError('模型未返回完整有效的结果，请调整要求后重试') from exc
    if kind == 'experiment_review':
        from .experiments.review_contract import validate_review
        return validate_review(value)
    if kind == 'feedback_review':
        from .feedback.contracts import validate_analysis
        return validate_analysis(value, model_output=model_output)
    if kind == 'analyze':
        from .research.analysis import validate_analysis
        return validate_analysis(value)
    fields = ('code', 'explanation', 'differences', 'assumptions', 'dependencies', 'limitations')
    if not isinstance(value, dict) or any(not isinstance(item, str) for key, item in value.items() if key in fields):
        raise ValidationError('模型结果格式无效，本次未采用')
    result = {key: value.get(key, '') for key in fields}
    required = ('explanation',) if kind == 'explain' else ('code', 'differences', 'assumptions', 'limitations')
    if any(not result[key].strip() for key in required):
        raise ValidationError('模型结果缺少解释、差异或转换边界，本次未采用')
    if len(result['code'].encode('utf-8')) > CODE_LIMIT or len(result['dependencies']) > 10000 or any(len(result[key]) > 30000 for key in fields if key not in ('code', 'dependencies')):
        raise ValidationError('模型结果超过字段上限，本次未采用')
    if kind == 'explain':
        result.pop('code')
    return result
