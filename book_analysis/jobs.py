"""Durable, cross-process task claims and chapter-level publication."""
import logging
import threading
import uuid
from datetime import timedelta

from django.db import close_old_connections, transaction
from django.db.models import Q
from django.utils import timezone

from system_settings.sync_state import record_bulk_change
from utils.ai_service import AIAuthenticationError, AIService
from utils.ai_observer import ai_scope, emit_ai_event, observe_ai

from .errors import AnalysisError
from .execution import record_event
from .extraction import EXTRACTION_VERSION, extract_segment, summarize_all
from .graph import add_segment, relevant_registry
from .inspection import current_hash, rebuild_source_cache
from .models import AnalysisRun, BookAnalysis, Chapter, ChapterResult, GraphEdge, GraphNode, NodeSource, Revision, SegmentCache, SourceCache, WorkerLease
from .parsers import iter_segments, stable_id

logger = logging.getLogger(__name__)
LEASE_SECONDS = 180


def assert_current(run):
    book = run.book
    book.refresh_from_db()
    analysis = BookAnalysis.objects.get(book=book)
    revision = run.revision
    if not book.is_valid or not book.anthology.is_valid or current_hash(book) != revision.source_hash or analysis.source_hash != revision.source_hash or analysis.mode != revision.mode or analysis.settings_version != revision.settings_version:
        raise AnalysisError('图书正文、模式或章节设置已变化，旧任务已停止，请重新分析', 409)
    return analysis


@transaction.atomic
def create_run(book, mode: str, start: int = 1, end: int | None = None, force: bool = False, kind: str = 'analyze') -> AnalysisRun:
    if mode not in ('story', 'knowledge'):
        raise AnalysisError('阅读模式必须为故事或知识')
    analysis = BookAnalysis.objects.select_for_update().get(book=book)
    if not analysis.inspection.get('supported') or analysis.source_hash != current_hash(book):
        raise AnalysisError('请先检测可提取正文，或从书架恢复图书', 409)
    active = AnalysisRun.objects.filter(book=book, state__in=['queued', 'running']).first()
    if active:
        if active.revision.mode != mode:
            raise AnalysisError('请先停止当前任务，再切换模式', 409)
        return active
    chapters = list(Chapter.objects.filter(book=book, source_hash=analysis.source_hash, is_valid=True))
    if not chapters:
        raise AnalysisError('没有可分析章节')
    if end is None:
        end = min(len(chapters), 20) if len(chapters) > 100 else len(chapters)
    if start < 1 or end < start or end > len(chapters):
        raise AnalysisError('章节范围无效')
    if analysis.mode != mode:
        analysis.mode = mode
        analysis.settings_version += 1
        analysis.save()
    if kind == 'index':
        revision = Revision.objects.filter(id=analysis.published_revision, book=book, source_hash=analysis.source_hash, mode=mode).first()
        if not revision:
            raise AnalysisError('没有可重建检索的已发布结果', 409)
        chapter_ids = list(ChapterResult.objects.filter(revision=revision).values_list('chapter_id', flat=True))
    else:
        revision = Revision.objects.create(book=book, source_hash=analysis.source_hash, mode=mode, settings_version=analysis.settings_version)
        chapter_ids = [ch.id for ch in chapters if start <= ch.ordinal <= end]
    run = AnalysisRun.objects.create(book=book, revision=revision, chapter_ids=chapter_ids, force=force, kind=kind)
    record_event(run, 'queued', '任务已创建，等待后台领取')
    return run


@transaction.atomic
def cancel_run(run):
    run = AnalysisRun.objects.select_for_update().get(pk=run.pk)
    run.cancel_requested = True
    if run.state == 'queued':
        run.state = 'cancelled'
        run.stage = '已停止'
    run.save()
    record_event(run, 'cancel_requested', '已请求停止，等待当前调用退出', 'warning')


@transaction.atomic
def retry_run(run):
    analysis = BookAnalysis.objects.select_for_update().get(book=run.book)
    run.refresh_from_db()
    assert_current(run)
    if run.state not in ('failed', 'cancelled'):
        raise AnalysisError('只有失败或已停止的任务可以重试', 409)
    if AnalysisRun.objects.filter(book=run.book, state__in=['queued', 'running']).exists():
        raise AnalysisError('已有任务等待执行', 409)
    run.state, run.error, run.stage, run.cancel_requested = 'queued', '', '等待续跑', False
    run.save()
    record_event(run, 'retry_requested', '已请求断点续跑，保留完成成果')
    return run


@transaction.atomic
def claim_run() -> tuple[AnalysisRun, str] | None:
    lease, _ = WorkerLease.objects.get_or_create(id='book-analysis')
    now = timezone.now()
    token = uuid.uuid4().hex
    won = WorkerLease.objects.filter(pk=lease.pk).filter(Q(expires_at__isnull=True) | Q(expires_at__lte=now)).update(owner=token, expires_at=now + timedelta(seconds=LEASE_SECONDS))
    if not won:
        return None
    if lease.run_id:
        abandoned = AnalysisRun.objects.filter(pk=lease.run_id, state='running').first()
        if abandoned:
            abandoned.state = 'cancelled' if abandoned.cancel_requested else 'queued'
            abandoned.stage = '等待断点续跑'
            abandoned.save()
            record_event(abandoned, 'worker_recovered', '旧任务租约已过期，恢复断点状态', 'warning')
    run = AnalysisRun.objects.select_for_update().filter(state='queued').order_by('created_at').select_related('book__asset', 'book__anthology', 'revision').first()
    if not run:
        WorkerLease.objects.filter(pk=lease.pk, owner=token).update(owner='', run_id='', expires_at=None)
        return None
    WorkerLease.objects.filter(pk=lease.pk, owner=token).update(run_id=run.pk)
    run.state, run.error = 'running', ''
    run.save()
    record_event(run, 'worker_claimed', '后台已领取任务，开始执行', token=token)
    return run, token


def check_run(run, token: str):
    if not WorkerLease.objects.filter(pk='book-analysis', owner=token, expires_at__gt=timezone.now()).exists():
        raise AnalysisError('任务执行租约已失效', 409)
    run.refresh_from_db(fields=['cancel_requested', 'completed_ids', 'state'])
    if run.cancel_requested:
        raise AnalysisError('已停止分析', 499)
    assert_current(run)


def check_model_run(run, token: str):
    """Lightweight live cancellation check; do not hash the file per poll."""
    if not WorkerLease.objects.filter(pk='book-analysis', owner=token, run_id=run.pk, expires_at__gt=timezone.now()).exists():
        raise AnalysisError('任务执行租约已失效', 409)
    state = AnalysisRun.objects.filter(pk=run.pk).values('cancel_requested', 'state').first()
    if not state or state['cancel_requested'] or state['state'] != 'running':
        raise AnalysisError('已停止分析', 499)


def copy_previous_revision(run):
    if ChapterResult.objects.filter(revision=run.revision).exists():
        return
    analysis = BookAnalysis.objects.get(book=run.book)
    previous = Revision.objects.filter(pk=analysis.published_revision, book=run.book, source_hash=run.revision.source_hash, mode=run.revision.mode, settings_version=run.revision.settings_version).first()
    if not previous:
        return
    excluded = set(run.chapter_ids) if run.force else set()
    for result in ChapterResult.objects.filter(revision=previous).exclude(chapter_id__in=excluded):
        ChapterResult.objects.create(id=stable_id(run.revision.pk, result.chapter_id), revision=run.revision, chapter_id=result.chapter_id, digest=result.digest)
    old_nodes = list(GraphNode.objects.filter(revision=previous))
    if excluded:
        for node in old_nodes:
            node.facts = [fact for fact in node.facts if fact.get('evidence', {}).get('chapter_id') not in excluded]
            if node.facts:
                node.ordinal = min(fact.get('ordinal', fact.get('evidence', {}).get('ordinal', 0) * 1000000000) for fact in node.facts)
        old_nodes = [node for node in old_nodes if node.facts]
    id_map = {n.id: stable_id(run.revision.pk, n.canonical_id) for n in old_nodes}
    GraphNode.objects.bulk_create([GraphNode(id=id_map[n.id], revision=run.revision, canonical_id=n.canonical_id, kind=n.kind, name=n.name, aliases=n.aliases, facts=n.facts, ordinal=n.ordinal, time_label=n.time_label, time_order=n.time_order, thread=n.thread) for n in old_nodes])
    edges = []
    for edge in GraphEdge.objects.filter(revision=previous).exclude(context__chapter_id__in=list(excluded)):
        evidence = [item for item in edge.evidence if item.get('chapter_id') not in excluded]
        if edge.source_id in id_map and edge.target_id in id_map and evidence:
            edges.append(GraphEdge(id=stable_id(run.revision.pk, edge.id), revision=run.revision, source_id=id_map[edge.source_id], target_id=id_map[edge.target_id], kind=edge.kind, label=edge.label, evidence=evidence, context=edge.context))
    GraphEdge.objects.bulk_create(edges)
    NodeSource.objects.bulk_create([NodeSource(id=stable_id(id_map[s.node_id], s.chapter_id), node_id=id_map[s.node_id], chapter_id=s.chapter_id) for s in NodeSource.objects.filter(node__revision=previous).exclude(chapter_id__in=excluded) if s.node_id in id_map])
    from .lineage import copy_analysis
    copy_analysis(previous, run.revision, excluded)
    record_bulk_change(GraphNode.objects.filter(revision=run.revision))
    record_bulk_change(GraphEdge.objects.filter(revision=run.revision))
    record_bulk_change(NodeSource.objects.filter(node__revision=run.revision))


def digest_chapter(chapter, payloads: list[dict], mode: str) -> dict:
    summary = summarize_all([p['summary'] for p in payloads if p['summary']], chapter.title, mode)
    return {'summary': summary, 'points': [item for p in payloads for item in p['points']], 'qa': [item for p in payloads for item in p['qa']], 'inspiration': [item for p in payloads for item in p['inspiration']] if mode == 'knowledge' else [], 'node_ids': list(dict.fromkeys(n['canonical_id'] for p in payloads for n in p['nodes']))}


def process_run(run, token: str):
    check_run(run, token)
    previous_id = BookAnalysis.objects.get(book=run.book).published_revision
    previous = Revision.objects.filter(pk=previous_id, book=run.book, source_hash=run.revision.source_hash, mode=run.revision.mode, settings_version=run.revision.settings_version).first() if run.force else None
    if SourceCache.objects.filter(chapter_id__in=run.chapter_ids).count() != len(run.chapter_ids):
        rebuild_source_cache(run.book)
    if run.kind == 'index':
        run.stage = '重新构建原文向量检索'
        run.save(update_fields=['stage', 'updated_at'])
        record_event(run, 'index_started', '开始重新构建原文检索', token=token)
        from .retrieval import index_revision
        index_revision(run.revision, lambda: check_run(run, token))
        run.index_state = 'ready'
        record_event(run, 'index_completed', '原文检索索引已就绪', 'success', token=token)
        run.save(update_fields=['index_state', 'updated_at'])
        return
    with transaction.atomic():
        check_run(run, token)
        copy_previous_revision(run)
    if run.revision.mode == 'story':
        from .facts import import_legacy
        import_legacy(run.revision)
    for chapter in Chapter.objects.filter(pk__in=run.chapter_ids).order_by('ordinal'):
        check_run(run, token)
        if chapter.id in run.completed_ids:
            continue
        if ChapterResult.objects.filter(revision=run.revision, chapter=chapter).exists():
            run.completed_ids = [*run.completed_ids, chapter.id]
            run.save(update_fields=['completed_ids', 'updated_at'])
            continue
        text = SourceCache.objects.get(chapter=chapter).text
        payloads = []
        segment_count = sum(1 for _ in iter_segments(text))
        for i, (offset, segment) in enumerate(iter_segments(text)):
            check_run(run, token)
            run.stage = f'第 {chapter.ordinal} 章 · 分段 {i + 1}'
            run.save(update_fields=['stage', 'updated_at'])
            cache_id = stable_id(chapter.pk, run.revision.mode, EXTRACTION_VERSION, offset, segment, run.revision.pk if run.force else '')
            cached = SegmentCache.objects.filter(pk=cache_id).first()
            registry = relevant_registry(run.revision, segment, chapter.ordinal)
            if previous:
                known = {item['canonical_id'] for item in registry}
                registry.extend(item for item in relevant_registry(previous, segment, chapter.ordinal) if item['canonical_id'] not in known)
            with ai_scope(phase='extract', chapter_title=chapter.title, chapter_ordinal=chapter.ordinal, segment=i + 1, segments=segment_count):
                emit_ai_event('segment_started', '复用已完成的分段结果' if cached else '正文分段就绪，开始抽取', chars=len(segment))
                payload = cached.payload if cached else extract_segment(segment, chapter, offset, run.revision.mode, registry)
            with transaction.atomic():
                check_run(run, token)
                if not cached:
                    SegmentCache.objects.update_or_create(pk=cache_id, defaults={'chapter': chapter, 'mode': run.revision.mode, 'payload': payload})
                add_segment(run.revision, chapter, payload)
            record_event(run, 'segment_saved', '分段成果已保存', 'success', {'phase': 'extract', 'chapter_ordinal': chapter.ordinal, 'segment': i + 1, 'segments': segment_count, 'nodes': len(payload['nodes']), 'edges': len(payload['edges']), 'summary': payload.get('summary', '')}, token=token)
            payloads.append(payload)
        if run.revision.mode == 'story':
            from .profiles import update_chapter
            with ai_scope(phase='profile', chapter_ordinal=chapter.ordinal):
                ready = update_chapter(run.revision, chapter, lambda: check_run(run, token), include_descriptions=any('attributes' in payload for payload in payloads))
            record_event(run, 'profile_updated', '本章画像已更新' if ready else '事实已保存，部分画像待更新', 'success' if ready else 'warning', {'phase': 'profile', 'chapter_ordinal': chapter.ordinal}, token=token)
        run.stage = f'第 {chapter.ordinal} 章 · 生成章节导读'
        run.save(update_fields=['stage', 'updated_at'])
        with ai_scope(phase='chapter_summary', chapter_title=chapter.title, chapter_ordinal=chapter.ordinal):
            emit_ai_event('chapter_summary_started', '分段抽取完成，生成章节导读')
            digest = digest_chapter(chapter, payloads, run.revision.mode)
        with transaction.atomic():
            analysis = BookAnalysis.objects.select_for_update().get(book=run.book)
            check_run(run, token)
            ChapterResult.objects.update_or_create(id=stable_id(run.revision.pk, chapter.pk), defaults={'revision': run.revision, 'chapter': chapter, 'digest': digest})
            run.completed_ids = [*run.completed_ids, chapter.pk]
            run.save(update_fields=['completed_ids', 'updated_at'])
            if not analysis.published_revision:
                analysis.published_revision = run.revision.pk
                analysis.save()
        record_event(run, 'chapter_completed', '章节导读已保存，发布状态以分析版本为准', 'success', {'chapter_ordinal': chapter.ordinal, 'chapter_title': chapter.title, 'summary': digest['summary']}, token=token)
        try:
            from .retrieval import index_revision
            index_revision(run.revision, lambda: check_run(run, token), chapter_id=chapter.pk)
        except AnalysisError:
            raise
        except Exception:
            logger.warning('Chapter index pending: chapter=%s', chapter.pk)
    if run.revision.mode == 'story':
        from .profiles import update_chapter
        run.stage = '完善人物画像与变化'
        run.save(update_fields=['stage', 'updated_at'])
        for completed_chapter in Chapter.objects.filter(chapterresult__revision=run.revision, pk__in=run.chapter_ids).order_by('ordinal'):
            # Existing v2 facts are upgraded here; freshly generated chapter profiles are reused.
            update_chapter(run.revision, completed_chapter, lambda: check_run(run, token), legacy=True)
    check_run(run, token)
    run.stage = '整理已分析章节与全书概要'
    run.save(update_fields=['stage', 'updated_at'])
    results = list(ChapterResult.objects.filter(revision=run.revision, chapter__is_valid=True).select_related('chapter').order_by('chapter__ordinal'))
    all_count = Chapter.objects.filter(book=run.book, source_hash=run.revision.source_hash, is_valid=True).count()
    with ai_scope(phase='book_summary'):
        emit_ai_event('book_summary_started', '整理已完成范围的概要')
        summary = summarize_all([f'{r.chapter.title}\n{r.digest["summary"]}' for r in results], run.book.title, run.revision.mode)
    overview = {'summary': summary, 'complete': len(results) == all_count, 'covered_chapters': [r.chapter.ordinal for r in results], 'total_chapters': all_count}
    with transaction.atomic():
        analysis = BookAnalysis.objects.select_for_update().get(book=run.book)
        check_run(run, token)
        run.revision.overview = overview
        run.revision.state = 'complete' if overview['complete'] else 'partial'
        run.revision.save()
        analysis.published_revision = run.revision.pk
        analysis.save()
    run.stage = '构建原文检索（失败不影响导读和图谱）'
    run.save(update_fields=['stage', 'updated_at'])
    record_event(run, 'index_started', '开始构建原文向量检索', token=token)
    try:
        from .retrieval import index_revision
        index_revision(run.revision, lambda: check_run(run, token))
        run.index_state = 'ready'
        record_event(run, 'index_completed', '原文检索索引已就绪', 'success', token=token)
    except AnalysisError:
        raise
    except Exception:
        logger.warning('Book index unavailable; keeping graph and digests: run=%s', run.pk, exc_info=True)
        run.index_state = 'failed'
        record_event(run, 'index_failed', '向量检索失败，导读和图谱不受影响', 'warning', {'reason': '跨章节复核和问答将自动退回关键词及图谱证据。'}, token=token)
    if run.revision.mode == 'story':
        from django.db.models import Count
        from .models import EntityFact
        from .profiles import update_profile
        from .retrieval import retrieve
        covered = ChapterResult.objects.filter(revision=run.revision).select_related('chapter').order_by('chapter__ordinal')
        cutoff = covered.last().chapter if covered.exists() else None
        if cutoff and covered.count() > 1:
            run.stage = '复核跨章节人物与线索'
            run.save(update_fields=['stage', 'updated_at'])
            affected_ids = EntityFact.objects.filter(node__revision=run.revision, evidence__chapter_id__in=run.chapter_ids).values('node_id')
            targets = GraphNode.objects.filter(revision=run.revision, id__in=affected_ids, kind__in=['person', 'clue']).annotate(appearance_count=Count('structured_facts__evidence__chapter', distinct=True)).filter(Q(kind='clue') | Q(appearance_count__gt=1))
            for node in targets:
                check_run(run, token)
                try:
                    sources, method = retrieve(run.revision, f'{node.name}的身份、行为、动机和相关线索', node_id=node.canonical_id, through_chapter=cutoff.ordinal)
                    record_event(run, 'cross_chapter_retrieved', '正在复核跨章节证据', details={'phase': 'cross_chapter', 'method': method, 'sources': len(sources)}, token=token)
                    if sources:
                        with ai_scope(phase='cross_chapter'):
                            ready = update_profile(node, cutoff, lambda: check_run(run, token), extra_sources=sources)
                        if ready is False:
                            record_event(run, 'cross_chapter_pending', '跨章节复核待后续分析继续', 'warning', {'phase': 'cross_chapter'}, token=token)
                except AnalysisError as exc:
                    check_run(run, token)
                    logger.warning('Cross-chapter synthesis skipped: node=%s reason=%s', node.pk, exc)
                    record_event(run, 'cross_chapter_pending', '部分跨章节关联暂未完成', 'warning', {'phase': 'cross_chapter'}, token=token)
                except Exception:
                    logger.warning('Cross-chapter synthesis unavailable: node=%s', node.pk, exc_info=True)
                    record_event(run, 'cross_chapter_pending', '部分跨章节关联暂未完成', 'warning', {'phase': 'cross_chapter'}, token=token)
    run.save(update_fields=['index_state', 'stage', 'updated_at'])


def execute_claim(claim):
    run, token = claim
    stop = threading.Event()

    def heartbeat():
        while not stop.wait(15):
            close_old_connections()
            try:
                WorkerLease.objects.filter(pk='book-analysis', owner=token).update(expires_at=timezone.now() + timedelta(seconds=LEASE_SECONDS))
            except Exception:
                logger.exception('Book task heartbeat failed: run=%s', run.pk)
            finally:
                close_old_connections()

    pulse = threading.Thread(target=heartbeat, daemon=True, name='book-analysis-heartbeat')
    pulse.start()
    try:
        with observe_ai(lambda kind, title, level, details: record_event(run, kind, title, level, details, token=token), check_cancel=lambda: check_model_run(run, token)):
            process_run(run, token)
        check_run(run, token)
        run.state, run.stage = 'completed', '处理完成'
    except AnalysisError as exc:
        run.state = 'cancelled' if exc.status == 499 else 'failed'
        run.error = str(exc)[:500]
        run.stage = '已停止' if exc.status == 499 else '处理失败，可断点重试'
    except AIAuthenticationError as exc:
        # Use the configuration captured by the failed request, not settings
        # reloaded after the user may already have switched models.
        role = {'simple': '简易模型', 'default': '主对话模型'}.get(exc.model_role, '对话模型')
        model = f'{exc.provider_name} / {exc.model_name}' if exc.model_name else exc.provider_name
        run.state = 'failed'
        run.stage = '处理失败，可断点重试'
        run.error = f'{role}「{model[:180]}」认证失败，请检查该提供商的 API Key、接口地址及模型权限，保存配置后点击「断点续跑」。'
    except Exception as exc:
        logger.exception('Book analysis failed: run=%s', run.pk)
        run.state, run.error = 'failed', '分析服务调用失败，请检查模型配置后断点重试'
        run.stage = '处理失败，可断点重试'
        if isinstance(exc, TimeoutError) or type(exc).__name__ in ('APITimeoutError', 'ReadTimeout', 'ConnectTimeout'):
            run.error = '模型请求超时或达到 120 秒硬时限，已取消连接；保留完成成果，可断点续跑。'
        elif type(exc).__name__ in ('AIOutputTruncated', 'AIStreamIncomplete'):
            run.error = '模型输出超过预算或连接提前结束，未发布本次结果；保留完成成果，可断点续跑。'
        elif type(exc).__name__ == 'AIBoundedRequestError':
            run.error = str(exc)
    finally:
        stop.set()
        pulse.join(timeout=2)
        with transaction.atomic():
            lease = WorkerLease.objects.select_for_update().filter(pk='book-analysis', owner=token).first()
            if lease:
                try:
                    run.save(update_fields=['state', 'stage', 'error', 'index_state', 'updated_at'])
                    if lease.expires_at and lease.expires_at > timezone.now():
                        record_event(run, 'run_' + run.state, {'completed': '任务处理完成', 'cancelled': '任务已停止'}.get(run.state, '任务处理失败，可断点续跑'), 'success' if run.state == 'completed' else 'warning' if run.state == 'cancelled' else 'error', {'reason': run.error}, token=token)
                finally:
                    WorkerLease.objects.filter(pk='book-analysis', owner=token).update(owner='', run_id='', expires_at=None)
        close_old_connections()
