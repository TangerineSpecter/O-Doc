"""Publish bounded nearest-neighbor suggestions with immutable reconstruction evidence."""
from quant.models import FactorCandidate, FactorRelation, FactorVector
from quant.research.contracts import digest
from quant.factors.grouping import fingerprints
from .projection import cosine, projection

THRESHOLD = .7
NEIGHBORS = 6
COMPARE_LIMIT = 2000


def connect_semantic(candidate: FactorCandidate, vector: list, signature: str, model_name: str) -> None:
    from .indexing import candidates
    own_expression = fingerprints(candidate)['expression']
    records = FactorVector.objects.filter(model_signature=signature,
        candidate__report__entry__anthology_id=candidate.report.entry.anthology_id,
        candidate__report__entry__is_valid=True).exclude(candidate=candidate).order_by('-updated_at')[:COMPARE_LIMIT]
    cached = {record.candidate_id: record for record in records}
    ranked = []
    for other in candidates(candidate.report.entry.anthology_id).filter(pk__in=cached):
        try:
            _, content_hash = projection(other)
        except ValueError:
            continue
        record = cached[other.pk]
        if record.projection_hash != content_hash:
            continue
        if own_expression and own_expression == fingerprints(other)['expression']:
            continue  # The deterministic same-expression edge already explains this pair.
        score = cosine(vector, record.vector)
        if score is not None and score >= THRESHOLD:
            ranked.append((score, other))
    ranked.sort(key=lambda pair: (-pair[0], pair[1].pk))
    for score, other in ranked[:NEIGHBORS]:
        left, right = sorted([candidate, other], key=lambda item: item.pk)
        evidence = {'method': 'embedding-cosine-v1', 'projection_version': 1,
            'model_signature': signature, 'model_name': model_name, 'similarity': round(score, 8),
            'threshold': THRESHOLD, 'left_projection_hash': projection(left)[1],
            'right_projection_hash': projection(right)[1], 'left_revision_id': left.current_revision_id,
            'right_revision_id': right.current_revision_id,
            'claim': 'semantic_similarity_only', 'comparison_limit': COMPARE_LIMIT}
        content_hash = digest(evidence)
        FactorRelation.objects.get_or_create(id=digest(['semantic-relation-v1', left.pk, right.pk, content_hash])[:40],
            defaults={'left': left, 'right': right, 'kind': 'semantic_similar', 'evidence': evidence, 'content_hash': content_hash})
