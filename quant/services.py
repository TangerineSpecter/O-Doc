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


def _run_input(entry: Entry, data: dict) -> dict:
    from rest_framework import serializers
    class Input(serializers.Serializer):
        kind = serializers.ChoiceField(choices=['explain', 'convert'])
        source_version_id = serializers.CharField(max_length=40)
        target_language = serializers.ChoiceField(choices=Implementation.LANGUAGES, required=False, allow_blank=True, default='')
        target_version = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
        requirements = serializers.CharField(max_length=8000, required=False, allow_blank=True, default='')
        model_id = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
    serializer = Input(data=data)
    serializer.is_valid(raise_exception=True)
    values = dict(serializer.validated_data)
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
    values = _run_input(entry, data)
    fingerprint = canonical_hash(values)
    from .worker import dispatch, recover
    existing = AIRun.objects.filter(entry=entry, request_key=key).first()
    if existing:
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
        raise Conflict('当前已有多个量化任务，请等待完成或取消后再提交')
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


def parse_result(kind: str, output: str) -> dict:
    if len(output) > CODE_LIMIT + 100000:
        raise ValidationError('模型输出超过上限，本次未采用')
    text = output.strip()
    if text.startswith('```') and text.endswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, count=1).rsplit('```', 1)[0].strip()
    try:
        value = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise ValidationError('模型未返回完整有效的结果，请调整要求后重试') from exc
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
