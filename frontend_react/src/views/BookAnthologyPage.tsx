import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft, BookOpen, CloudDownload, Download, Library, Loader2, MoreHorizontal, Plus, Trash2, Upload, X} from 'lucide-react';
import {BookItem, deleteBook, getBookProgress, getBooks, releaseBook, restoreBook, saveBookProgress, uploadBook} from '../api/anthology';
import {useToast} from '../components/common/ToastProvider';
import {getAuthToken} from '../utils/authStorage';

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

async function fetchBookBlob(bookId: string) {
    const token = getAuthToken();
    const response = await fetch(`/api/anthology/book/${bookId}/file`, {
        headers: token ? {Authorization: `Token ${token}`} : undefined,
    });
    if (!response.ok) throw new Error('图书下载失败');
    return response.blob();
}

function Reader({book, onClose}: {book: BookItem; onClose: () => void}) {
    const toast = useToast();
    const [text, setText] = useState(''); const [loading, setLoading] = useState(true); const [fileUrl, setFileUrl] = useState('');
    const epubRef = useRef<HTMLDivElement>(null); const renditionRef = useRef<any>(null);
    const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingProgressRef = useRef<{location: string; progress: number} | null>(null);
    const savePendingProgress = () => {
        if (!pendingProgressRef.current) return;
        const payload = pendingProgressRef.current;
        pendingProgressRef.current = null;
        void saveBookProgress(book.bookId, payload);
    };
    useEffect(() => {
        let cancelled = false;
        const open = async () => {
            try {
                const progress = await getBookProgress(book.bookId);
                const fileBlob = await fetchBookBlob(book.bookId);
                const localFileUrl = URL.createObjectURL(fileBlob);
                if (cancelled) { URL.revokeObjectURL(localFileUrl); return; }
                setFileUrl(localFileUrl);
                if (book.format === 'txt') {
                    const content = decodePlainText(await fileBlob.arrayBuffer());
                    if (!cancelled) setText(content);
                } else if (book.format === 'epub' && epubRef.current) {
                    const {default: ePub} = await import('epubjs'); const epub = ePub(localFileUrl); const rendition = epub.renderTo(epubRef.current, {width: '100%', height: '100%'}); renditionRef.current = rendition;
                    rendition.on('relocated', (where: any) => { const pct = Math.round((where.start.percentage || 0) * 100); saveBookProgress(book.bookId, {location: where.start.cfi || '', progress: pct}); });
                    await rendition.display(progress.location || undefined);
                }
            } catch { toast.error('无法打开图书'); } finally { if (!cancelled) setLoading(false); }
        };
        open(); return () => {
            cancelled = true;
            renditionRef.current?.destroy?.();
            if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
            savePendingProgress();
            setFileUrl(current => { if (current) URL.revokeObjectURL(current); return ''; });
        };
    }, [book, toast]);
    const saveTxt = (event: React.UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        const percent = target.scrollHeight <= target.clientHeight ? 100 : Math.round(target.scrollTop / (target.scrollHeight - target.clientHeight) * 100);
        pendingProgressRef.current = {location: String(target.scrollTop), progress: percent};
        if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
        progressTimerRef.current = setTimeout(savePendingProgress, 1000);
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
    return <div className="fixed inset-0 z-[120] flex h-[100dvh] max-w-[100vw] flex-col overflow-hidden bg-[#ece4d4] text-stone-800">
        <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-[#d9cdb8] bg-[#fdfaf3]/95 px-3 shadow-[0_1px_0_rgba(255,255,255,.9)] backdrop-blur sm:px-6"><button onClick={onClose} className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-stone-600 transition hover:text-orange-600 sm:text-sm"><ArrowLeft className="h-4 w-4 shrink-0"/>返回书架</button><span className="absolute left-1/2 max-w-[42vw] -translate-x-1/2 truncate font-['FZPingXianYaSong'] text-base font-bold tracking-wide text-stone-700 sm:text-lg">{book.title}</span><button onClick={downloadBook} className="rounded-md p-2 text-stone-500 transition hover:bg-orange-50 hover:text-orange-600"><Download className="h-4 w-4"/></button></header>
        <main className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,.5),transparent_32%),linear-gradient(90deg,#e5dac3,#f2eadb_9%,#eee4d2_91%,#dccfb7)] p-0 sm:p-5">{loading && <div className="absolute inset-0 z-10 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500"/></div>}
            {book.format === 'pdf' && fileUrl && <iframe title={book.title} src={`${fileUrl}#view=FitH`} className="h-full w-full border-0 sm:rounded-sm sm:shadow-[0_5px_22px_rgba(95,73,43,.18)]"/>}
            {book.format === 'txt' && <div onScroll={saveTxt} className="h-full overflow-y-auto overflow-x-hidden overscroll-contain px-0 py-0 sm:px-5 sm:py-1"><article className="relative mx-auto min-h-full w-full max-w-3xl overflow-hidden break-words bg-[#fdf8eb] px-6 py-10 font-['FZPingXianYaSong'] text-[18px] leading-[2.15] tracking-[.025em] whitespace-pre-wrap text-stone-700 shadow-[0_0_0_1px_rgba(184,160,119,.38),0_7px_28px_rgba(90,68,38,.15)] sm:my-1 sm:min-h-[calc(100%-0.5rem)] sm:rounded-sm sm:px-14 sm:py-14 sm:text-[19px] before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-[#e5d9c3]">{text}</article></div>}
            {book.format === 'epub' && <div ref={epubRef} className="mx-auto h-full w-full max-w-4xl overflow-hidden bg-[#fdf8eb] shadow-[0_0_0_1px_rgba(184,160,119,.38),0_7px_28px_rgba(90,68,38,.15)] sm:rounded-sm"/>}
        </main>
    </div>;
}

export default function BookAnthologyPage({collId, onNavigate}: Props) {
    const toast = useToast(); const inputRef = useRef<HTMLInputElement>(null);
    const [books, setBooks] = useState<BookItem[]>([]); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<BookItem | null>(null); const [reading, setReading] = useState<BookItem | null>(null);
    const reload = async () => { if (!collId) return; setLoading(true); try { setBooks(await getBooks(collId)); } catch { toast.error('获取书架失败'); } finally { setLoading(false); } };
    useEffect(() => { reload(); }, [collId]);
    const importBook = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !collId) return; const ext = file.name.split('.').pop()?.toLowerCase(); if (!['pdf','txt','epub','mobi'].includes(ext || '')) { toast.error('仅支持 PDF、TXT、EPUB、MOBI'); return; } const form = new FormData(); form.append('file', file); try { await uploadBook(collId, form); toast.success('图书已导入'); reload(); } catch { toast.error('图书导入失败'); } finally { event.target.value = ''; } };
    const ensureLocal = async (book: BookItem, read = false) => { try { if (book.localState === 'cloud_only') { toast.info('正在从云端恢复图书…'); await restoreBook(book.bookId); await reload(); } if (read && book.format !== 'mobi') setReading({...book, localState: 'local'}); else if (book.format === 'mobi') window.open(`/api/anthology/book/${book.bookId}/file`, '_blank'); } catch { toast.error('云端恢复失败，请检查 WebDAV'); } };
    const release = async (book: BookItem) => { if (!confirm(`释放“${book.title}”的本地正文？封面和书籍数据将保留。`)) return; try { await releaseBook(book.bookId); toast.success('已释放本地副本'); setSelected(null); reload(); } catch { toast.error('暂不能释放：请先完成 WebDAV 同步'); } };
    return <><main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_10%_0%,#fff4e6,transparent_32%),#f8fafc] px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><button onClick={() => onNavigate('home')} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-orange-600"><ArrowLeft className="h-3.5 w-3.5"/>全部文集</button><h1 className="font-serif text-2xl font-bold tracking-tight text-slate-900">我的书架</h1><p className="mt-1 text-sm text-slate-500">在这里收藏、阅读，或从云端按需取回你的书。</p></div><div><input ref={inputRef} type="file" accept=".pdf,.txt,.epub,.mobi" onChange={importBook} className="hidden"/><button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition hover:bg-orange-600"><Upload className="h-4 w-4"/>导入图书</button></div></div>
        {loading ? <div className="py-24 text-center text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin"/></div> : books.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white shadow-sm"><button onClick={() => inputRef.current?.click()} className="flex min-h-44 w-full items-center justify-center gap-4 rounded-xl px-6 text-left transition hover:bg-orange-50/40"><div className="flex h-14 w-11 items-center justify-center rounded-md bg-orange-50 text-orange-500 ring-1 ring-orange-100"><BookOpen className="h-5 w-5"/></div><div><p className="text-base font-bold text-slate-700">暂无图书，点击导入</p><p className="mt-1 text-xs text-slate-400">支持 PDF、TXT、EPUB 和 MOBI，单本最大 500 MB</p></div><Plus className="ml-3 h-5 w-5 text-slate-300"/></button></div> : <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{books.map(book => <div key={book.bookId} className="group relative"><button onClick={() => ensureLocal(book, true)} className="block w-full text-left"><div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-orange-100 shadow-[5px_7px_0_rgba(148,91,43,.12)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[8px_12px_20px_rgba(148,91,43,.2)]"><FallbackCover book={book}/>{book.coverUrl ? <img src={book.coverUrl} onError={(event) => {event.currentTarget.style.display='none';}} alt="" className="absolute inset-0 h-full w-full object-cover"/> : null}{book.localState === 'cloud_only' && <span className="absolute right-2 top-2 rounded-full bg-slate-900/75 p-1.5 text-white" title="仅云端可用"><CloudDownload className="h-3.5 w-3.5"/></span>}</div><h2 className="mt-3 line-clamp-2 text-sm font-bold text-slate-800 group-hover:text-orange-700">{book.title}</h2><p className="mt-0.5 truncate text-xs text-slate-400">{book.author || '未知作者'} · {formatLabel[book.format]}</p></button><button onClick={() => setSelected(book)} className="absolute right-0 top-0 rounded-bl-lg bg-white/90 p-1.5 text-slate-500 opacity-0 shadow-sm transition group-hover:opacity-100"><MoreHorizontal className="h-4 w-4"/></button><div className="pointer-events-none absolute inset-x-0 top-3 z-20 -translate-y-2 rounded-xl border border-orange-100 bg-white p-3 opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 group-hover:delay-[500ms]"><p className="font-semibold text-slate-800">{book.title}</p><p className="mt-1 text-xs text-slate-500">{book.author || '未知作者'} · {book.formattedSize}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-orange-400" style={{width: `${book.progress}%`}}/></div><p className="mt-1 text-[10px] text-slate-400">阅读进度 {Math.round(book.progress)}%</p></div></div>)}</div>}
    </div></main>
    {selected && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/30 p-4 sm:items-center" onClick={() => setSelected(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onClick={e => e.stopPropagation()}><div className="mb-3 flex items-start justify-between"><div><p className="font-bold text-slate-800">{selected.title}</p><p className="text-xs text-slate-400">{selected.formattedSize} · {formatLabel[selected.format]}</p></div><button onClick={() => setSelected(null)}><X className="h-4 w-4 text-slate-400"/></button></div><div className="space-y-1"><button onClick={() => ensureLocal(selected, true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><BookOpen className="h-4 w-4 text-orange-500"/>{selected.canRead ? '在线阅读' : '下载 MOBI 文件'}</button>{selected.localState === 'cloud_only' && <button onClick={() => ensureLocal(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><CloudDownload className="h-4 w-4 text-sky-500"/>从云端下载</button>}{selected.localState === 'local' && <button onClick={() => release(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><CloudDownload className="h-4 w-4 text-sky-500"/>释放本地副本</button>}<button onClick={async () => {if(confirm('删除这本图书？')) {await deleteBook(selected.bookId); setSelected(null); reload();}}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/>删除图书</button></div></div></div>}
    {reading && <Reader book={reading} onClose={() => {setReading(null); reload();}}/>}
    </>;
}
