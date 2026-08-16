import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft, Bookmark, BookmarkCheck, BookOpen, ChevronLeft, ChevronRight, ChevronUp, CloudDownload, Download, Library, List, Loader2, MoreHorizontal, Plus, Trash2, Upload, X} from 'lucide-react';
import {BookItem, deleteBook, getBookProgress, getBooks, releaseBook, restoreBook, saveBookProgress, uploadBook} from '../api/anthology';
import {useToast} from '../components/common/ToastProvider';
import {getAuthToken} from '../utils/authStorage';
import ConfirmationModal from '../components/common/ConfirmationModal';

interface Props { collId?: string; onNavigate: (view: string, params?: any) => void; }

const formatLabel: Record<string, string> = {pdf: 'PDF', txt: 'TXT', epub: 'EPUB', mobi: 'MOBI'};
const SLIDE_SETTLE_MS = 320;
const EPUB_THEME = {
    'html, body': {'background-color': '#ffffff !important'},
    body: {'color': '#334155', 'font-family': '"Songti SC", "STSong", serif', 'line-height': '1.9'},
    'p, li': {'line-height': '1.9'},
};
type PdfCrop = {x: number; y: number; width: number; height: number};
type SlideTurn = {direction: 'prev' | 'next'; progress: number; settling: boolean; source: 'pointer' | 'trackpad' | 'program'};
type EpubFrameSnapshot = {srcdoc: string; left: number; top: number; width: number; height: number; scrollLeft: number; scrollTop: number};
const pdfCropCache = new WeakMap<object, Map<number, Promise<PdfCrop>>>();

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

function detectPdfContentBounds(document: any, page: any, pageNumber: number): Promise<PdfCrop> {
    let documentCache = pdfCropCache.get(document);
    if (!documentCache) {
        documentCache = new Map();
        pdfCropCache.set(document, documentCache);
    }
    const cached = documentCache.get(pageNumber);
    if (cached) return cached;

    const detection = (async () => {
        const original = page.getViewport({scale: 1});
        const detectionScale = Math.min(0.65, 760 / Math.max(original.width, original.height));
        const viewport = page.getViewport({scale: detectionScale});
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        await page.render({canvas, viewport, background: '#ffffff'}).promise;
        const context = canvas.getContext('2d', {willReadFrequently: true});
        if (!context) return {x: 0, y: 0, width: original.width, height: original.height};
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = -1;
        let maxY = -1;
        // A deliberately dark threshold ignores pale paper texture and watermarks while
        // retaining body text, formulae, rules and ordinary illustrations.
        for (let y = 0; y < canvas.height; y += 2) {
            for (let x = 0; x < canvas.width; x += 2) {
                const offset = (y * canvas.width + x) * 4;
                const luminance = pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722;
                if (pixels[offset + 3] > 160 && luminance < 190) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        if (maxX < minX || maxY < minY) return {x: 0, y: 0, width: original.width, height: original.height};

        const scaleBack = 1 / detectionScale;
        const paddingX = original.width * .045;
        const paddingY = original.height * .032;
        const x = Math.max(0, minX * scaleBack - paddingX);
        const y = Math.max(0, minY * scaleBack - paddingY);
        const right = Math.min(original.width, (maxX + 2) * scaleBack + paddingX);
        const bottom = Math.min(original.height, (maxY + 2) * scaleBack + paddingY);
        const width = right - x;
        const height = bottom - y;
        // Avoid treating a sparse cover or divider page as a tiny fragment.
        if (width < original.width * .48 || height < original.height * .42) {
            return {x: 0, y: 0, width: original.width, height: original.height};
        }
        return {x, y, width, height};
    })();
    documentCache.set(pageNumber, detection);
    return detection;
}

function PdfCanvas({document, pageNumber, cropWhitespace}: {document: any; pageNumber: number; cropWhitespace: boolean}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        let cancelled = false;
        let renderTask: any = null;
        let renderFrame = 0;
        let renderVersion = 0;

        const render = async () => {
            const container = containerRef.current;
            const canvas = canvasRef.current;
            if (!document || !container || !canvas || !container.clientWidth || !container.clientHeight) return;
            const version = ++renderVersion;
            renderTask?.cancel?.();
            const page = await document.getPage(pageNumber);
            if (cancelled || version !== renderVersion) return;

            const originalViewport = page.getViewport({scale: 1});
            const crop = cropWhitespace
                ? await detectPdfContentBounds(document, page, pageNumber)
                : {x: 0, y: 0, width: originalViewport.width, height: originalViewport.height};
            if (cancelled || version !== renderVersion) return;
            const fitScale = Math.min(
                container.clientWidth / crop.width,
                container.clientHeight / crop.height,
            );
            const viewport = page.getViewport({scale: fitScale});
            // PDF.js renders into physical pixels while CSS keeps the page at its fitted size.
            // Capping the ratio avoids excessive memory use on unusually dense displays.
            const outputScale = Math.min(window.devicePixelRatio || 1, 2.5);
            const displayWidth = crop.width * fitScale;
            const displayHeight = crop.height * fitScale;
            canvas.width = Math.max(1, Math.floor(displayWidth * outputScale));
            canvas.height = Math.max(1, Math.floor(displayHeight * outputScale));
            canvas.style.width = `${Math.floor(displayWidth)}px`;
            canvas.style.height = `${Math.floor(displayHeight)}px`;
            renderTask = page.render({
                canvas,
                viewport,
                background: '#ffffff',
                transform: [
                    outputScale, 0, 0, outputScale,
                    -crop.x * fitScale * outputScale,
                    -crop.y * fitScale * outputScale,
                ],
            });
            try {
                await renderTask.promise;
            } catch (error: any) {
                if (error?.name !== 'RenderingCancelledException') throw error;
            }
        };

        const scheduleRender = () => {
            window.cancelAnimationFrame(renderFrame);
            renderFrame = window.requestAnimationFrame(() => void render());
        };
        const observer = new ResizeObserver(scheduleRender);
        if (containerRef.current) observer.observe(containerRef.current);
        scheduleRender();
        return () => {
            cancelled = true;
            observer.disconnect();
            window.cancelAnimationFrame(renderFrame);
            renderTask?.cancel?.();
        };
    }, [cropWhitespace, document, pageNumber]);
    return <div ref={containerRef} className="reader-pdf-page">
        <canvas ref={canvasRef} className="reader-pdf-canvas"/>
    </div>;
}

function serializeEpubDocument(doc: Document) {
    let copiedSheets = '';
    for (const sheet of doc.styleSheets) {
        try {
            copiedSheets += `${[...sheet.cssRules].map(rule => rule.cssText).join('\n')}\n`;
        } catch {
            // Cross-origin sheets cannot be read; the document's own tags still serialize.
        }
    }
    const inject = copiedSheets ? `<style data-odoc-epub-copy="true">${copiedSheets}</style>` : '';
    const html = doc.documentElement.outerHTML.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
    return `<!DOCTYPE html>${html.includes(inject) || !inject ? html : `<head>${inject}</head>${html}`}`;
}

function captureEpubFrames(root: HTMLElement | null): EpubFrameSnapshot[] {
    if (!root) return [];
    const rootRect = root.getBoundingClientRect();
    return [...root.querySelectorAll<HTMLElement>('.epub-view')].flatMap(view => {
        const rect = view.getBoundingClientRect();
        const visibleWidth = Math.min(rect.right, rootRect.right) - Math.max(rect.left, rootRect.left);
        const visibleHeight = Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top);
        if (visibleWidth < 24 || visibleHeight < 24) return [];
        const iframe = view.querySelector('iframe');
        const doc = iframe?.contentDocument;
        if (!iframe || !doc?.documentElement) return [];
        const scrolling = doc.scrollingElement || doc.documentElement;
        return [{
            srcdoc: serializeEpubDocument(doc),
            // Paginated chapters are often one very wide iframe translated into view.
            // Keep that offset so the snapshot shows the same slice, not the chapter start.
            left: rect.left - rootRect.left,
            top: rect.top - rootRect.top,
            width: rect.width,
            height: rect.height,
            scrollLeft: scrolling.scrollLeft || 0,
            scrollTop: scrolling.scrollTop || 0,
        }];
    });
}

function sheetOffset(turn: SlideTurn | null) {
    if (!turn) return '0%';
    // Next: current sheet slides left (0 → -100%).
    // Prev: previous sheet comes back from the left (-100% → 0) and covers the current page.
    if (turn.direction === 'next') return `${-turn.progress * 100}%`;
    return `${(turn.progress - 1) * 100}%`;
}

function cfiOf(rendition: any) {
    return rendition?.location?.start?.cfi || rendition?.currentLocation?.()?.start?.cfi || '';
}

function nudgeEpub(rendition: any, direction: 'next' | 'prev') {
    const delta = rendition?.manager?.layout?.delta;
    if (typeof delta === 'number' && delta > 0 && rendition?.manager?.scrollBy) {
        rendition.manager.scrollBy(direction === 'next' ? delta : -delta, 0, true);
        rendition.reportLocation?.();
        return true;
    }
    return false;
}

function waitEpubRelocated(rendition: any, timeout = 900) {
    return new Promise<boolean>(resolve => {
        let done = false;
        const finish = (moved: boolean) => {
            if (done) return;
            done = true;
            rendition?.off?.('relocated', onRelocated);
            resolve(moved);
        };
        const onRelocated = () => finish(true);
        rendition?.on?.('relocated', onRelocated);
        window.setTimeout(() => finish(false), timeout);
    });
}

function EpubSnapshot({frames}: {frames: EpubFrameSnapshot[]}) {
    if (!frames.length) return <div className="reader-slide-blank"/>;
    return <div className="reader-epub-snapshot">
        {frames.map((frame, index) => <iframe
            key={`${frame.left}-${frame.top}-${index}`}
            srcDoc={frame.srcdoc}
            sandbox="allow-same-origin"
            tabIndex={-1}
            title=""
            style={{left: frame.left, top: frame.top, width: frame.width, height: frame.height}}
            onLoad={event => {
                const win = event.currentTarget.contentWindow;
                if (win && (frame.scrollLeft || frame.scrollTop)) win.scrollTo(frame.scrollLeft, frame.scrollTop);
            }}
        />)}
    </div>;
}

function PdfSpread({document, startPage, pageCount, cropWhitespace}: {document: any; startPage: number; pageCount: number; cropWhitespace: boolean}) {
    if (startPage < 1 || startPage > pageCount) return <div className="reader-slide-blank"/>;
    return <div className="reader-slide-spread">
        <div className="reader-book-page reader-book-page-left flex h-full min-w-0 flex-1 items-center justify-center">
            <PdfCanvas document={document} pageNumber={startPage} cropWhitespace={cropWhitespace}/>
        </div>
        {startPage + 1 <= pageCount && <div className="reader-book-page reader-book-page-right hidden h-full min-w-0 flex-1 items-center justify-center md:flex">
            <PdfCanvas document={document} pageNumber={startPage + 1} cropWhitespace={cropWhitespace}/>
        </div>}
    </div>;
}

function paginatePlainText(content: string, pageWidth: number, pageHeight: number) {
    if (!content) return [''];
    const measurer = document.createElement('div');
    measurer.className = 'reader-txt-page-content reader-txt-measurer';
    measurer.style.width = `${Math.max(240, pageWidth)}px`;
    measurer.style.height = `${Math.max(320, pageHeight)}px`;
    document.body.appendChild(measurer);

    const pages: string[] = [];
    const usableWidth = Math.max(120, pageWidth - 128);
    const usableHeight = Math.max(160, pageHeight - 96);
    const estimatedChars = Math.max(240, Math.floor(usableWidth / 19) * Math.floor(usableHeight / 37));
    let cursor = 0;
    while (cursor < content.length) {
        let low = cursor + 1;
        let high = Math.min(content.length, cursor + Math.ceil(estimatedChars * 1.7));
        measurer.textContent = content.slice(cursor, high);
        while (high < content.length && measurer.scrollHeight <= measurer.clientHeight + 1) {
            low = high;
            high = Math.min(content.length, cursor + Math.ceil((high - cursor) * 1.45));
            measurer.textContent = content.slice(cursor, high);
        }
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            measurer.textContent = content.slice(cursor, middle);
            if (measurer.scrollHeight <= measurer.clientHeight + 1) low = middle;
            else high = middle - 1;
        }
        const end = Math.max(cursor + 1, low);
        pages.push(content.slice(cursor, end));
        cursor = end;
    }
    measurer.remove();
    return pages;
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
    const [text, setText] = useState(''); const [txtPages, setTxtPages] = useState<string[]>([]); const [txtPagesPerSpread, setTxtPagesPerSpread] = useState(2); const [txtPaginating, setTxtPaginating] = useState(book.format === 'txt'); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [pdfDocument, setPdfDocument] = useState<any>(null); const [pdfPage, setPdfPage] = useState(1); const [pdfPageCount, setPdfPageCount] = useState(0); const [pdfCropWhitespace, setPdfCropWhitespace] = useState(true); const [pdfUnderPage, setPdfUnderPage] = useState<number | null>(null); const [currentPage, setCurrentPage] = useState(1); const [totalPages, setTotalPages] = useState(0); const [toc, setToc] = useState<Array<{label: string; href: string}>>([]); const [panel, setPanel] = useState<'toc' | 'bookmarks' | null>(null); const [bookmarks, setBookmarks] = useState<Array<{page: number; label: string; location?: string}>>([]); const [epubLocation, setEpubLocation] = useState(''); const [epubAtStart, setEpubAtStart] = useState(false); const [epubAtEnd, setEpubAtEnd] = useState(false); const [epubPrevFrames, setEpubPrevFrames] = useState<EpubFrameSnapshot[]>([]); const [epubNextFrames, setEpubNextFrames] = useState<EpubFrameSnapshot[]>([]); const [epubSheetFrames, setEpubSheetFrames] = useState<EpubFrameSnapshot[]>([]); const [epubFreezeFrames, setEpubFreezeFrames] = useState<EpubFrameSnapshot[] | null>(null); const [jumpPreview, setJumpPreview] = useState<number | null>(null); const [controlsHovered, setControlsHovered] = useState(false); const [pageDrag, setPageDrag] = useState<SlideTurn | null>(null);
    const epubRef = useRef<HTMLDivElement>(null); const textRef = useRef<HTMLDivElement>(null); const renditionRef = useRef<any>(null); const epubBookRef = useRef<any>(null); const epubLocationRef = useRef(''); const refreshNeighborsRef = useRef<(cfi: string, mode?: 'both' | 'next' | 'prev', silent?: boolean) => Promise<void>>(async () => {}); const skipPersistRef = useRef(false); const neighborGenRef = useRef(0); const probeGenRef = useRef(0); const neighborProbeRef = useRef(false); const epubSheetLockRef = useRef<EpubFrameSnapshot[]>([]); const epubCurrentFramesRef = useRef<EpubFrameSnapshot[]>([]); const epubNextCfiRef = useRef(''); const epubPrevCfiRef = useRef(''); const epubNextFramesRef = useRef<EpubFrameSnapshot[]>([]); const epubPrevFramesRef = useRef<EpubFrameSnapshot[]>([]); const holdNeighborRef = useRef<'next' | 'prev' | null>(null); const pendingNeighborRef = useRef<{frames: EpubFrameSnapshot[]; cfi: string} | null>(null); const pdfDocumentRef = useRef<any>(null); const pdfPageRef = useRef(1); const textRestoreProgressRef = useRef<number | null>(null); const txtProgressRef = useRef(0); const dragStartRef = useRef<{x: number; y: number; time: number} | null>(null); const dragProgressRef = useRef(0); const dragDirectionRef = useRef<'prev' | 'next' | null>(null); const lastTurnAt = useRef(0); const turnAnimationRef = useRef(false); const wheelGestureRef = useRef<{offset: number; startedAt: number} | null>(null); const wheelResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); const epubWheelHandlerRef = useRef<((event: WheelEvent) => void) | null>(null); const controlsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); const animatePageTurnRef = useRef<(direction: 'prev' | 'next') => void>(() => {});
    const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingProgressRef = useRef<{location: string; progress: number} | null>(null);
    const bookmarkStorageKey = `o-doc:bookmarks:${book.bookId}`;
    const controlsVisible = controlsHovered;
    const revealControls = () => { if (controlsCloseTimerRef.current) clearTimeout(controlsCloseTimerRef.current); setControlsHovered(true); };
    const deferControlsClose = () => { if (controlsCloseTimerRef.current) clearTimeout(controlsCloseTimerRef.current); controlsCloseTimerRef.current = setTimeout(() => setControlsHovered(false), 700); };
    useEffect(() => { try { setBookmarks(JSON.parse(localStorage.getItem(bookmarkStorageKey) || '[]')); } catch { setBookmarks([]); } }, [bookmarkStorageKey]);
    useEffect(() => { pdfPageRef.current = pdfPage; }, [pdfPage]);
    epubNextFramesRef.current = epubNextFrames;
    epubPrevFramesRef.current = epubPrevFrames;
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
                    textRestoreProgressRef.current = Math.max(0, Math.min(100, Number(progress.progress) || 0));
                    txtProgressRef.current = textRestoreProgressRef.current;
                    if (!cancelled) { setTxtPaginating(true); setText(content); }
                } else if (book.format === 'pdf') {
                    // TRAE's embedded Electron can lag behind the newest Chromium features.
                    // The official legacy bundle supplies the Map/Promise polyfills required by PDF.js 6.
                    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
                    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
                    const document = await pdfjs.getDocument({data: new Uint8Array(await fileBlob.arrayBuffer())}).promise;
                    if (cancelled) { document.cleanup?.(); return; }
                    const savedPage = Number.parseInt(progress.location, 10);
                    const restoredPage = Number.isFinite(savedPage) ? Math.max(1, Math.min(document.numPages, savedPage)) : 1;
                    const spreadStart = restoredPage % 2 === 0 ? restoredPage - 1 : restoredPage;
                    pdfDocumentRef.current = document;
                    setPdfDocument(document); setPdfPage(spreadStart); setPdfPageCount(document.numPages); setCurrentPage(spreadStart); setTotalPages(document.numPages);
                } else if (book.format === 'epub' && epubRef.current) {
                    // ArrayBuffer avoids URL / MIME inconsistencies when opening archived EPUB files.
                    const {default: ePub} = await import('epubjs');
                    const epub = ePub(await fileBlob.arrayBuffer());
                    await epub.opened;
                    if (cancelled || !epubRef.current) { epub.destroy?.(); return; }
                    epubBookRef.current = epub;
                    // epub.js's continuous manager does not reliably retain paginated spreads
                    // in the embedded Electron iframe. Keep the stable default renderer here.
                    const renditionOptions = {width: '100%', height: '100%', manager: 'default', flow: 'paginated', spread: 'always'};
                    const rendition = epub.renderTo(epubRef.current, renditionOptions);
                    renditionRef.current = rendition;
                    rendition.themes?.default?.(EPUB_THEME);
                    const refreshNeighbors = async (cfi: string, mode: 'both' | 'next' | 'prev' = 'both', silent = false) => {
                        const live = epubRef.current;
                        if (!live || !cfi) return;
                        const gen = ++neighborGenRef.current;
                        probeGenRef.current = gen;
                        neighborProbeRef.current = true;
                        skipPersistRef.current = true;
                        const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
                        const stillCurrent = () => gen === neighborGenRef.current;
                        const newerProbeOwns = () => probeGenRef.current !== gen && probeGenRef.current === neighborGenRef.current;
                        const restoreOrigin = async () => {
                            try {
                                if (cfiOf(rendition) !== cfi) await rendition.display(cfi);
                            } catch { /* Restore best-effort. */ }
                        };
                        const peek = async (direction: 'next' | 'prev') => {
                            const originLeft = live.querySelector('.epub-view')?.getBoundingClientRect().left ?? 0;
                            try {
                                const relocated = waitEpubRelocated(rendition);
                                if (!nudgeEpub(rendition, direction)) await rendition[direction]();
                                await Promise.race([relocated, wait(1200)]);
                                if (stillCurrent()) {
                                    await wait(60);
                                    const after = cfiOf(rendition);
                                    const afterLeft = live.querySelector('.epub-view')?.getBoundingClientRect().left ?? originLeft;
                                    const moved = Math.abs(afterLeft - originLeft) >= 24 || (Boolean(after) && after !== cfi);
                                    const frames = moved ? captureEpubFrames(live) : [];
                                    const nextCfi = frames.length ? (after || '') : '';
                                    if (holdNeighborRef.current === direction) {
                                        pendingNeighborRef.current = {frames, cfi: nextCfi};
                                    } else if (direction === 'next') {
                                        setEpubNextFrames(frames);
                                        epubNextCfiRef.current = nextCfi;
                                    } else {
                                        setEpubPrevFrames(frames);
                                        epubPrevCfiRef.current = nextCfi;
                                    }
                                }
                            } finally {
                                if (!stillCurrent()) return;
                                if (nudgeEpub(rendition, direction === 'next' ? 'prev' : 'next')) {
                                    rendition.reportLocation?.();
                                    return;
                                }
                                await restoreOrigin();
                            }
                        };
                        try {
                            if (!silent) {
                                const freeze = captureEpubFrames(live);
                                setEpubFreezeFrames(freeze.length ? freeze : epubCurrentFramesRef.current);
                                await wait(32);
                                if (!stillCurrent()) return;
                                live.style.visibility = 'hidden';
                            }
                            if (mode !== 'prev') await peek('next');
                            if (!stillCurrent()) return;
                            if (mode !== 'next') await peek('prev');
                        } catch {
                            if (stillCurrent()) await restoreOrigin();
                        } finally {
                            if (stillCurrent()) {
                                live.style.visibility = '';
                                setEpubFreezeFrames(null);
                                skipPersistRef.current = false;
                                neighborProbeRef.current = false;
                                const current = captureEpubFrames(live);
                                if (current.length) {
                                    epubCurrentFramesRef.current = current;
                                    setEpubSheetFrames(current);
                                    epubSheetLockRef.current = [];
                                }
                            } else if (!newerProbeOwns()) {
                                neighborProbeRef.current = false;
                                skipPersistRef.current = false;
                            }
                        }
                    };
                    refreshNeighborsRef.current = refreshNeighbors;
                    rendition.on('relocated', (where: any) => {
                        if (skipPersistRef.current) return;
                        const pct = Math.round((where.start.percentage || 0) * 100);
                        const location = where.start.cfi || '';
                        epubLocationRef.current = location;
                        setEpubLocation(location);
                        setEpubAtStart(Boolean(where.atStart));
                        setEpubAtEnd(Boolean(where.atEnd));
                        setCurrentPage(Math.max(1, (epub.locations.locationFromCfi?.(location) ?? 0) + 1));
                        persistProgress({location, progress: pct});
                        // Keep adjacent spine documents parsed in memory. At a chapter boundary
                        // epub.js can then render from this cache instead of fetching/parsing on turn.
                        const index = where.start.index;
                        [index - 1, index + 1].forEach(neighborIndex => {
                            const section = epub.spine.get(neighborIndex);
                            if (section && !section.contents) void section.load(epub.load.bind(epub)).catch(() => {});
                        });
                    });
                    rendition.on('rendered', (_section: any, view: any) => {
                        view?.document?.addEventListener?.('wheel', (event: WheelEvent) => epubWheelHandlerRef.current?.(event), {passive: false});
                    });
                    await Promise.race([rendition.display(progress.location || undefined), new Promise((_, reject) => window.setTimeout(() => reject(new Error('EPUB_RENDER_TIMEOUT')), 30000))]);
                    await waitEpubRelocated(rendition, 1200);
                    const flattenToc = (items: any[]): Array<{label: string; href: string}> => items.flatMap(item => [{label: item.label || '未命名章节', href: item.href}, ...flattenToc(item.subitems || [])]);
                    setToc(flattenToc(epub.navigation?.toc || []));
                    const origin = epubLocationRef.current;
                    if (origin && !cancelled) {
                        const current = captureEpubFrames(epubRef.current);
                        if (current.length) {
                            epubCurrentFramesRef.current = current;
                            setEpubSheetFrames(current);
                        }
                        await refreshNeighbors(origin, 'both', true);
                    }
                    // Location generation reads every spine item.  Do it after the reader is
                    // interactive and with fewer breakpoints, rather than competing with turns.
                    window.setTimeout(() => {
                        void epub.locations.generate(3200).then(() => {
                            if (cancelled) return;
                            setTotalPages(Math.max(1, epub.locations.total || 0));
                            const page = epub.locations.locationFromCfi?.(epubLocationRef.current);
                            if (typeof page === 'number') setCurrentPage(page + 1);
                        }).catch(() => {/* Reading must remain responsive if an EPUB lacks usable locations. */});
                    }, 1200);
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
            neighborGenRef.current += 1;
            renditionRef.current?.destroy?.();
            epubBookRef.current?.destroy?.();
            void pdfDocumentRef.current?.destroy?.();
            if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
            if (controlsCloseTimerRef.current) clearTimeout(controlsCloseTimerRef.current);
            if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
            savePendingProgress();
        };
    }, [book, toast]);
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
    const commitTxtPage = (page: number) => {
        const next = Math.max(1, Math.min(Math.max(1, totalPages), page));
        setCurrentPage(next);
        const progress = Math.round(((next - 1) / Math.max(1, totalPages - 1)) * 100);
        txtProgressRef.current = progress;
        pendingProgressRef.current = {location: String(next), progress};
        if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
        progressTimerRef.current = setTimeout(savePendingProgress, 500);
    };
    const hasPage = (direction: 'prev' | 'next') => {
        if (book.format === 'epub') {
            if (direction === 'prev') return !epubAtStart;
            return !epubAtEnd;
        }
        if (direction === 'prev') return currentPage > 1;
        return book.format === 'pdf' ? pdfPage + 1 < pdfPageCount : currentPage < totalPages;
    };
    const applyEpubSheetFrames = (frames: EpubFrameSnapshot[]) => {
        if (frames.length) epubCurrentFramesRef.current = frames;
        setEpubSheetFrames(frames.length ? frames : epubCurrentFramesRef.current);
    };
    const clearEpubSheetLock = () => {
        epubSheetLockRef.current = [];
    };
    const resetEpubSnapshots = () => {
        epubSheetLockRef.current = [];
        epubCurrentFramesRef.current = [];
        setEpubSheetFrames([]);
        setEpubPrevFrames([]);
        setEpubNextFrames([]);
        epubNextCfiRef.current = '';
        epubPrevCfiRef.current = '';
    };
    const freezeEpubSheet = () => {
        if (epubSheetLockRef.current.length) return epubSheetLockRef.current;
        // Reuse the already-painted current snapshot. Recapturing mid-gesture
        // reloads srcDoc iframes and makes the lifted sheet flicker or change.
        if (epubCurrentFramesRef.current.length) {
            epubSheetLockRef.current = epubCurrentFramesRef.current;
            return epubSheetLockRef.current;
        }
        const captured = captureEpubFrames(epubRef.current);
        epubSheetLockRef.current = captured;
        if (captured.length) applyEpubSheetFrames(captured);
        return captured;
    };
    const settleFlatTurn = async (direction: 'prev' | 'next', shouldTurn: boolean, source: SlideTurn['source']) => {
        turnAnimationRef.current = true;
        if (book.format === 'epub') {
            neighborGenRef.current += 1;
            skipPersistRef.current = false;
            freezeEpubSheet();
        }
        if (book.format === 'pdf') setPdfUnderPage(pdfPageRef.current + (direction === 'next' ? 2 : -2));
        if (shouldTurn && source === 'program') {
            setPageDrag({direction, progress: .02, settling: false, source});
            await new Promise<void>(resolve => {
                if (book.format === 'epub') window.setTimeout(() => resolve(), 80);
                else window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
            });
        }
        setPageDrag({direction, progress: shouldTurn ? 1 : 0, settling: true, source});
        const wait = shouldTurn ? SLIDE_SETTLE_MS : 240;
        if (shouldTurn && book.format === 'epub') {
            const sheet = epubSheetLockRef.current;
            const rendition = renditionRef.current;
            const beforeCfi = cfiOf(rendition) || epubLocationRef.current;
            const targetCfi = direction === 'next' ? epubNextCfiRef.current : epubPrevCfiRef.current;
            const viewLeft = () => epubRef.current?.querySelector('.epub-view')?.getBoundingClientRect().left ?? 0;
            const beforeLeft = viewLeft();
            await new Promise(resolve => window.setTimeout(resolve, wait));
            const relocated = rendition ? waitEpubRelocated(rendition) : Promise.resolve(false);
            try {
                if (!nudgeEpub(rendition, direction)) {
                    if (targetCfi) await rendition?.display?.(targetCfi);
                    else await rendition?.[direction]?.();
                }
            } catch { /* Keep the current spread if the target cannot be loaded. */ }
            await relocated;
            await new Promise(resolve => window.setTimeout(resolve, 60));
            const settledCfi = cfiOf(rendition) || targetCfi || beforeCfi;
            const didMove = Math.abs(viewLeft() - beforeLeft) >= 24 || (Boolean(settledCfi) && settledCfi !== beforeCfi);
            if (!didMove) {
                setPageDrag({direction, progress: 0, settling: true, source});
                await new Promise(resolve => window.setTimeout(resolve, 240));
                setPageDrag(null);
                clearEpubSheetLock();
                setPdfUnderPage(null);
                turnAnimationRef.current = false;
                return;
            }
            epubLocationRef.current = settledCfi;
            const destinationFrames = direction === 'next' ? epubNextFramesRef.current : epubPrevFramesRef.current;
            applyEpubSheetFrames(destinationFrames.length ? destinationFrames : captureEpubFrames(epubRef.current));
            holdNeighborRef.current = direction;
            pendingNeighborRef.current = null;
            try {
                await refreshNeighborsRef.current(settledCfi, direction, true);
            } finally {
                holdNeighborRef.current = null;
                if (direction === 'next') {
                    setEpubPrevFrames(sheet);
                    epubPrevCfiRef.current = beforeCfi;
                } else {
                    setEpubNextFrames(sheet);
                    epubNextCfiRef.current = beforeCfi;
                }
                const pending = pendingNeighborRef.current as {frames: EpubFrameSnapshot[]; cfi: string} | null;
                pendingNeighborRef.current = null;
                if (pending) {
                    if (direction === 'next') {
                        setEpubNextFrames(pending.frames);
                        epubNextCfiRef.current = pending.cfi;
                    } else {
                        setEpubPrevFrames(pending.frames);
                        epubPrevCfiRef.current = pending.cfi;
                    }
                }
                setPageDrag(null);
                clearEpubSheetLock();
                setPdfUnderPage(null);
                turnAnimationRef.current = false;
            }
            return;
        }
        await new Promise(resolve => window.setTimeout(resolve, wait));
        if (shouldTurn && book.format === 'pdf') {
            commitPdfPage(pdfPageRef.current + (direction === 'next' ? 2 : -2));
            await new Promise(resolve => window.setTimeout(resolve, 160));
        }
        setPageDrag(null);
        clearEpubSheetLock();
        setPdfUnderPage(null);
        turnAnimationRef.current = false;
    };
    const turnPage = (direction: 'prev' | 'next') => {
        if (book.format === 'txt') commitTxtPage(currentPage + (direction === 'next' ? 1 : -1));
    };
    const animatePageTurn = (direction: 'prev' | 'next') => {
        if (loading || loadError || neighborProbeRef.current || turnAnimationRef.current || !hasPage(direction)) return;
        if (Date.now() - lastTurnAt.current < 350) return;
        lastTurnAt.current = Date.now();
        if (book.format === 'epub' || book.format === 'pdf') {
            void settleFlatTurn(direction, true, 'program');
            return;
        }
        turnAnimationRef.current = true;
        setPageDrag({direction, progress: .01, settling: false, source: 'program'});
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => setPageDrag({direction, progress: 1, settling: true, source: 'program'}));
        });
        window.setTimeout(() => {
            turnPage(direction);
            setPageDrag(null);
            turnAnimationRef.current = false;
        }, 360);
    };
    animatePageTurnRef.current = animatePageTurn;
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft') animatePageTurnRef.current('prev');
            if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); animatePageTurnRef.current('next'); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const onPagePointerDown = (event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || loading || txtPaginating || loadError || neighborProbeRef.current || turnAnimationRef.current || (event.target instanceof Element && event.target.closest('button, input, aside'))) return;
        dragStartRef.current = {x: event.clientX, y: event.clientY, time: Date.now()}; dragProgressRef.current = 0; dragDirectionRef.current = null;
        if (book.format === 'epub') freezeEpubSheet();
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onPagePointerMove = (event: React.PointerEvent<HTMLElement>) => {
        const start = dragStartRef.current;
        if (!start) return;
        const distance = event.clientX - start.x;
        const verticalDistance = event.clientY - start.y;
        if (!dragDirectionRef.current && Math.abs(verticalDistance) > Math.abs(distance) + 12) {
            dragStartRef.current = null;
            clearEpubSheetLock();
            return;
        }
        if (Math.abs(distance) < 8) return;
        const direction = distance < 0 ? 'next' : 'prev';
        const progress = Math.min(.92, Math.abs(distance) / Math.max(1, event.currentTarget.clientWidth));
        dragDirectionRef.current = direction; dragProgressRef.current = progress;
        if (book.format === 'pdf') setPdfUnderPage(pdfPageRef.current + (direction === 'next' ? 2 : -2));
        if (book.format === 'epub') freezeEpubSheet();
        setPageDrag({direction, progress: hasPage(direction) ? progress : progress * .16, settling: false, source: 'pointer'});
        event.preventDefault();
    };
    const settlePageDrag = (direction: 'prev' | 'next', progress: number, velocity: number, source: 'pointer' | 'trackpad') => {
        const shouldTurn = hasPage(direction) && (progress >= .3 || (progress >= .13 && velocity > .65));
        if (book.format === 'epub' || book.format === 'pdf') {
            void settleFlatTurn(direction, shouldTurn, source);
            return;
        }
        turnAnimationRef.current = true;
        setPageDrag({direction, progress: shouldTurn ? 1 : 0, settling: true, source});
        window.setTimeout(() => {
            if (shouldTurn) turnPage(direction);
            setPageDrag(null);
            turnAnimationRef.current = false;
        }, shouldTurn ? 360 : 240);
    };
    const finishPageDrag = (event: React.PointerEvent<HTMLElement>) => {
        const start = dragStartRef.current;
        const direction = dragDirectionRef.current;
        const progress = dragProgressRef.current;
        dragStartRef.current = null; dragDirectionRef.current = null; dragProgressRef.current = 0;
        if (!start || !direction) { setPageDrag(null); clearEpubSheetLock(); return; }
        const velocity = Math.abs(event.clientX - start.x) / Math.max(1, Date.now() - start.time);
        settlePageDrag(direction, progress, velocity, 'pointer');
    };
    const handleTrackpadWheel = (deltaX: number, deltaY: number, viewportWidth: number, preventDefault: () => void, ctrlKey = false) => {
        if (ctrlKey || loading || loadError || neighborProbeRef.current || turnAnimationRef.current || Math.abs(deltaX) < 2 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
        preventDefault();
        const now = Date.now();
        const current = wheelGestureRef.current;
        const offset = (current?.offset || 0) + deltaX;
        const direction: 'prev' | 'next' = offset >= 0 ? 'next' : 'prev';
        const distance = Math.abs(offset);
        const startedAt = current?.startedAt || now;
        const progress = Math.min(.96, distance / Math.max(180, viewportWidth * .46));
        wheelGestureRef.current = {offset, startedAt};
        if (book.format === 'pdf') setPdfUnderPage(pdfPageRef.current + (direction === 'next' ? 2 : -2));
        if (book.format === 'epub') freezeEpubSheet();
        setPageDrag({direction, progress: hasPage(direction) ? progress : progress * .16, settling: false, source: 'trackpad'});
        if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
        wheelResetTimerRef.current = setTimeout(() => {
            const gesture = wheelGestureRef.current;
            wheelGestureRef.current = null;
            if (!gesture) return;
            const direction: 'prev' | 'next' = gesture.offset >= 0 ? 'next' : 'prev';
            const distance = Math.abs(gesture.offset);
            const gestureProgress = Math.min(.96, distance / Math.max(180, viewportWidth * .46));
            const velocity = distance / Math.max(1, Date.now() - gesture.startedAt);
            settlePageDrag(direction, gestureProgress, velocity, 'trackpad');
        // Wheel events do not expose a reliable "fingers lifted" signal. A longer
        // quiet window keeps a slow, held two-finger drag in preview mode.
        }, 280);
    };
    const onWheel = (event: React.WheelEvent<HTMLElement>) => {
        handleTrackpadWheel(event.deltaX, event.deltaY, event.currentTarget.clientWidth, () => event.preventDefault(), event.ctrlKey);
    };
    epubWheelHandlerRef.current = (event: WheelEvent) => handleTrackpadWheel(event.deltaX, event.deltaY, epubRef.current?.clientWidth || window.innerWidth, () => event.preventDefault(), event.ctrlKey);
    const jumpEpubTo = async (target: string) => {
        neighborGenRef.current += 1;
        neighborProbeRef.current = false;
        resetEpubSnapshots();
        try { await renditionRef.current?.display?.(target); }
        catch { /* Keep the current spread if the target location cannot be opened. */ }
        const cfi = epubLocationRef.current;
        if (cfi) void refreshNeighborsRef.current(cfi, 'both', false);
    };
    const jumpToPage = async (page: number) => {
        const target = Math.max(1, Math.min(totalPages || 1, page));
        if (book.format === 'pdf') commitPdfPage(target);
        if (book.format === 'epub') {
            const location = epubBookRef.current?.locations?.cfiFromLocation?.(target - 1);
            if (location) await jumpEpubTo(location);
        }
        if (book.format === 'txt') commitTxtPage(target);
    };
    const commitJumpPreview = () => {
        if (jumpPreview === null) return;
        const page = jumpPreview;
        setJumpPreview(null);
        void jumpToPage(page);
    };
    const toggleBookmark = () => {
        const exists = bookmarks.some(item => item.page === currentPage);
        const next = exists ? bookmarks.filter(item => item.page !== currentPage) : [...bookmarks, {page: currentPage, location: epubLocation, label: `第 ${currentPage} 页`}];
        setBookmarks(next); localStorage.setItem(bookmarkStorageKey, JSON.stringify(next));
    };
    useEffect(() => {
        if (book.format !== 'txt' || !text || loading || !textRef.current) return;
        let paginationTimer: number | null = null;
        let lastSize = '';
        const paginate = () => {
            const reader = textRef.current;
            if (!reader) return;
            const pagesPerSpread = reader.clientWidth >= 640 ? 2 : 1;
            const sizeKey = `${Math.round(reader.clientWidth)}x${Math.round(reader.clientHeight)}:${pagesPerSpread}`;
            if (sizeKey === lastSize && txtPages.length) return;
            lastSize = sizeKey;
            setTxtPaginating(true);
            const pages = paginatePlainText(text, reader.clientWidth / pagesPerSpread, reader.clientHeight);
            const spreads = Math.max(1, Math.ceil(pages.length / pagesPerSpread));
            const targetProgress = textRestoreProgressRef.current ?? txtProgressRef.current;
            const restoredSpread = Math.max(1, Math.min(spreads, Math.round((targetProgress / 100) * Math.max(0, spreads - 1)) + 1));
            textRestoreProgressRef.current = null;
            setTxtPages(pages);
            setTxtPagesPerSpread(pagesPerSpread);
            setTotalPages(spreads);
            setCurrentPage(restoredSpread);
            setTxtPaginating(false);
        };
        paginationTimer = window.setTimeout(paginate, 40);
        const observer = new ResizeObserver(() => {
            if (paginationTimer !== null) window.clearTimeout(paginationTimer);
            paginationTimer = window.setTimeout(paginate, 160);
        });
        observer.observe(textRef.current);
        return () => {
            observer.disconnect();
            if (paginationTimer !== null) window.clearTimeout(paginationTimer);
        };
    }, [book.format, loading, text]);
    // 阅读器只覆盖内容区，保留全局导航，方便随时搜索、回到其他文集或打开个人操作。
    const hasBookmark = bookmarks.some(item => item.page === currentPage);
    const dragRotation = pageDrag ? (pageDrag.direction === 'next' ? -1 : 1) * pageDrag.progress * 180 : 0;
    const txtPagePreview = (spread: number, half: 'left' | 'right') => {
        if (!txtPages.length || book.format !== 'txt') return '';
        const safeSpread = Math.max(1, Math.min(Math.max(1, totalPages), spread));
        const pageOffset = half === 'right' && txtPagesPerSpread > 1 ? 1 : 0;
        return txtPages[(safeSpread - 1) * txtPagesPerSpread + pageOffset] || '';
    };
    const txtTurningFrontText = pageDrag?.direction === 'next'
        ? txtPagePreview(currentPage, 'right')
        : txtPagePreview(currentPage, 'left');
    const txtTurningBackText = pageDrag?.direction === 'next'
        ? txtPagePreview(currentPage + 1, 'left')
        : txtPagePreview(currentPage - 1, 'right');
    const txtTurningRevealText = pageDrag?.direction === 'next'
        ? txtPagePreview(currentPage + 1, 'right')
        : txtPagePreview(currentPage - 1, 'left');
    const txtPageNumber = (spread: number, half: 'left' | 'right') => {
        const pageOffset = half === 'right' && txtPagesPerSpread > 1 ? 2 : 1;
        return Math.max(1, Math.min(txtPages.length, (spread - 1) * txtPagesPerSpread + pageOffset));
    };
    const epubDirection = pageDrag?.direction === 'prev' ? -1 : 1;
    const turningFrontText = book.format === 'txt' ? txtTurningFrontText : '';
    const turningBackText = book.format === 'txt' ? txtTurningBackText : '';
    const turningRevealText = book.format === 'txt' ? txtTurningRevealText : '';
    const turningFrontNumber = book.format === 'txt'
        ? txtPageNumber(currentPage, pageDrag?.direction === 'next' ? 'right' : 'left')
        : pageDrag?.direction === 'next' ? currentPage + 1 : Math.max(1, currentPage - 1);
    const turningBackNumber = book.format === 'txt'
        ? txtPageNumber(currentPage + epubDirection, pageDrag?.direction === 'next' ? 'left' : 'right')
        : pageDrag?.direction === 'next' ? currentPage + 2 : Math.max(1, currentPage - 2);
    const turningRevealNumber = book.format === 'txt'
        ? txtPageNumber(currentPage + epubDirection, pageDrag?.direction === 'next' ? 'right' : 'left')
        : pageDrag?.direction === 'next' ? currentPage + 3 : Math.max(1, currentPage - 3);
    const txtLeftPage = txtPagePreview(currentPage, 'left');
    const txtRightPage = txtPagesPerSpread > 1 ? txtPagePreview(currentPage, 'right') : '';
    const readerBusy = loading || (book.format === 'txt' && txtPaginating);
    return <div className="fixed inset-x-0 bottom-0 top-16 z-[70] flex max-w-[100vw] flex-col overflow-hidden bg-white text-slate-800">
        <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur sm:px-5"><div className="flex items-center gap-1"><button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"><ArrowLeft className="h-4 w-4"/>返回书架</button><button onClick={() => setPanel(panel === 'toc' ? null : 'toc')} className={`rounded-md p-2 transition ${panel === 'toc' ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:bg-slate-100'}`} title="目录"><List className="h-4 w-4"/></button><button onClick={() => setPanel(panel === 'bookmarks' ? null : 'bookmarks')} className={`rounded-md p-2 transition ${panel === 'bookmarks' ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:bg-slate-100'}`} title="书签列表"><Bookmark className="h-4 w-4"/></button></div><span className="absolute left-1/2 max-w-[42vw] -translate-x-1/2 truncate text-sm font-semibold tracking-wide text-slate-700">{book.title}</span><div className="flex items-center gap-1">{book.format === 'pdf' && <button onClick={() => setPdfCropWhitespace(value => !value)} className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${pdfCropWhitespace ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:bg-slate-100'}`} title={pdfCropWhitespace ? '当前已智能去除页边留白' : '当前显示 PDF 完整页面'}><BookOpen className="h-4 w-4"/><span className="hidden sm:inline">{pdfCropWhitespace ? '正文适配' : '完整页面'}</span></button>}<button onClick={toggleBookmark} className={`rounded-md p-2 transition ${hasBookmark ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:bg-slate-100'}`} title="添加书签">{hasBookmark ? <BookmarkCheck className="h-4 w-4"/> : <Bookmark className="h-4 w-4"/>}</button><button onClick={downloadBook} className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-orange-600" title="下载"><Download className="h-4 w-4"/></button></div></header>
        <main onWheelCapture={onWheel} onPointerDown={onPagePointerDown} onPointerMove={onPagePointerMove} onPointerUp={finishPageDrag} onPointerCancel={finishPageDrag} className="reader-desk relative min-h-0 flex-1 overflow-hidden p-3 touch-pan-y select-none sm:p-6">
            {panel && <aside className="absolute left-3 top-3 z-30 flex max-h-[calc(100%-1.5rem)] w-80 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur sm:left-6 sm:top-6"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="text-sm font-bold text-slate-800">{panel === 'toc' ? '目录' : '书签'}</p><button onClick={() => setPanel(null)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button></div><div className="min-h-0 overflow-y-auto p-2">{panel === 'toc' ? (toc.length ? toc.map((item, index) => <button key={`${item.href}-${index}`} onClick={() => { void jumpEpubTo(item.href); setPanel(null); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-orange-50 hover:text-orange-700"><span className="w-6 text-right font-mono text-[10px] text-slate-400">{index + 1}</span><span className="line-clamp-2">{item.label}</span></button>) : <p className="px-3 py-8 text-center text-xs leading-5 text-slate-400">此文件没有可读取的目录。</p>) : (bookmarks.length ? bookmarks.sort((a, b) => a.page - b.page).map(item => <button key={item.page} onClick={() => { if (book.format === 'epub' && item.location) void jumpEpubTo(item.location); else jumpToPage(item.page); setPanel(null); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-orange-50 hover:text-orange-700"><span>{item.label}</span><span className="font-mono text-xs text-slate-400">{item.page}</span></button>) : <p className="px-4 py-10 text-center text-xs leading-5 text-slate-400">还没有书签。<br/>可点击右上角书签图标添加。</p>)}</div></aside>}
            {readerBusy && <div className="reader-loading-book absolute inset-y-3 left-1/2 z-10 flex w-[calc(100%-1.5rem)] max-w-7xl -translate-x-1/2 sm:inset-y-6 sm:w-[calc(100%-3rem)]" aria-label="正在打开图书"><div/><div/><span className="absolute left-1/2 top-1/2 z-10 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-orange-500"/></span></div>}
            {loadError && <div className="absolute inset-0 z-20 flex items-center justify-center p-6"><div className="max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-center shadow-lg"><p className="font-semibold text-slate-700">图书未能打开</p><p className="mt-2 text-sm leading-6 text-slate-500">{loadError}</p><button onClick={onClose} className="mt-4 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-600">返回书架</button></div></div>}
            {!loading && book.format === 'pdf' && pdfDocument && (
                <div className={`reader-book-spread reader-slide-book mx-auto h-full max-w-7xl overflow-hidden ${pageDrag ? 'reader-slide-active' : ''}`}>
                    <div className="reader-paper-stack">
                        <div className="reader-paper-under">
                            {pageDrag?.direction === 'next' && <div className="reader-paper-layer"><PdfSpread document={pdfDocument} startPage={pdfUnderPage ?? pdfPage + 2} pageCount={pdfPageCount} cropWhitespace={pdfCropWhitespace}/></div>}
                            {pageDrag?.direction === 'prev' && <div className="reader-paper-layer"><PdfSpread document={pdfDocument} startPage={pdfPage} pageCount={pdfPageCount} cropWhitespace={pdfCropWhitespace}/></div>}
                        </div>
                        <div className={`reader-paper-over ${pageDrag ? `is-turning turn-${pageDrag.direction}` : ''} ${pageDrag?.settling ? 'is-settling' : ''}`} style={{transform: `translate3d(${sheetOffset(pageDrag)}, 0, 0)`}}>
                            <PdfSpread document={pdfDocument} startPage={pageDrag?.direction === 'prev' ? (pdfUnderPage ?? pdfPage - 2) : pdfPage} pageCount={pdfPageCount} cropWhitespace={pdfCropWhitespace}/>
                        </div>
                    </div>
                </div>
            )}
            {!loading && book.format === 'txt' && <div ref={textRef} className={`reader-book-spread mx-auto flex h-full max-w-7xl overflow-hidden transition-opacity duration-150 ${txtPaginating ? 'opacity-0' : 'opacity-100'}`}><section className="reader-txt-page reader-book-page-left"><article className="reader-txt-page-content">{txtLeftPage}</article><span>{(currentPage - 1) * txtPagesPerSpread + 1}</span></section>{txtPagesPerSpread > 1 && <section className="reader-txt-page reader-book-page-right"><article className="reader-txt-page-content">{txtRightPage}</article><span>{Math.min(txtPages.length, (currentPage - 1) * txtPagesPerSpread + 2)}</span></section>}</div>}
            {book.format === 'epub' && (
                <div className={`reader-book-spread reader-epub-spread reader-slide-book mx-auto h-full w-full max-w-7xl overflow-hidden transition-opacity duration-150 ${loading ? 'opacity-0' : 'opacity-100'} ${pageDrag ? 'reader-slide-active' : ''}`}>
                    <div className="reader-paper-stack">
                        <div ref={epubRef} className="reader-paper-live" style={{visibility: pageDrag || epubFreezeFrames ? 'hidden' : 'visible'}}/>
                        <div className="reader-paper-under" style={{visibility: pageDrag?.direction === 'next' ? 'visible' : 'hidden'}}>
                            <EpubSnapshot frames={epubNextFrames}/>
                        </div>
                        <div className={`reader-paper-over ${pageDrag?.direction === 'next' ? `is-turning turn-next ${pageDrag.settling ? 'is-settling' : ''}` : ''}`} style={{
                            transform: pageDrag?.direction === 'next' ? `translate3d(${sheetOffset(pageDrag)}, 0, 0)` : 'none',
                            visibility: pageDrag ? 'visible' : 'hidden',
                            zIndex: pageDrag?.direction === 'prev' ? 1 : 2,
                        }}>
                            <EpubSnapshot frames={epubSheetFrames}/>
                        </div>
                        <div className={`reader-paper-over ${pageDrag?.direction === 'prev' ? `is-turning turn-prev ${pageDrag.settling ? 'is-settling' : ''}` : ''}`} style={{
                            transform: pageDrag?.direction === 'prev' ? `translate3d(${sheetOffset(pageDrag)}, 0, 0)` : 'translate3d(-100%, 0, 0)',
                            visibility: pageDrag?.direction === 'prev' ? 'visible' : 'hidden',
                        }}>
                            <EpubSnapshot frames={epubPrevFrames}/>
                        </div>
                        {epubFreezeFrames && <div className="reader-paper-over" style={{zIndex: 3}}><EpubSnapshot frames={epubFreezeFrames}/></div>}
                    </div>
                </div>
            )}
            {pageDrag && book.format === 'txt' && <div aria-hidden="true" className={`reader-turn-layer pointer-events-none absolute inset-y-3 left-1/2 z-10 w-[calc(100%-1.5rem)] max-w-7xl -translate-x-1/2 overflow-hidden rounded-[9px] sm:inset-y-6 sm:w-[calc(100%-3rem)] ${pageDrag.direction === 'next' ? 'reader-turn-next' : 'reader-turn-prev'} ${pageDrag.settling ? 'reader-turn-settling' : ''}`} style={{'--reader-turn-angle': `${dragRotation}deg`, '--reader-turn-progress': pageDrag.progress} as React.CSSProperties}>
                <div className="reader-reveal-page">
                    {turningRevealText && <article className="reader-txt-page-content reader-turn-txt-content">{turningRevealText}</article>}
                    <i>{turningRevealNumber}</i>
                </div>
                <div className="reader-turn-sheet">
                    <div className="reader-turn-face reader-turn-front">
                        {turningFrontText && <article className="reader-txt-page-content reader-turn-txt-content">{turningFrontText}</article>}
                        <i>{turningFrontNumber}</i>
                    </div>
                    <div className="reader-turn-face reader-turn-back">
                        {turningBackText && <article className="reader-txt-page-content reader-turn-txt-content">{turningBackText}</article>}
                        <i>{turningBackNumber}</i>
                    </div>
                </div>
                <div className="reader-turn-shadow"/>
            </div>}
            {!readerBusy && !loadError && <div onMouseEnter={revealControls} onMouseLeave={deferControlsClose} onFocus={revealControls} onBlur={deferControlsClose} className={`pointer-events-auto absolute bottom-0 left-1/2 z-20 -translate-x-1/2 overflow-hidden rounded-t-xl border border-b-0 border-slate-200 bg-white/95 shadow-[0_-6px_18px_rgba(15,23,42,.1)] backdrop-blur transition-[width,height,border-radius] duration-[300ms] ease-[cubic-bezier(.22,.8,.24,1)] ${controlsVisible ? 'h-14 w-[calc(100%-2rem)] max-w-3xl' : 'h-9 w-52 rounded-t-lg'}`}><button onClick={revealControls} className={`absolute inset-0 z-10 inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-wide text-slate-500 transition-all duration-150 ${controlsVisible ? 'pointer-events-none -translate-y-1 opacity-0' : 'opacity-100 delay-100 hover:text-orange-600'}`} aria-expanded={controlsVisible}><span className="h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,.7)] animate-pulse"/>阅读控制<ChevronUp className="h-3.5 w-3.5"/></button><div className={`flex h-full items-center gap-2 px-3 transition-all duration-200 ${controlsVisible ? 'translate-y-0 opacity-100 delay-100' : 'translate-y-2 opacity-0'}`}><button onClick={() => animatePageTurn('prev')} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700" aria-label="上一页"><ChevronLeft className="h-4 w-4"/>上一页</button><div className="relative min-w-0 flex-1"><input aria-label="快速跳转页码" type="range" min="1" max={Math.max(1, totalPages)} value={Math.min(jumpPreview ?? currentPage, Math.max(1, totalPages))} onChange={event => setJumpPreview(Number(event.target.value))} onPointerUp={commitJumpPreview} onKeyUp={commitJumpPreview} style={{background: `linear-gradient(to right, #f97316 0%, #f97316 ${((Math.min(jumpPreview ?? currentPage, Math.max(1, totalPages)) - 1) / Math.max(1, (totalPages || 1) - 1)) * 100}%, #e2e8f0 ${((Math.min(jumpPreview ?? currentPage, Math.max(1, totalPages)) - 1) / Math.max(1, (totalPages || 1) - 1)) * 100}%, #e2e8f0 100%)`}} className="h-1.5 w-full cursor-pointer appearance-none rounded-sm [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-sm [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:shadow-sm"/></div><span className="min-w-16 text-center text-xs font-medium tabular-nums text-slate-500">{jumpPreview ?? currentPage} / {totalPages || '—'}</span><button onClick={() => animatePageTurn('next')} className="inline-flex h-8 items-center gap-1 rounded-md bg-orange-500 px-2.5 text-xs font-medium text-white shadow-sm transition hover:bg-orange-600" aria-label="下一页">下一页<ChevronRight className="h-4 w-4"/></button></div></div>}
        </main>
    </div>;
}

export default function BookAnthologyPage({collId, onNavigate}: Props) {
    const toast = useToast(); const inputRef = useRef<HTMLInputElement>(null);
    const [books, setBooks] = useState<BookItem[]>([]); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<BookItem | null>(null); const [reading, setReading] = useState<BookItem | null>(null); const [releaseCandidate, setReleaseCandidate] = useState<BookItem | null>(null); const [deleteCandidate, setDeleteCandidate] = useState<BookItem | null>(null); const [isActionLoading, setIsActionLoading] = useState(false);
    const reload = async () => { if (!collId) return; setLoading(true); try { setBooks(await getBooks(collId)); } catch { toast.error('获取书架失败'); } finally { setLoading(false); } };
    useEffect(() => { reload(); }, [collId]);
    useEffect(() => {
        if (!selected || releaseCandidate || deleteCandidate) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelected(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selected, releaseCandidate, deleteCandidate]);
    const importBook = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !collId) return; const ext = file.name.split('.').pop()?.toLowerCase(); if (!['pdf','txt','epub','mobi'].includes(ext || '')) { toast.error('仅支持 PDF、TXT、EPUB、MOBI'); return; } const form = new FormData(); form.append('file', file); try { await uploadBook(collId, form); toast.success('图书已导入'); reload(); } catch { toast.error('图书导入失败'); } finally { event.target.value = ''; } };
    const ensureLocal = async (book: BookItem, read = false) => { try { if (book.localState === 'cloud_only') { toast.info('正在从云端恢复图书…'); await restoreBook(book.bookId); await reload(); } if (read && book.format !== 'mobi') setReading({...book, localState: 'local'}); else if (book.format === 'mobi') window.open(`/api/anthology/book/${book.bookId}/file`, '_blank'); } catch { toast.error('云端恢复失败，请检查 WebDAV'); } };
    const release = async (book: BookItem) => { setIsActionLoading(true); try { await releaseBook(book.bookId); toast.success('已释放本地副本'); setReleaseCandidate(null); setSelected(null); reload(); } catch { toast.error('释放失败，请稍后重试'); } finally { setIsActionLoading(false); } };
    const remove = async (book: BookItem) => { setIsActionLoading(true); try { await deleteBook(book.bookId); toast.success('图书已删除'); setDeleteCandidate(null); setSelected(null); reload(); } catch { toast.error('图书删除失败'); } finally { setIsActionLoading(false); } };
    return <><main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_10%_0%,#fff4e6,transparent_32%),#f8fafc] px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><button onClick={() => onNavigate('home')} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-orange-600"><ArrowLeft className="h-3.5 w-3.5"/>全部文集</button><h1 className="font-serif text-2xl font-bold tracking-tight text-slate-900">我的书架</h1><p className="mt-1 text-sm text-slate-500">在这里收藏、阅读，或从云端按需取回你的书。</p></div><div><input ref={inputRef} type="file" accept=".pdf,.txt,.epub,.mobi" onChange={importBook} className="hidden"/><button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition hover:bg-orange-600"><Upload className="h-4 w-4"/>导入图书</button></div></div>
        {loading ? <div className="py-24 text-center text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin"/></div> : books.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white shadow-sm"><button onClick={() => inputRef.current?.click()} className="flex min-h-44 w-full items-center justify-center gap-4 rounded-xl px-6 text-left transition hover:bg-orange-50/40"><div className="flex h-14 w-11 items-center justify-center rounded-md bg-orange-50 text-orange-500 ring-1 ring-orange-100"><BookOpen className="h-5 w-5"/></div><div><p className="text-base font-bold text-slate-700">暂无图书，点击导入</p><p className="mt-1 text-xs text-slate-400">支持 PDF、TXT、EPUB 和 MOBI，单本最大 500 MB</p></div><Plus className="ml-3 h-5 w-5 text-slate-300"/></button></div> : <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,10.5rem))] gap-x-5 gap-y-7">{books.map(book => <div key={book.bookId} className="group relative"><button onClick={() => ensureLocal(book, true)} className="block w-full text-left"><div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-orange-100 shadow-[5px_7px_0_rgba(148,91,43,.12)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[8px_12px_20px_rgba(148,91,43,.2)]"><FallbackCover book={book}/>{book.coverUrl ? <img src={book.coverUrl} onError={(event) => {event.currentTarget.style.display='none';}} alt="" className="absolute inset-0 h-full w-full object-cover"/> : null}{book.localState === 'cloud_only' && <span className="absolute right-2 top-2 rounded-full bg-slate-900/75 p-1.5 text-white" title="仅云端可用"><CloudDownload className="h-3.5 w-3.5"/></span>}<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-24 flex-col justify-end bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent px-3 pb-3 pt-8"><div className="flex items-center justify-between text-[10px] font-medium tracking-wide text-white/85"><span>阅读进度</span><span className="font-mono text-xs font-semibold text-white">{Math.round(book.progress)}%</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,.9)] transition-[width] duration-500" style={{width: `${book.progress}%`}}/></div></div></div><h2 className="mt-3 line-clamp-2 text-sm font-bold text-slate-800 group-hover:text-orange-700">{book.title}</h2><p className="mt-0.5 truncate text-xs text-slate-400">{book.author || '未知作者'} · {formatLabel[book.format]}</p></button><button onClick={() => setSelected(book)} className="absolute right-0 top-0 z-20 rounded-bl-lg bg-white/90 p-1.5 text-slate-500 opacity-0 shadow-sm transition group-hover:opacity-100"><MoreHorizontal className="h-4 w-4"/></button></div>)}</div>}
    </div></main>
    {selected && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/30 p-4 sm:items-center" onClick={() => setSelected(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onClick={e => e.stopPropagation()}><div className="mb-3 flex items-start justify-between"><div><p className="font-bold text-slate-800">{selected.title}</p><p className="text-xs text-slate-400">{selected.formattedSize} · {formatLabel[selected.format]}</p></div><button onClick={() => setSelected(null)}><X className="h-4 w-4 text-slate-400"/></button></div><div className="space-y-1"><button onClick={() => ensureLocal(selected, true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><BookOpen className="h-4 w-4 text-orange-500"/>{selected.canRead ? '在线阅读' : '下载 MOBI 文件'}</button>{selected.localState === 'cloud_only' && <button onClick={() => ensureLocal(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><CloudDownload className="h-4 w-4 text-sky-500"/>从云端下载</button>}{selected.localState === 'local' && (selected.remoteAvailable ? <button onClick={() => setReleaseCandidate(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><CloudDownload className="h-4 w-4 text-sky-500"/>释放本地副本</button> : <p className="flex items-center gap-2 px-3 py-2 text-xs leading-5 text-slate-400"><CloudDownload className="h-4 w-4 shrink-0"/>配置并完成 WebDAV 同步后，才可释放本地副本</p>)}<button onClick={() => setDeleteCandidate(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/>删除图书</button></div></div></div>}
    <ConfirmationModal isOpen={Boolean(releaseCandidate)} onClose={() => setReleaseCandidate(null)} onConfirm={() => release(releaseCandidate!)} title="释放本地副本？" description={<>将删除《{releaseCandidate?.title}》的本地正文，封面和书籍数据会保留，可随时从云端恢复。</>} confirmText="确认释放" type="warning" isLoading={isActionLoading}/>
    <ConfirmationModal isOpen={Boolean(deleteCandidate)} onClose={() => setDeleteCandidate(null)} onConfirm={() => remove(deleteCandidate!)} title="删除这本图书？" description={<>《{deleteCandidate?.title}》将从书架中移除。</>} confirmText="删除" type="danger" isLoading={isActionLoading}/>
    {reading && <Reader book={reading} onProgressSaved={(progress) => setBooks(current => current.map(item => item.bookId === reading.bookId ? {...item, progress, lastReadAt: new Date().toISOString()} : item))} onClose={() => {setReading(null); reload();}}/>}
    </>;
}
