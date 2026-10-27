"""Publishing is part of the report transaction. Replaying cannot duplicate occurrences."""
from quant.models import FactorCandidate, ResearchReport
from quant.research.contracts import digest
from .expression import expression_hash


def publish_candidates(report: ResearchReport) -> None:
    for ordinal, data in enumerate(report.data.get('factors', [])):
        candidate, _ = FactorCandidate.objects.get_or_create(report=report, ordinal=ordinal, defaults={
            'id': digest(['factor-occurrence-v1', report.pk, ordinal])[:40],
            'data': data, 'content_hash': digest(data), 'expression_hash': expression_hash(data), 'qualification_version': 1, 'admission_version':1})
        from quant.verification.services import qualify
        qualify(candidate)


def candidate_data(candidate: FactorCandidate, vocabulary=None) -> dict:
    from .curation import curation_data
    from .grouping import fingerprints
    from quant.verification.services import projection as verification_projection
    from quant.admissions.services import summary as admission_summary
    report = candidate.report
    ai_revision = candidate.data.get('formula_version', {}).get('origin') in ('ai_repair', 'ai_study')
    curation = curation_data(candidate)
    if vocabulary is None:
        from quant.taxonomy.services import current
        vocabulary = current(report.entry.anthology_id)
    from quant.taxonomy.normalization import classify
    classification = classify(candidate.data, curation['curation'], *vocabulary, platform=report.source.payload.get('platform', '') if not candidate.data.get('formula_version') and not candidate.derived_checkpoint_id else '')
    return {'id': candidate.pk, 'report_id': report.pk, 'source_id': report.source_id,
        'entry_id': report.entry_id, 'entry_title': report.entry.title, 'data': candidate.data,
        'expression_hash': candidate.expression_hash, 'content_hash': candidate.content_hash,
        'created_at': candidate.created_at.isoformat(), 'model_name': 'AI 自动研究' if candidate.data.get('formula_version', {}).get('origin') == 'ai_study' else 'AI 定义修订 · ' + report.run.model_name if ai_revision else '人工公式修订' if candidate.data.get('formula_version') else '本机受限表达式实验' if candidate.derived_checkpoint_id else report.run.model_name,
        'evidence_status': 'ai_revised_unverified' if ai_revision else 'authored_unverified' if candidate.data.get('formula_version') else 'local_simulation_unverified_platform' if candidate.derived_checkpoint_id else 'static_unverified', **curation, 'classification': classification,
        'fingerprints': fingerprints(candidate), 'occurrence_count': 1,
        'verification': verification_projection(candidate), 'admission':admission_summary(candidate)}
