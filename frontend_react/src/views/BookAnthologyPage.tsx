import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft, Bookmark, BookmarkCheck, BookOpen, ChevronLeft, ChevronRight, ChevronUp, CloudDownload, Download, Library, List, Loader2, MoreHorizontal, Plus, Trash2, Upload, X} from 'lucide-react';
import {BookItem, deleteBook, getBookProgress, getBooks, releaseBook, restoreBook, saveBookProgress, uploadBook} from '../api/anthology';
import {useToast} from '../components/common/ToastProvider';
import {getAuthToken} from '../utils/authStorage';
import ConfirmationModal from '../components/common/ConfirmationModal';

interface Props { collId?: string; onNavigate: (view: string, params?: any) => void; }

const formatLabel: Record<string, string> = {pdf: 'PDF', txt: 'TXT', epub: 'EPUB', mobi: 'MOBI'};

/** TXT 常见来源为 UTF-8 或 Windows/GBK 编码；优先拒绝无效 UTF-8，再回退到 GB18030。 */
function decodePlainText(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch {
        // GB18030 is the standards-based superset supported by modern Chromium and covers GBK/GB2312 books.
        return new TextDecoder('gb18030').decode(bytes);
    }
}

function FallbackCover({book}: {book: BookItem}) {
    return <div className="h-full w-full bg-gradient-to-br from-orange-600 via-orange-500 to-amber-400 p-4 text-white shadow-inner">
        <div className="flex h-full flex-col border border-white/30 p-3"><Library className="h-5 w-5 text-white/75"/><div className="mt-auto font-serif text-base font-bold leading-tight line-clamp-3">{book.title}</div><div className="mt-2 text-[10px] uppercase tracking-[0.24em] text-white/75">{formatLabel[book.format]}</div></div>
    </div>;
}

function PdfCanvas({document, pageNumber}: {document: any; pageNumber: number}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        let cancelled = false;
        let renderTask: any = null;
        const render = async () => {
            if (!document || !canvasRef.current) return;
            const page = await document.getPage(pageNumber);
            const viewport = page.getViewport({scale: 1.65});
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (!context || cancelled) return;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            renderTask = page.render({canvasContext: context, viewport});
            try {
                await renderTask.promise;
            } catch (error: any) {
                if (error?.name !== 'RenderingCancelledException') throw error;
            }
        };
        void render();
        return () => { cancelled = true; renderTask?.cancel?.(); };
    }, [document, pageNumber]);
    return <canvas ref={canvasRef} className="max-h-full w-auto max-w-full bg-white shadow-sm"/>;
}

async function fetchBookBlob(bookId: string) {
    const token = getAuthToken();
    const response = await fetch(`/api/anthology/book/${bookId}/file`, {
        headers: token ? {Authorization: `Token ${token}`} : undefined,
    });
    if (!response.ok) throw new Error('图书下载失败');
    return response.blob();
}

function Reader({book, onClose, onProgressSaved}: {book: BookItem; onClose: () => void; onProgressSaved: (progress: number) => void}) {
    const toast = useToast();
    const [text, setText] = useState(''); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [pdfDocument, setPdfDocument] = useState<any>(null); const [pdfPage, setPdfPage] = useState(1); const [pdfPageCount, setPdfPageCount] = useState(0); const [currentPage, setCurrentPage] = useState(1); const [totalPages, setTotalPages] = useState(0); const [toc, setToc] = useState<Array<{label: string; href: string}>>([]); const [panel, setPanel] = useState<'toc' | 'bookmarks' | null>(null); const [bookmarks, setBookmarks] = useState<Array<{page: number; label: string; location?: string}>>([]); const [epubLocation, setEpubLocation] = useState(''); const [pageMotion, setPageMotion] = useState<'prev' | 'next' | null>(null); const [controlsHovered, setControlsHovered] = useState(false); const [pageDrag, setPageDrag] = useState<{direction: 'prev' | 'next'; progress: number; settling: boolean} | null>(null);
    const epubRef = useRef<HTMLDivElement>(null); const textRef = useRef<HTMLDivElement>(null); const renditionRef = useRef<any>(null); const epubBookRef = useRef<any>(null); const pdfDocumentRef = useRef<any>(null); const textRestoreLocationRef = useRef<number | null>(null); const dragStartRef = useRef<{x: number; y: number; time: number} | null>(null); const dragProgressRef = useRef(0); const dragDirectionRef = useRef<'prev' | 'next' | null>(null); const lastTurnAt = useRef(0); const wheelDeltaRef = useRef(0); const wheelResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); const controlsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingProgressRef = useRef<{location: string; progress: number} | null>(null);
    const bookmarkStorageKey = `o-doc:bookmarks:${book.bookId}`;
    const controlsVisible = controlsHovered;
    const revealControls = () => { if (controlsCloseTimerRef.current) clearTimeout(controlsCloseTimerRef.current); setControlsHovered(true); };
    const deferControlsClose = () => { if (controlsCloseTimerRef.current) clearTimeout(controlsCloseTimerRef.current); controlsCloseTimerRef.current = setTimeout(() => setControlsHovered(false), 700); };
    useEffect(() => { try { setBookmarks(JSON.parse(localStorage.getItem(bookmarkStorageKey) || '[]')); } catch { setBookmarks([]); } }, [bookmarkStorageKey]);
    const persistProgress = (payload: {location: string; progress: number}) => {
        void saveBookProgress(book.bookId, payload)
            .then(() => onProgressSaved(payload.progress))
            .catch(() => {/* A later page turn can retry; avoid interrupting reading for a transient failure. */});
    };
    const savePendingProgress = () => {
        if (!pendingProgressRef.current) return;
        const payload = pendingProgressRef.current;
        pendingProgressRef.current = null;
        persistProgress(payload);
    };
    useEffect(() => {
        let cancelled = false;
        const open = async () => {
            try {
                setLoadError('');
                const [progress, fileBlob] = await Promise.all([getBookProgress(book.bookId), fetchBookBlob(book.bookId)]);
                if (cancelled) return;
                if (book.format === 'txt') {
                    const content = decodePlainText(await fileBlob.arrayBuffer());
                    const savedLocation = Number(progress.location);
                    textRestoreLocationRef.current = progress.location !== '' && Number.isFinite(savedLocation) ? Math.max(0, savedLocation) : null;
                    if (!cancelled) setText(content);
                } else if (book.format === 'pdf') {
                    const pdfjs = await import('pdfjs-dist');
                    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
                    const document = await pdfjs.getDocument({data: new Uint8Array(await fileBlob.arrayBuffer())}).promise;
                    if (cancelled) { document.cleanup?.(); return; }
                    const savedPage = Number.parseInt(progress.location, 10);
                    const restoredPage = Number.isFinite(savedPage) ? Math.max(1, Math.min(document.numPages, savedPage)) : 1;
                    const spreadStart = restoredPage % 2 === 0 ? restoredPage - 1 : restoredPage;
                    pdfDocumentRef.current = document;
                    setPdfDocument(document); setPdfPage(spreadStart); setPdfPageCount(document.numPages); setCurrentPage(spreadStart); setTotalPages(document.numPages);
                } else if (book.format === 'epub' && epubRef.current) {
                    // ArrayBuffer avoids URL / MIME inconsistencies when opening archived EPUB files.
                    const {default: ePub} = await import('epubjs'); const epub = ePub(await fileBlob.arrayBuffer()); epubBookRef.current = epub;
                    await epub.opened;
                    if (cancelled || !epubRef.current) return;
                    const rendition = epub.renderTo(epubRef.current, {width: '100%', height: '100%', manager: 'default', flow: 'paginated', spread: 'always'}); renditionRef.current = rendition;
                    rendition.on('relocated', (where: any) => { const pct = Math.round((where.start.percentage || 0) * 100); const location = where.start.cfi || ''; setEpubLocation(location); setCurrentPage(Math.max(1, (epub.locations.locationFromCfi?.(location) ?? 0) + 1)); persistProgress({location, progress: pct}); });
                    let lastEpubTrackpadTurn = 0;
                    rendition.on('rendered', (_section: any, view: any) => {
                        view?.document?.addEventListener?.('wheel', (event: WheelEvent) => {
                            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
                            if (Math.abs(delta) > 24 && Date.now() - lastEpubTrackpadTurn > 380) {
                                event.preventDefault();
                                lastEpubTrackpadTurn = Date.now();
                                setPageMotion(delta > 0 ? 'next' : 'prev');
                                window.setTimeout(() => setPageMotion(null), 280);
                                void rendition[delta > 0 ? 'next' : 'prev']?.();
                            }
                        }, {passive: false});
                    });
                    await Promise.race([rendition.display(progress.location || undefined), new Promise((_, reject) => window.setTimeout(() => reject(new Error('EPUB_RENDER_TIMEOUT')), 30000))]);
                    const flattenToc = (items: any[]): Array<{label: string; href: string}> => items.flatMap(item => [{label: item.label || '未命名章节', href: item.href}, ...flattenToc(item.subitems || [])]);
                    setToc(flattenToc(epub.navigation?.toc || []));
                    void epub.locations.generate(1600).then(() => { if (!cancelled) setTotalPages(Math.max(1, epub.locations.total || 0)); });
                }
            } catch (error) {
                if (!cancelled) {
                    setLoadError(error instanceof Error && error.message === 'EPUB_RENDER_TIMEOUT' ? '这本 EPUB 解析超时，请确认文件完整后重新导入。' : '无法打开图书，请确认文件完整后重试。');
                    toast.error('无法打开图书');
                }
            } finally { if (!cancelled) setLoading(false); }
        };
        open(); return () => {
            cancelled = true;
            renditionRef.current?.destroy?.();
            epubBookRef.current?.destroy?.();
            void pdfDocumentRef.current?.destroy?.();
            if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
            if (controlsCloseTimerRef.current) clearTimeout(controlsCloseTimerRef.current);
            savePendingProgress();
        };
    }, [book, toast]);
    const saveTxt = (event: React.UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        const percent = target.scrollWidth <= target.clientWidth ? 100 : Math.round(target.scrollLeft / (target.scrollWidth - target.clientWidth) * 100);
        pendingProgressRef.current = {location: String(target.scrollLeft), progress: percent};
        if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
        progressTimerRef.current = setTimeout(savePendingProgress, 1000);
        setCurrentPage(Math.max(1, Math.round(target.scrollLeft / Math.max(1, target.clientWidth)) + 1));
    };
    const downloadBook = async () => {
        try {
            const blob = await fetchBookBlob(book.bookId);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url; anchor.download = book.title; anchor.click();
            URL.revokeObjectURL(url);
        } catch { toast.error('图书下载失败'); }
    };
    const commitPdfPage = (page: number) => {
        const spreadStart = page % 2 === 0 ? page - 1 : page;
        const next = Math.max(1, Math.min(Math.max(1, pdfPageCount - (pdfPageCount > 1 ? 1 : 0)), spreadStart));
        setPdfPage(next); setCurrentPage(next);
        persistProgress({location: String(next), progress: Math.round(((next - 1) / Math.max(1, pdfPageCount - 1)) * 100)});
    };
    const turnPage = (direction: 'prev' | 'next', withMotion = true) => {
        if (Date.now() - lastTurnAt.current < 350) return;
        lastTurnAt.current = Date.now();
        if (withMotion) { setPageMotion(direction); window.setTimeout(() => setPageMotion(null), 230); }
        if (book.format === 'epub') void renditionRef.current?.[direction]?.();
        if (book.format === 'pdf') commitPdfPage(pdfPage + (direction === 'next' ? 2 : -2));
        if (book.format === 'txt' && textRef.current) textRef.current.scrollBy({left: textRef.current.clientWidth * (direction === 'next' ? 1 : -1), behavior: 'smooth'});
    };
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft') turnPage('prev');
            if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); turnPage('next'); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [book.format, pdfPageCount]);
    const onPagePointerDown = (event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || loading || loadError || (event.target instanceof Element && event.target.closest('button, input, aside'))) return;
        dragStartRef.current = {x: event.clientX, y: event.clientY, time: Date.now()}; dragProgressRef.current = 0; dragDirectionRef.current = null;
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onPagePointerMove = (event: React.PointerEvent<HTMLElement>) => {
        const start = dragStartRef.current;
        if (!start) return;
        const distance = event.clientX - start.x;
        const verticalDistance = event.clientY - start.y;
        if (!dragDirectionRef.current && Math.abs(verticalDistance) > Math.abs(distance) + 12) { dragStartRef.current = null; return; }
        if (Math.abs(distance) < 8) return;
        const direction = distance < 0 ? 'next' : 'prev';
        const progress = Math.min(.92, Math.abs(distance) / Math.max(1, event.currentTarget.clientWidth));
        dragDirectionRef.current = direction; dragProgressRef.current = progress;
        setPageDrag({direction, progress, settling: false});
        event.preventDefault();
    };
    const finishPageDrag = (event: React.PointerEvent<HTMLElement>) => {
        const start = dragStartRef.current;
        const direction = dragDirectionRef.current;
        const progress = dragProgressRef.current;
        dragStartRef.current = null; dragDirectionRef.current = null; dragProgressRef.current = 0;
        if (!start || !direction) { setPageDrag(null); return; }
        const velocity = Math.abs(event.clientX - start.x) / Math.max(1, Date.now() - start.time);
        const hasPageInDirection = direction === 'prev'
            ? currentPage > 1
            : book.format === 'pdf' ? pdfPage + 1 < pdfPageCount : currentPage < totalPages;
        const shouldTurn = hasPageInDirection && (progress >= .28 || (progress >= .14 && velocity > .7));
        setPageDrag({direction, progress: shouldTurn ? 1 : 0, settling: true});
        window.setTimeout(() => { if (shouldTurn) turnPage(direction, false); setPageDrag(null); }, shouldTurn ? 230 : 190);
    };
    const onWheel = (event: React.WheelEvent) => {
        if (event.ctrlKey) return;
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        wheelDeltaRef.current += delta;
        if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
        wheelResetTimerRef.current = setTimeout(() => { wheelDeltaRef.current = 0; }, 120);
        if (Math.abs(wheelDeltaRef.current) >= 42) {
            event.preventDefault();
            const direction = wheelDeltaRef.current > 0 ? 'next' : 'prev';
            wheelDeltaRef.current = 0;
            turnPage(direction);
        }
    };
    const jumpToPage = (page: number) => {
        const target = Math.max(1, Math.min(totalPages || 1, page));
        if (book.format === 'pdf') commitPdfPage(target);
        if (book.format === 'epub') { const location = epubBookRef.current?.locations?.cfiFromLocation?.(target - 1); if (location) void renditionRef.current?.display?.(location); }
        if (book.format === 'txt' && textRef.current) { textRef.current.scrollTo({left: (target - 1) * textRef.current.clientWidth, behavior: 'smooth'}); setCurrentPage(target); }
    };
    const toggleBookmark = () => {
        const exists = bookmarks.some(item => item.page === currentPage);
        const next = exists ? bookmarks.filter(item => item.page !== currentPage) : [...bookmarks, {page: currentPage, location: epubLocation, label: `第 ${currentPage} 页`}];
        setBookmarks(next); localStorage.setItem(bookmarkStorageKey, JSON.stringify(next));
    };
    useEffect(() => {
        if (book.format !== 'txt' || !text) return;
        const timer = window.setTimeout(() => {
            if (!textRef.current) return;
            const reader = textRef.current;
            const restoredLocation = textRestoreLocationRef.current;
            if (restoredLocation !== null) {
                reader.scrollLeft = Math.min(restoredLocation, Math.max(0, reader.scrollWidth - reader.clientWidth));
                textRestoreLocationRef.current = null;
            }
            const pages = Math.max(1, Math.ceil(reader.scrollWidth / reader.clientWidth));
            setTotalPages(pages);
            setCurrentPage(Math.max(1, Math.round(reader.scrollLeft / Math.max(1, reader.clientWidth)) + 1));
        }, 80);
        return () => window.clearTimeout(timer);
    }, [book.format, text]);
    // 阅读器只覆盖内容区，保留全局导航，方便随时搜索、回到其他文集或打开个人操作。
    const hasBookmark = bookmarks.some(item => item.page === currentPage);
    const dragEdge = pageDrag?.direction === 'next' ? 'right' : 'left';
    const dragClip = pageDrag ? (pageDrag.direction === 'next'
        ? `polygon(${100 - pageDrag.progress * 100}% 0, 100% 0, 100% 100%, ${100 - pageDrag.progress * 100}% 100%)`
        : `polygon(0 0, ${pageDrag.progress * 100}% 0, ${pageDrag.progress * 100}% 100%, 0 100%)`) : undefined;
    const dragRotation = pageDrag ? (pageDrag.direction === 'next' ? -1 : 1) * (1 - pageDrag.progress) * 54 : 0;
    return <div className="fixed inset-x-0 bottom-0 top-16 z-[70] flex max-w-[100vw] flex-col overflow-hidden bg-slate-100 text-slate-800">
        <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur sm:px-5"><div className="flex items-center gap-1"><button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"><ArrowLeft className="h-4 w-4"/>返回书架</button><button onClick={() => setPanel(panel === 'toc' ? null : 'toc')} className={`rounded-md p-2 transition ${panel === 'toc' ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:bg-slate-100'}`} title="目录"><List className="h-4 w-4"/></button><button onClick={() => setPanel(panel === 'bookmarks' ? null : 'bookmarks')} className={`rounded-md p-2 transition ${panel === 'bookmarks' ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:bg-slate-100'}`} title="书签列表"><Bookmark className="h-4 w-4"/></button></div><span className="absolute left-1/2 max-w-[42vw] -translate-x-1/2 truncate text-sm font-semibold tracking-wide text-slate-700">{book.title}</span><div className="flex items-center gap-1"><button onClick={toggleBookmark} className={`rounded-md p-2 transition ${hasBookmark ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:bg-slate-100'}`} title="添加书签">{hasBookmark ? <BookmarkCheck className="h-4 w-4"/> : <Bookmark className="h-4 w-4"/>}</button><button onClick={downloadBook} className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-orange-600" title="下载"><Download className="h-4 w-4"/></button></div></header>
        <main onWheelCapture={onWheel} onPointerDown={onPagePointerDown} onPointerMove={onPagePointerMove} onPointerUp={finishPageDrag} onPointerCancel={finishPageDrag} className="relative min-h-0 flex-1 overflow-hidden bg-slate-100 p-3 touch-pan-y select-none sm:p-6">{loading && <div className="absolute inset-0 z-10 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500"/></div>}
            {panel && <aside className="absolute left-3 top-3 z-30 flex max-h-[calc(100%-1.5rem)] w-80 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur sm:left-6 sm:top-6"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="text-sm font-bold text-slate-800">{panel === 'toc' ? '目录' : '书签'}</p><button onClick={() => setPanel(null)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button></div><div className="min-h-0 overflow-y-auto p-2">{panel === 'toc' ? (toc.length ? toc.map((item, index) => <button key={`${item.href}-${index}`} onClick={() => { void renditionRef.current?.display?.(item.href); setPanel(null); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-orange-50 hover:text-orange-700"><span className="w-6 text-right font-mono text-[10px] text-slate-400">{index + 1}</span><span className="line-clamp-2">{item.label}</span></button>) : <p className="px-3 py-8 text-center text-xs leading-5 text-slate-400">此文件没有可读取的目录。</p>) : (bookmarks.length ? bookmarks.sort((a, b) => a.page - b.page).map(item => <button key={item.page} onClick={() => { if (book.format === 'epub' && item.location) void renditionRef.current?.display?.(item.location); else jumpToPage(item.page); setPanel(null); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-orange-50 hover:text-orange-700"><span>{item.label}</span><span className="font-mono text-xs text-slate-400">{item.page}</span></button>) : <p className="px-4 py-10 text-center text-xs leading-5 text-slate-400">还没有书签。<br/>可点击右上角书签图标添加。</p>)}</div></aside>}
            {loadError && <div className="absolute inset-0 z-20 flex items-center justify-center p-6"><div className="max-w-sm rounded-xl border border-orange-100 bg-[#fdf8eb] p-5 text-center shadow-lg"><p className="font-semibold text-stone-700">图书未能打开</p><p className="mt-2 text-sm leading-6 text-stone-500">{loadError}</p><button onClick={onClose} className="mt-4 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-600">返回书架</button></div></div>}
            {book.format === 'pdf' && pdfDocument && <div className={`mx-auto flex h-full max-w-7xl items-center justify-center gap-px overflow-hidden rounded-sm bg-slate-300 p-px shadow-[0_10px_30px_rgba(15,23,42,.18)] ${pageMotion ? `reader-page-turn-${pageMotion}` : ''}`}><div className="flex h-full min-w-0 flex-1 items-center justify-center bg-white"><PdfCanvas document={pdfDocument} pageNumber={pdfPage}/></div>{pdfPage + 1 <= pdfPageCount && <div className="hidden h-full min-w-0 flex-1 items-center justify-center bg-white md:flex"><PdfCanvas document={pdfDocument} pageNumber={pdfPage + 1}/></div>}</div>}
            {book.format === 'txt' && <div ref={textRef} onScroll={saveTxt} className={`mx-auto h-full max-w-7xl snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-sm bg-white shadow-[0_10px_30px_rgba(15,23,42,.18)] [scrollbar-width:none] ${pageMotion ? `reader-page-turn-${pageMotion}` : ''}`}><article className="h-full min-w-full snap-start columns-1 [column-fill:auto] gap-0 break-words px-8 py-10 font-['FZPingXianYaSong'] text-[17px] leading-[2.05] tracking-[.02em] whitespace-pre-wrap text-slate-700 sm:columns-2 sm:gap-px sm:bg-slate-300 sm:p-1 sm:text-[18px]">{text}</article></div>}
            {book.format === 'epub' && (
                <div ref={epubRef} className={`mx-auto h-full w-full max-w-7xl overflow-hidden rounded-sm bg-white shadow-[0_10px_30px_rgba(15,23,42,.18)] ${pageMotion ? `reader-page-turn-${pageMotion}` : ''}`}/>
            )}
            {pageDrag && <div aria-hidden="true" className="pointer-events-none absolute inset-3 z-10 overflow-hidden rounded-sm sm:inset-6" style={{perspective: '1800px'}}><div className="absolute inset-0" style={{clipPath: dragClip, background: pageDrag.direction === 'next' ? 'linear-gradient(270deg, rgba(79,54,29,.25), rgba(255,253,245,.95) 20%, rgba(247,238,219,.9) 57%, rgba(93,66,36,.22))' : 'linear-gradient(90deg, rgba(79,54,29,.25), rgba(255,253,245,.95) 20%, rgba(247,238,219,.9) 57%, rgba(93,66,36,.22))', boxShadow: `${pageDrag.direction === 'next' ? '-' : ''}18px 0 30px rgba(67,43,22,.28)`, transformOrigin: `${dragEdge} center`, transform: `rotateY(${dragRotation}deg)`, transition: pageDrag.settling ? 'clip-path 230ms cubic-bezier(.2,.8,.2,1), transform 230ms cubic-bezier(.2,.8,.2,1)' : 'none'}}><div className="absolute inset-0 opacity-45" style={{backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(120,87,48,.055) 4px)'}}/></div></div>}
            {!loading && !loadError && <><button onClick={() => turnPage('prev')} className="absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-slate-200 bg-white/90 p-2 text-slate-400 shadow-sm transition hover:border-orange-200 hover:text-orange-600 lg:block" aria-label="上一页"><ChevronLeft className="h-5 w-5"/></button><button onClick={() => turnPage('next')} className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-slate-200 bg-white/90 p-2 text-slate-400 shadow-sm transition hover:border-orange-200 hover:text-orange-600 lg:block" aria-label="下一页"><ChevronRight className="h-5 w-5"/></button></>}
            {!loading && !loadError && <div onMouseEnter={revealControls} onMouseLeave={deferControlsClose} onFocus={revealControls} onBlur={deferControlsClose} className={`pointer-events-auto absolute bottom-0 left-1/2 z-20 -translate-x-1/2 overflow-hidden rounded-t-xl border border-b-0 border-slate-200 bg-white/95 shadow-[0_-6px_18px_rgba(15,23,42,.1)] backdrop-blur transition-[width,height,border-radius] duration-[300ms] ease-[cubic-bezier(.22,.8,.24,1)] ${controlsVisible ? 'h-14 w-[calc(100%-2rem)] max-w-3xl' : 'h-9 w-52 rounded-t-lg'}`}><button onClick={revealControls} className={`absolute inset-0 z-10 inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-wide text-slate-500 transition-all duration-150 ${controlsVisible ? 'pointer-events-none -translate-y-1 opacity-0' : 'opacity-100 delay-100 hover:text-orange-600'}`} aria-expanded={controlsVisible}><span className="h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,.7)] animate-pulse"/>阅读控制<ChevronUp className="h-3.5 w-3.5"/></button><div className={`flex h-full items-center gap-2 px-3 transition-all duration-200 ${controlsVisible ? 'translate-y-0 opacity-100 delay-100' : 'translate-y-2 opacity-0'}`}><button onClick={() => turnPage('prev')} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700" aria-label="上一页"><ChevronLeft className="h-4 w-4"/>上一页</button><div className="relative min-w-0 flex-1"><input aria-label="快速跳转页码" type="range" min="1" max={Math.max(1, totalPages)} value={Math.min(currentPage, Math.max(1, totalPages))} onChange={event => jumpToPage(Number(event.target.value))} style={{background: `linear-gradient(to right, #f97316 0%, #f97316 ${((Math.min(currentPage, Math.max(1, totalPages)) - 1) / Math.max(1, (totalPages || 1) - 1)) * 100}%, #e2e8f0 ${((Math.min(currentPage, Math.max(1, totalPages)) - 1) / Math.max(1, (totalPages || 1) - 1)) * 100}%, #e2e8f0 100%)`}} className="h-1.5 w-full cursor-pointer appearance-none rounded-sm [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-sm [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:shadow-sm"/></div><span className="min-w-16 text-center text-xs font-medium tabular-nums text-slate-500">{currentPage} / {totalPages || '—'}</span><button onClick={() => turnPage('next')} className="inline-flex h-8 items-center gap-1 rounded-md bg-orange-500 px-2.5 text-xs font-medium text-white shadow-sm transition hover:bg-orange-600" aria-label="下一页">下一页<ChevronRight className="h-4 w-4"/></button></div></div>}
        </main>
    </div>;
}

export default function BookAnthologyPage({collId, onNavigate}: Props) {
    const toast = useToast(); const inputRef = useRef<HTMLInputElement>(null);
    const [books, setBooks] = useState<BookItem[]>([]); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<BookItem | null>(null); const [reading, setReading] = useState<BookItem | null>(null); const [releaseCandidate, setReleaseCandidate] = useState<BookItem | null>(null); const [deleteCandidate, setDeleteCandidate] = useState<BookItem | null>(null); const [isActionLoading, setIsActionLoading] = useState(false);
    const reload = async () => { if (!collId) return; setLoading(true); try { setBooks(await getBooks(collId)); } catch { toast.error('获取书架失败'); } finally { setLoading(false); } };
    useEffect(() => { reload(); }, [collId]);
    const importBook = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !collId) return; const ext = file.name.split('.').pop()?.toLowerCase(); if (!['pdf','txt','epub','mobi'].includes(ext || '')) { toast.error('仅支持 PDF、TXT、EPUB、MOBI'); return; } const form = new FormData(); form.append('file', file); try { await uploadBook(collId, form); toast.success('图书已导入'); reload(); } catch { toast.error('图书导入失败'); } finally { event.target.value = ''; } };
    const ensureLocal = async (book: BookItem, read = false) => { try { if (book.localState === 'cloud_only') { toast.info('正在从云端恢复图书…'); await restoreBook(book.bookId); await reload(); } if (read && book.format !== 'mobi') setReading({...book, localState: 'local'}); else if (book.format === 'mobi') window.open(`/api/anthology/book/${book.bookId}/file`, '_blank'); } catch { toast.error('云端恢复失败，请检查 WebDAV'); } };
    const release = async (book: BookItem) => { setIsActionLoading(true); try { await releaseBook(book.bookId); toast.success('已释放本地副本'); setReleaseCandidate(null); setSelected(null); reload(); } catch { toast.error('释放失败，请稍后重试'); } finally { setIsActionLoading(false); } };
    const remove = async (book: BookItem) => { setIsActionLoading(true); try { await deleteBook(book.bookId); toast.success('图书已删除'); setDeleteCandidate(null); setSelected(null); reload(); } catch { toast.error('图书删除失败'); } finally { setIsActionLoading(false); } };
    return <><main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_10%_0%,#fff4e6,transparent_32%),#f8fafc] px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><button onClick={() => onNavigate('home')} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-orange-600"><ArrowLeft className="h-3.5 w-3.5"/>全部文集</button><h1 className="font-serif text-2xl font-bold tracking-tight text-slate-900">我的书架</h1><p className="mt-1 text-sm text-slate-500">在这里收藏、阅读，或从云端按需取回你的书。</p></div><div><input ref={inputRef} type="file" accept=".pdf,.txt,.epub,.mobi" onChange={importBook} className="hidden"/><button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition hover:bg-orange-600"><Upload className="h-4 w-4"/>导入图书</button></div></div>
        {loading ? <div className="py-24 text-center text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin"/></div> : books.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white shadow-sm"><button onClick={() => inputRef.current?.click()} className="flex min-h-44 w-full items-center justify-center gap-4 rounded-xl px-6 text-left transition hover:bg-orange-50/40"><div className="flex h-14 w-11 items-center justify-center rounded-md bg-orange-50 text-orange-500 ring-1 ring-orange-100"><BookOpen className="h-5 w-5"/></div><div><p className="text-base font-bold text-slate-700">暂无图书，点击导入</p><p className="mt-1 text-xs text-slate-400">支持 PDF、TXT、EPUB 和 MOBI，单本最大 500 MB</p></div><Plus className="ml-3 h-5 w-5 text-slate-300"/></button></div> : <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,10.5rem))] gap-x-5 gap-y-7">{books.map(book => <div key={book.bookId} className="group relative"><button onClick={() => ensureLocal(book, true)} className="block w-full text-left"><div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-orange-100 shadow-[5px_7px_0_rgba(148,91,43,.12)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[8px_12px_20px_rgba(148,91,43,.2)]"><FallbackCover book={book}/>{book.coverUrl ? <img src={book.coverUrl} onError={(event) => {event.currentTarget.style.display='none';}} alt="" className="absolute inset-0 h-full w-full object-cover"/> : null}<div className="absolute inset-x-0 bottom-0 h-1.5 bg-slate-950/30" aria-label={`阅读进度 ${Math.round(book.progress)}%`}><div className="h-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,.85)] transition-[width] duration-500" style={{width: `${book.progress}%`}}/></div>{book.localState === 'cloud_only' && <span className="absolute right-2 top-2 rounded-full bg-slate-900/75 p-1.5 text-white" title="仅云端可用"><CloudDownload className="h-3.5 w-3.5"/></span>}</div><h2 className="mt-3 line-clamp-2 text-sm font-bold text-slate-800 group-hover:text-orange-700">{book.title}</h2><p className="mt-0.5 truncate text-xs text-slate-400">{book.author || '未知作者'} · {formatLabel[book.format]}</p></button><button onClick={() => setSelected(book)} className="absolute right-0 top-0 rounded-bl-lg bg-white/90 p-1.5 text-slate-500 opacity-0 shadow-sm transition group-hover:opacity-100"><MoreHorizontal className="h-4 w-4"/></button><div className="pointer-events-none absolute inset-x-0 top-3 z-20 -translate-y-2 rounded-xl border border-orange-100 bg-white p-3 opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 group-hover:delay-[500ms]"><p className="font-semibold text-slate-800">{book.title}</p><p className="mt-1 text-xs text-slate-500">{book.author || '未知作者'} · {book.formattedSize}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-orange-400" style={{width: `${book.progress}%`}}/></div><p className="mt-1 text-[10px] text-slate-400">阅读进度 {Math.round(book.progress)}%</p></div></div>)}</div>}
    </div></main>
    {selected && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/30 p-4 sm:items-center" onClick={() => setSelected(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onClick={e => e.stopPropagation()}><div className="mb-3 flex items-start justify-between"><div><p className="font-bold text-slate-800">{selected.title}</p><p className="text-xs text-slate-400">{selected.formattedSize} · {formatLabel[selected.format]}</p></div><button onClick={() => setSelected(null)}><X className="h-4 w-4 text-slate-400"/></button></div><div className="space-y-1"><button onClick={() => ensureLocal(selected, true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><BookOpen className="h-4 w-4 text-orange-500"/>{selected.canRead ? '在线阅读' : '下载 MOBI 文件'}</button>{selected.localState === 'cloud_only' && <button onClick={() => ensureLocal(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><CloudDownload className="h-4 w-4 text-sky-500"/>从云端下载</button>}{selected.localState === 'local' && (selected.remoteAvailable ? <button onClick={() => setReleaseCandidate(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><CloudDownload className="h-4 w-4 text-sky-500"/>释放本地副本</button> : <p className="flex items-center gap-2 px-3 py-2 text-xs leading-5 text-slate-400"><CloudDownload className="h-4 w-4 shrink-0"/>配置并完成 WebDAV 同步后，才可释放本地副本</p>)}<button onClick={() => setDeleteCandidate(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/>删除图书</button></div></div></div>}
    <ConfirmationModal isOpen={Boolean(releaseCandidate)} onClose={() => setReleaseCandidate(null)} onConfirm={() => release(releaseCandidate!)} title="释放本地副本？" description={<>将删除《{releaseCandidate?.title}》的本地正文，封面和书籍数据会保留，可随时从云端恢复。</>} confirmText="确认释放" type="warning" isLoading={isActionLoading}/>
    <ConfirmationModal isOpen={Boolean(deleteCandidate)} onClose={() => setDeleteCandidate(null)} onConfirm={() => remove(deleteCandidate!)} title="删除这本图书？" description={<>《{deleteCandidate?.title}》将从书架中移除。</>} confirmText="删除" type="danger" isLoading={isActionLoading}/>
    {reading && <Reader book={reading} onProgressSaved={(progress) => setBooks(current => current.map(item => item.bookId === reading.bookId ? {...item, progress, lastReadAt: new Date().toISOString()} : item))} onClose={() => {setReading(null); reload();}}/>}
    </>;
}
