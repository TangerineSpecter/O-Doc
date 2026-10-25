"""Read-only preview and idempotent archival, with no terminal/worker dispatch."""
import hashlib
import json
from django.db import transaction
from django.shortcuts import get_object_or_404
from quant.models import StrategyArtifact, CodeVersion, Implementation, FactorCandidate
from quant.research.contracts import digest
from .spec import context
from .generator import bundle, identity


def preview(request, attempt_id='') -> dict:
    value = context(request, attempt_id)
    return bundle(value)


def present(artifact) -> dict:
    return {'id': artifact.pk, 'request_id': artifact.request_id, 'entry_id': artifact.version.implementation.entry_id,
        'implementation_id': artifact.version.implementation_id, 'version_id': artifact.version_id,
        'attempt_id': artifact.data['context']['attempt_id'], 'created_at': artifact.created_at,
        'verification': 'native_compile_run_and_equivalence_pending', 'content_hash': artifact.content_hash}


@transaction.atomic
def archive(request, attempt_id=''):
    value = context(request, attempt_id)
    artifact_id = identity(value)
    existing = StrategyArtifact.objects.select_related('version__implementation').filter(pk=artifact_id).first()
    if existing: return existing
    exported = bundle(value)
    manifest = json.loads(exported['manifest_json'])
    parent = get_object_or_404(FactorCandidate.objects.select_related('report__entry'), pk=value['parents'][0]['id'],
        report__entry__anthology_id=request.anthology_id, report__entry__is_valid=True)
    owner = parent.report.entry
    implementation_id, version_id = identifiers(artifact_id)
    implementation = Implementation.objects.create(id=implementation_id, entry=owner,
        name=f"MQ4 EA候选 · {request.plan['name'][:120]} · {value['attempt_id']}", language='mql4', language_version='MQL4 build 600+ / Strategy Tester',
        dependencies='MT4 Strategy Tester；无DLL/网络；合约和平台语义待验证',
        parameters=json.dumps({'native_inputs': manifest['native_inputs'], 'parameter_mapping': manifest['parameter_mapping'],
            'reference_only_config': manifest['reference_only_config']}, ensure_ascii=False))
    version = CodeVersion.objects.create(id=version_id, implementation=implementation, code=exported['code'],
        content_hash=hashlib.sha256(exported['code'].encode()).hexdigest(), strategy_artifact_id=artifact_id,
        language=implementation.language, language_version=implementation.language_version,
        dependencies=implementation.dependencies, parameters=implementation.parameters,
        note='由实际评价公式与完整策略假设生成的EA候选；原生编译、运行与等价性待验证，不代表原始平台源码或盈利能力。')
    implementation.current_version_id=version.pk; implementation.save(update_fields=['current_version_id', 'updated_at'])
    from quant.research.services import capture_version
    capture_version(version)
    artifact = StrategyArtifact.objects.create(id=artifact_id, request=request, version=version, data=manifest, content_hash=digest(manifest))
    from quant.services import touch
    touch(owner)
    return artifact


def identifiers(artifact_id: str) -> tuple[str, str]:
    return digest(['strategy-implementation-v1', artifact_id])[:40], digest(['strategy-code-v1', artifact_id])[:40]
