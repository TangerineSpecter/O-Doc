"""Local fallback scan cadence; arrivals and explicit daily planning enqueue directly."""
import hashlib
from django.core.cache import cache
from .life_time import local_time

REVIEW_SCAN_SECONDS = 300


def enqueue_due_review(owner: str, actor_id: str) -> int:
    from .market_disposition_worker import enqueue_review
    identity = hashlib.sha256(f'{owner}:{actor_id}:{local_time().date()}'.encode()).hexdigest()
    key = 'market-review-scan:' + identity
    if not cache.add(key, True, timeout=REVIEW_SCAN_SECONDS):
        return 0
    try:
        return enqueue_review(owner, actor_id)
    except Exception:
        cache.delete(key)  # Failed scans must be retryable at the next poll.
        raise
