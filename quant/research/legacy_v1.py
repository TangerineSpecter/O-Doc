"""Frozen v1 upgrade used by migration and old-snapshot restore. Do not reinterpret originals."""
import hashlib
import json


def _hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def upgrade(apps, using='default'):
    """Idempotent, local database-only mapping. Never schedules analysis or reads files."""
    models = {name: apps.get_model('quant', name).objects.using(using) for name in
              ('Entry', 'Implementation', 'CodeVersion', 'AIRun', 'SourceMaterial', 'SourceRevision', 'ResearchReport')}
    for entry in models['Entry'].iterator():
        if not entry.content and not entry.source_url:
            continue
        material, _ = models['SourceMaterial'].get_or_create(id=_hash(['entry_material', entry.pk])[:40],
            defaults={'entry_id': entry.pk, 'title': entry.title})
        payload = {'description': entry.content, 'url': entry.source_url,
                   'provenance': 'legacy_entry', 'fetch_status': 'not_fetched'}
        source, created = models['SourceRevision'].get_or_create(id=_hash(['entry_revision', entry.pk, payload])[:40],
            defaults={'material_id': material.pk, 'payload': payload, 'content_hash': _hash(payload)})
        if created:
            models['SourceRevision'].filter(pk=source.pk).update(created_at=entry.created_at, updated_at=entry.updated_at)
        if not material.current_revision_id:
            material.current_revision_id = source.pk
            material.save(update_fields=['current_revision_id'])
    for implementation in models['Implementation'].iterator():
        material, _ = models['SourceMaterial'].get_or_create(id=_hash(['implementation', implementation.pk])[:40],
            defaults={'entry_id': implementation.entry_id, 'title': implementation.name})
        for version in models['CodeVersion'].filter(implementation_id=implementation.pk).iterator():
            payload = {key: getattr(version, key) for key in
                       ('code', 'language', 'language_version', 'dependencies', 'parameters', 'note')}
            payload['provenance'] = 'code_version'
            source, created = models['SourceRevision'].get_or_create(id=_hash(['code_version', version.pk])[:40],
                defaults={'material_id': material.pk, 'code_version_id': version.pk,
                          'payload': payload, 'content_hash': _hash(payload)})
            if created:
                models['SourceRevision'].filter(pk=source.pk).update(created_at=version.created_at, updated_at=version.updated_at)
            if version.pk == implementation.current_version_id and not material.current_revision_id:
                material.current_revision_id = source.pk
                material.save(update_fields=['current_revision_id'])
    for run in models['AIRun'].filter(kind='explain', status='completed').iterator():
        source_id = _hash(['code_version', run.source_version_id])[:40]
        if not models['SourceRevision'].filter(pk=source_id).exists():
            continue
        sections = [('explanation', '代码解释'), ('assumptions', '分析假设'),
                    ('dependencies', '所需依赖'), ('limitations', '限制与待验证事项'), ('differences', '实现差异')]
        markdown = '\n\n'.join(f'## {title}\n\n{run.result[key]}' for key, title in sections
                               if isinstance(run.result.get(key), str) and run.result[key].strip())
        if not markdown:
            continue
        data = {'format': 'legacy_explanation', 'result': run.result,
                'model_id': run.model_id, 'model_name': run.model_name,
                'requirements': run.requirements, 'evidence_status': 'unverified'}
        report, created = models['ResearchReport'].get_or_create(id=_hash(['report', run.pk])[:40],
            defaults={'entry_id': run.entry_id, 'source_id': source_id, 'run_id': run.pk,
                      'schema_version': 1, 'data': data, 'markdown': markdown,
                      'content_hash': _hash({'schema_version': 1, 'data': data, 'markdown': markdown})})
        if created:
            models['ResearchReport'].filter(pk=report.pk).update(created_at=run.created_at, updated_at=run.updated_at)
