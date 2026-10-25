"""Book-specific budgets over the shared cancellable embedding transport."""
from utils.bounded_embeddings import embed_texts as _embed_texts, validate_vectors

INDEX_TIMEOUT = 180
QUERY_TIMEOUT = 30


def embed_texts(texts, *, purpose='index', model=None):
    return _embed_texts(texts, purpose=purpose, model=model,
        timeout_seconds=INDEX_TIMEOUT if purpose == 'index' else QUERY_TIMEOUT)
