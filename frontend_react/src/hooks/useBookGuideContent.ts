import {useCallback, useEffect, useRef, useState} from 'react';
import {getBookChapters, getChapterGuide, readingError} from '../api/bookAnalysis';
import {getBooks, restoreBook, type BookItem} from '../api/anthology';
import {useToast} from '../components/common/ToastProvider';
import type {BookAnalysisStatus, ChapterGuide, PagedChapters, SourceEvidence} from '../types/bookAnalysis';

/** Owns abortable chapter requests and original-reader restoration/location. */
export function useBookGuideContent(bookId: string, status: BookAnalysisStatus | null, chapterId: string, chapterPage: number, refreshKey: string, versionId: string) {
    const toast = useToast();
    const [chapters, setChapters] = useState<PagedChapters>({items: [], total: 0, page: 1, limit: 50});
    const [guide, setGuide] = useState<ChapterGuide | null>(null);
    const [guideError, setGuideError] = useState('');
    const [contentLoading, setContentLoading] = useState(false);
    const [reader, setReader] = useState<{book: BookItem; source?: SourceEvidence} | null>(null);
    const scope = useRef(0);
    useEffect(() => {
        setReader(null);
        return () => {++scope.current;};
    }, [bookId]);
    const chapterCount = status?.inspection.chapterCount;
    const revisionId = status?.revisionId;
    useEffect(() => {
        if (!chapterCount) {setChapters({items: [], total: 0, page: 1, limit: 50}); return;}
        const controller = new AbortController();
        getBookChapters(bookId, chapterPage, controller.signal, versionId)
            .then(data => {if (!controller.signal.aborted) setChapters(data);})
            .catch(err => {if (!controller.signal.aborted) setGuideError(readingError(err));});
        return () => controller.abort();
    }, [bookId, chapterPage, chapterCount, revisionId, versionId, refreshKey]);
    useEffect(() => {
        setGuide(null); setGuideError(''); setContentLoading(false);
        if (!chapterId) return;
        const controller = new AbortController();
        setContentLoading(true);
        getChapterGuide(bookId, chapterId, controller.signal, versionId)
            .then(data => {if (!controller.signal.aborted) setGuide(data);})
            .catch(err => {if (!controller.signal.aborted) setGuideError(readingError(err));})
            .finally(() => {if (!controller.signal.aborted) setContentLoading(false);});
        return () => controller.abort();
    }, [bookId, chapterId, revisionId, versionId, refreshKey]);
    const onRead = useCallback(async (source?: SourceEvidence) => {
        const epoch = scope.current;
        if (!status) return;
        if (source && status.stale) {toast.info('旧版本来源与当前正文或章节定位不匹配，请切回最新版本查看原文。'); return;}
        try {
            if (status.book.localState === 'cloud_only') {toast.info('正在恢复原文…'); await restoreBook(bookId);}
            const books = await getBooks(status.book.collId);
            const book = books.find(item => item.bookId === bookId);
            if (!book) throw new Error('未找到图书正文');
            if (scope.current === epoch) {
                if (book.format === 'mobi') window.open(`/api/anthology/book/${encodeURIComponent(bookId)}/file`, '_blank');
                else setReader({book, source});
            }
        } catch (err) {if (scope.current === epoch) toast.error(readingError(err));}
    }, [bookId, status, toast]);
    return {chapters, guide, guideError, contentLoading, reader, onRead, closeReader: () => setReader(null)};
}
