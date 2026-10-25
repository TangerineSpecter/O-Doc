"""Append-only source/report operations; caller owns collection lock + transaction."""
from django.db import transaction
from rest_framework.exceptions import ValidationError
from quant.models import SourceMaterial, SourceRevision, ResearchReport, ReportRevision
from quant.services import Conflict
from .contracts import digest, legacy_markdown


def capture_version(version) -> SourceRevision:
    """Code snapshots are exact, idempotent inputs; never scrape a URL here."""
    existing = SourceRevision.objects.filter(code_version=version).first()
    if existing:
        return existing
    implementation = version.implementation
    material_id = digest(['implementation', implementation.pk])[:40]
    material, _ = SourceMaterial.objects.get_or_create(id=material_id,
        defaults={'entry': implementation.entry, 'title': implementation.name})
    payload = {key: getattr(version, key) for key in
               ('code', 'language', 'language_version', 'dependencies', 'parameters', 'note')}
    payload['provenance'] = 'code_version'
    source = SourceRevision.objects.create(id=digest(['code_version', version.pk])[:40],
        material=material, code_version=version, payload=payload, content_hash=digest(payload))
    # Capturing an older version for analysis must not roll back the material pointer.
    if version.pk == implementation.current_version_id:
        material.current_revision_id = source.pk
        material.save(update_fields=['current_revision_id', 'updated_at'])
    return source


def publish_legacy_report(run) -> ResearchReport | None:
    """Preserve completed explanations, including sections previously lost on adopt."""
    if run.kind != 'explain' or run.status != 'completed':
        return None
    report = ResearchReport.objects.filter(run=run).first()
    if report:
        return report
    source = capture_version(run.source_version)
    markdown = legacy_markdown(run.result)
    if not markdown:
        raise ValidationError('解释结果缺少正文')
    data = {'format': 'legacy_explanation', 'result': run.result,
            'model_id': run.model_id, 'model_name': run.model_name,
            'requirements': run.requirements, 'evidence_status': 'unverified'}
    return ResearchReport.objects.create(id=digest(['report', run.pk])[:40], entry=run.entry,
        source=source, run=run, data=data, markdown=markdown,
        content_hash=digest({'schema_version': 1, 'data': data, 'markdown': markdown}))


@transaction.atomic
def revise_report(report, markdown: str, expected_revision_id: str) -> ReportRevision:
    """Optimistic concurrency protects edits made in another tab/device."""
    if not isinstance(markdown, str) or len(markdown) > 200000:
        raise ValidationError('报告正文最多 200000 字符')
    report = ResearchReport.objects.select_for_update().get(pk=report.pk)
    if report.current_revision_id != expected_revision_id:
        raise Conflict('报告已有新的修订，请刷新后合并修改')
    revision = ReportRevision.objects.create(report=report, parent_id=expected_revision_id,
        markdown=markdown, content_hash=digest(markdown))
    report.current_revision_id = revision.pk
    report.save(update_fields=['current_revision_id', 'updated_at'])
    return revision


def publish_report(run) -> ResearchReport | None:
    if run.kind == 'feedback_review':
        if run.status != 'completed':
            return None
        from quant.feedback.contracts import markdown as feedback_markdown
        markdown = feedback_markdown(run.result)
        report, _ = ResearchReport.objects.get_or_create(run=run, defaults={
            'entry': run.entry, 'source': run.source, 'schema_version': 5,
            'data': run.result, 'markdown': markdown,
            'content_hash': digest({'schema_version': 5, 'data': run.result, 'markdown': markdown})})
        from quant.experiments.proposals import publish
        publish(run)
        return report
    if run.kind == 'experiment_review':
        if run.status != 'completed':
            return None
        from quant.experiments.review_contract import review_markdown
        markdown = review_markdown(run.result)
        report, _ = ResearchReport.objects.get_or_create(run=run, defaults={
            'entry': run.entry, 'source': run.source, 'schema_version': 4,
            'data': run.result, 'markdown': markdown,
            'content_hash': digest({'schema_version': 4, 'data': run.result, 'markdown': markdown})})
        from quant.experiments.proposals import publish
        publish(run)
        return report
    if run.kind != 'analyze':
        return publish_legacy_report(run)
    from .analysis import analysis_markdown
    if run.status != 'completed':
        return None
    from quant.experiments.initial_planning import validate_strategy_admission
    validate_strategy_admission(run.result, run.workflow_version)
    from .findings import validate_admission
    validate_admission(run.result, run.workflow_version)
    if 'source_memory_version' in run.result and run.workflow_version not in (12,13,14,15):
        raise ValidationError('历史源码报告不能追加未冻结的研究记忆')
    if 'factor_repair' in run.result and run.workflow_version not in (8, 9, 10, 11, 12, 13, 14, 15):
        raise ValidationError('AI 定义修订须绑定支持的阶段工作流')
    existing = ResearchReport.objects.filter(run=run).first()
    if existing:
        return existing
    markdown = analysis_markdown(run.result)
    schema = 3 if run.result.get('extraction_version') == 1 else 2
    report = ResearchReport.objects.create(entry=run.entry, source=run.resolved_source or run.source, run=run, schema_version=schema,
        data=run.result, markdown=markdown,
        content_hash=digest({'schema_version': schema, 'data': run.result, 'markdown': markdown}))
    from quant.factors.services import publish_candidates
    publish_candidates(report)
    from quant.repairs.services import publish as publish_repairs
    publish_repairs(report)
    from quant.experiments.proposals import publish
    publish(run)
    if run.result.get('factors'):
        from quant.graph.indexing import auto_index
        transaction.on_commit(lambda: auto_index(report.pk))
    run.entry.refresh_from_db()
    if run.entry.title == '待分析资料':
        run.entry.title = run.result['title']
        run.entry.kind = run.result['kind']
        run.entry.tags = run.result['tags']
        run.entry.save(update_fields=['title', 'kind', 'tags', 'updated_at'])
    return report
