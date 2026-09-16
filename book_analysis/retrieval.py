"""Book-only vector retrieval with keyword/evidence fallback."""
import heapq
import json
import logging
import re

from utils.rag_client import RagClient, RagSyncError
from utils.ai_observer import emit_ai_event

from .graph import node_detail
from .models import ChapterResult, SourceCache
from .parsers import iter_segments, slice_locator, stable_id
from .embeddings import embed_texts

logger = logging.getLogger(__name__)


def book_collection(book_id, model=None):
    model = model or RagClient.get_embedding_model()
    if not model:
        raise RagSyncError('未配置默认向量模型')
    return RagClient.get_collection('odoc_book_' + stable_id(book_id, model.pk, model.name)[:32])


def source_item(chapter, text: str, offset: int) -> dict:
    locator = slice_locator(chapter.locator, offset, offset + len(text))
    locator.pop('spans', None)
    locator.pop('source_regions', None)
    locator.pop('origin_id', None)
    locator.pop('origin_offset', None)
    return {'chapter_id': chapter.pk, 'chapter_title': chapter.title, 'ordinal': chapter.ordinal, 'quote': text, 'locator': locator}


def index_revision(revision, check=lambda: None, chapter_id: str = ''):
    model = RagClient.get_embedding_model()
    collection = book_collection(revision.book_id, model)
    result_ids = ChapterResult.objects.filter(revision=revision).values('chapter_id')
    if chapter_id:
        result_ids = result_ids.filter(chapter_id=chapter_id)
    batch = []

    def flush():
        check()
        ids = [stable_id(revision.pk, item['chapter_id'], item['locator'], item['quote']) for item in batch]
        stored = set(collection.get(ids=ids, include=[]).get('ids', []))
        pending = [(identity, item) for identity, item in zip(ids, batch) if identity not in stored]
        if not pending:
            emit_ai_event('index_batch_saved', '复用已保存的原文向量', 'success', phase='index', vectors=len(batch))
            batch.clear()
            return
        ids = [identity for identity, _ in pending]
        batch[:] = [item for _, item in pending]
        documents = [item['quote'] for item in batch]
        embeddings = embed_texts(documents, model=model)
        check()
        collection.upsert(ids=[stable_id(revision.pk, item['chapter_id'], item['locator'], item['quote']) for item in batch], documents=documents, embeddings=embeddings, metadatas=[{'book_id': str(revision.book_id), 'revision_id': str(revision.pk), 'chapter_id': item['chapter_id'], 'chapter_title': item['chapter_title'], 'ordinal': item['ordinal'], 'locator': json.dumps(item['locator'])} for item in batch])
        emit_ai_event('index_batch_saved', '原文检索批次已保存', 'success', phase='index', vectors=len(batch))
        batch.clear()

    for cache in SourceCache.objects.filter(chapter_id__in=result_ids).select_related('chapter').iterator(chunk_size=10):
        for offset, text in iter_segments(cache.text, size=1500):
            batch.append(source_item(cache.chapter, text, offset))
            if len(batch) == 1:
                flush()
    if batch:
        flush()


def retrieve(revision, question: str, chapter_id: str = '', node_id: str = '', through_chapter: int | None = None) -> tuple[list[dict], str]:
    sources = []
    if node_id:
        detail = node_detail(revision, node_id, through_chapter=through_chapter)
        sources = [fact['evidence'] for fact in detail['node']['facts'] if fact.get('evidence')]
        for node in detail['neighbors']['nodes']:
            sources += [f['evidence'] for f in node['facts'][:2] if f.get('evidence')]
        if chapter_id:
            sources = [s for s in sources if s['chapter_id'] == chapter_id]
    try:
        model = RagClient.get_embedding_model()
        collection = book_collection(revision.book_id, model)
        where = {'$and': [{'book_id': str(revision.book_id)}, {'revision_id': str(revision.pk)}]}
        if through_chapter is not None:
            where['$and'].append({'ordinal': {'$lte': through_chapter}})
        if chapter_id:
            where['$and'].append({'chapter_id': chapter_id})
        result = collection.query(query_embeddings=embed_texts([question], purpose='query', model=model), where=where, n_results=6, include=['documents', 'metadatas'])
        retrieved = []
        for text, meta in zip(result.get('documents', [[]])[0], result.get('metadatas', [[]])[0]):
            if through_chapter is not None and meta.get('ordinal', through_chapter + 1) > through_chapter:
                continue
            if not ChapterResult.objects.filter(revision=revision, chapter_id=meta['chapter_id']).exists():
                continue
            retrieved.append({'chapter_id': meta['chapter_id'], 'chapter_title': meta['chapter_title'], 'ordinal': meta['ordinal'], 'quote': text, 'locator': json.loads(meta['locator'])})
        if retrieved:
            return combine_sources(sources, retrieved), 'vector'
    except Exception as exc:
        # No vectors, a provider outage or changed model must not disable reading.
        logger.info('Book retrieval using keyword fallback: book=%s reason=%s', revision.book_id, type(exc).__name__)
    words = re.findall(r'[a-zA-Z0-9_]{2,}|[\u4e00-\u9fff]+', question)
    terms = {w for w in words if len(w) <= 15}
    terms.update(w[i:i + 2] for w in words for i in range(len(w) - 1) if '\u4e00' <= w[i] <= '\u9fff')
    ids = ChapterResult.objects.filter(revision=revision)
    if through_chapter is not None:
        ids = ids.filter(chapter__ordinal__lte=through_chapter)
    if chapter_id:
        ids = ids.filter(chapter_id=chapter_id)
    ranked = []
    counter = 0
    for cache in SourceCache.objects.filter(chapter_id__in=ids.values('chapter_id')).select_related('chapter').iterator(chunk_size=10):
        for offset, text in iter_segments(cache.text, size=1500):
            score = sum(text.casefold().count(w.casefold()) for w in terms)
            counter += 1
            item = (score, counter, source_item(cache.chapter, text, offset))
            if len(ranked) < 6:
                heapq.heappush(ranked, item)
            elif item[:2] > ranked[0][:2]:
                heapq.heapreplace(ranked, item)
    retrieved = [item[2] for item in sorted(ranked, reverse=True) if item[0] > 0 or chapter_id]
    if not sources and not retrieved:
        # Synced evidence still supports Q&A without a local source file.
        from .graph import read_graph
        graph = read_graph(revision, chapter_id=chapter_id, limit=100, through_chapter=through_chapter)
        for node in graph['nodes']:
            for fact in node['facts']:
                ev = fact.get('evidence')
                if ev and any(term in ev['quote'] or term in node['name'] for term in terms):
                    sources.append(ev)
    return combine_sources(sources, retrieved), 'keyword'


def reading_context(revision, sources, through_chapter=None):
    """Combine stored summaries with retrieved evidence, without slicing summaries."""
    chapter_ids = list(dict.fromkeys(item['chapter_id'] for item in sources))[:2]
    chapters = []
    for result in ChapterResult.objects.filter(revision=revision, chapter_id__in=chapter_ids).select_related('chapter'):
        summary = result.digest.get('summary', '')
        chapters.append({'chapter_title': result.chapter.title, 'summary': summary if len(summary) <= 6000 else '导读较长，请在章节页面查看完整导读；本次只使用原文证据。'})
    overview = revision.overview.get('summary', '') if through_chapter is None else ''
    return {'overview': overview if len(overview) <= 6000 else '概要较长，请在整书概要页面查看；本次只使用相关章节与原文证据。', 'chapters': chapters}


def combine_sources(graph_sources: list[dict], retrieved_sources: list[dict]) -> list[dict]:
    """Reserve two graph anchors and six query-ranked hits; fill unused slots."""
    anchors = unique_sources(graph_sources)
    return unique_sources([*anchors[:2], *retrieved_sources, *anchors[2:]])


def unique_sources(items: list[dict]) -> list[dict]:
    unique = {}
    for item in items:
        unique.setdefault(stable_id(item['chapter_id'], item['quote']), item)
    return [{**item, 'source_id': f'S{i + 1}'} for i, item in enumerate(list(unique.values())[:8])]
