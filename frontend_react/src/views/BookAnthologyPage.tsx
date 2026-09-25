import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft, BookOpen, CloudDownload, Library, Loader2, MoreHorizontal, Plus, Trash2, Upload, X, Sparkles} from 'lucide-react';
import {BookItem, deleteBook, getBooks, releaseBook, repairBookUpload, restoreBook, uploadBook} from '../api/anthology';
import {useToast} from '../components/common/ToastProvider';
import ConfirmationModal from '../components/common/ConfirmationModal';
import BookReader from '../components/Book/BookReader';
import {useEscapeDismissal} from '../hooks/useEscapeDismissal';

interface Props { collId?: string; onNavigate: (view: string, params?: {bookId?: string; collId?: string}) => void; }
const formatLabel: Record<string, string> = {pdf: 'PDF', txt: 'TXT', epub: 'EPUB', mobi: 'MOBI'};
const BOOK_EXTENSIONS = new Set(['pdf', 'txt', 'epub', 'mobi']);
const MAX_BOOK_SIZE = 500 * 1024 * 1024;

function FallbackCover({book}: {book: BookItem}) {
    return <div className="h-full w-full bg-gradient-to-br from-orange-600 via-orange-500 to-amber-400 p-4 text-white shadow-inner">
        <div className="flex h-full flex-col border border-white/30 p-3"><Library className="h-5 w-5 text-white/75"/><div className="mt-auto font-serif text-base font-bold leading-tight line-clamp-3">{book.title}</div><div className="mt-2 text-[10px] uppercase tracking-[0.24em] text-white/75">{formatLabel[book.format]}</div></div>
    </div>;
}


export default function BookAnthologyPage({collId, onNavigate}: Props) {
    const toast = useToast(); const inputRef = useRef<HTMLInputElement>(null); const repairInputRef = useRef<HTMLInputElement>(null);
    const [books, setBooks] = useState<BookItem[]>([]); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<BookItem | null>(null); const [reading, setReading] = useState<BookItem | null>(null); const [releaseCandidate, setReleaseCandidate] = useState<BookItem | null>(null); const [deleteCandidate, setDeleteCandidate] = useState<BookItem | null>(null); const [repairCandidate, setRepairCandidate] = useState<BookItem | null>(null); const [isActionLoading, setIsActionLoading] = useState(false); const [isDraggingBooks, setIsDraggingBooks] = useState(false); const [isImporting, setIsImporting] = useState(false);
    useEscapeDismissal(Boolean(selected && !releaseCandidate && !deleteCandidate && !repairCandidate), () => setSelected(null));
    const reload = async () => {
        if (!collId) return;
        setLoading(true);
        try {
            const loadedBooks = await getBooks(collId);
            setBooks(loadedBooks);
            const targetBookId = new URLSearchParams(window.location.search).get('bookId');
            const targetBook = loadedBooks.find(book => book.bookId === targetBookId);
            if (targetBook) setSelected(targetBook);
        } catch {
            toast.error('获取书架失败');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); }, [collId]);
    const importFiles = async (files: File[]) => {
        if (!collId || !files.length || isImporting) return;
        const validFiles = files.filter(file => {
            const extension = file.name.split('.').pop()?.toLowerCase();
            return BOOK_EXTENSIONS.has(extension || '') && file.size <= MAX_BOOK_SIZE;
        });
        if (!validFiles.length) {
            toast.error('仅支持不超过 500 MB 的 PDF、TXT、EPUB、MOBI 文件');
            return;
        }
        if (validFiles.length !== files.length) toast.error('已跳过不支持或超过 500 MB 的文件');
        setIsImporting(true);
        let importedCount = 0;
        for (const file of validFiles) {
            const form = new FormData();
            form.append('file', file);
            try {
                await uploadBook(collId, form);
                importedCount += 1;
            } catch {
                toast.error(`《${file.name}》导入失败`);
            }
        }
        if (importedCount) {
            toast.success(importedCount === 1 ? '图书已导入' : `已导入 ${importedCount} 本图书`);
            await reload();
        }
        setIsImporting(false);
    };
    const importBook = (event: React.ChangeEvent<HTMLInputElement>) => {
        void importFiles(Array.from(event.target.files || []));
        event.target.value = '';
    };
    const handleBookDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
    };
    const handleBookDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
        if (event.dataTransfer.types.includes('Files')) setIsDraggingBooks(true);
    };
    const handleBookDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDraggingBooks(false);
    };
    const handleBookDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDraggingBooks(false);
        void importFiles(Array.from(event.dataTransfer.files));
    };
    const repairBook = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; const book = repairCandidate; if (!file || !book) return; const ext = file.name.split('.').pop()?.toLowerCase(); if (ext !== book.format) { toast.error(`请选择 ${formatLabel[book.format]} 格式的文件`); event.target.value = ''; return; } setIsActionLoading(true); const form = new FormData(); form.append('file', file); try { await repairBookUpload(book.bookId, form); toast.success('本地副本已修复；下次同步会补传到云端'); setRepairCandidate(null); setSelected(null); await reload(); } catch { toast.error('补传文件失败，请确认文件格式和大小'); } finally { setIsActionLoading(false); event.target.value = ''; } };
    const ensureLocal = async (book: BookItem, read = false) => { try { if (book.localState === 'cloud_only') { toast.info('正在从云端恢复图书…'); await restoreBook(book.bookId); await reload(); } if (read && book.format !== 'mobi') setReading({...book, localState: 'local'}); else if (book.format === 'mobi') window.open(`/api/anthology/book/${book.bookId}/file`, '_blank'); } catch { toast.error('云端恢复失败；如你有原文件，可选择“从本地文件补传”修复'); } };
    const release = async (book: BookItem) => { setIsActionLoading(true); try { await releaseBook(book.bookId); toast.success('已释放本地副本'); setReleaseCandidate(null); setSelected(null); reload(); } catch { toast.error('释放失败，请稍后重试'); } finally { setIsActionLoading(false); } };
    const remove = async (book: BookItem) => { setIsActionLoading(true); try { await deleteBook(book.bookId); toast.success('图书已删除'); setDeleteCandidate(null); setSelected(null); reload(); } catch { toast.error('图书删除失败'); } finally { setIsActionLoading(false); } };
    return <><main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_10%_0%,#fff4e6,transparent_32%),#f8fafc] px-4 py-6 sm:px-6 lg:px-8"><div className="relative mx-auto max-w-7xl" onDragOver={handleBookDragOver} onDragEnter={handleBookDragEnter} onDragLeave={handleBookDragLeave} onDrop={handleBookDrop}>
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><button onClick={() => onNavigate('home')} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-orange-600"><ArrowLeft className="h-3.5 w-3.5"/>全部文集</button><h1 className="font-serif text-2xl font-bold tracking-tight text-slate-900">我的书架</h1><p className="mt-1 text-sm text-slate-500">在这里收藏、阅读，或从云端按需取回你的书。</p></div><div><input ref={inputRef} type="file" accept=".pdf,.txt,.epub,.mobi" multiple onChange={importBook} className="hidden"/><input ref={repairInputRef} type="file" accept=".pdf,.txt,.epub,.mobi" onChange={repairBook} className="hidden"/><button onClick={() => inputRef.current?.click()} disabled={isImporting} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60">{isImporting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>}{isImporting ? '正在导入' : '导入图书'}</button></div></div>
        {loading ? <div className="py-24 text-center text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin"/></div> : books.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white shadow-sm"><button onClick={() => inputRef.current?.click()} disabled={isImporting} className="flex min-h-44 w-full items-center justify-center gap-4 rounded-xl px-6 text-left transition hover:bg-orange-50/40 disabled:cursor-not-allowed"><div className="flex h-14 w-11 items-center justify-center rounded-md bg-orange-50 text-orange-500 ring-1 ring-orange-100"><BookOpen className="h-5 w-5"/></div><div><p className="text-base font-bold text-slate-700">暂无图书，点击或拖入导入</p><p className="mt-1 text-xs text-slate-400">支持 PDF、TXT、EPUB 和 MOBI，单本最大 500 MB</p></div><Plus className="ml-3 h-5 w-5 text-slate-300"/></button></div> : <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,10.5rem))] gap-x-5 gap-y-7">{books.map(book => <div key={book.bookId} className="group relative"><button onClick={() => ensureLocal(book, true)} className="block w-full text-left"><div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-orange-100 shadow-[5px_7px_0_rgba(148,91,43,.12)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[8px_12px_20px_rgba(148,91,43,.2)]"><FallbackCover book={book}/>{book.coverUrl ? <img src={book.coverUrl} onError={(event) => {event.currentTarget.style.display='none';}} alt="" className="absolute inset-0 h-full w-full object-cover"/> : null}{book.localState === 'cloud_only' && <span className="absolute right-2 top-2 rounded-full bg-slate-900/75 p-1.5 text-white" title="仅云端可用"><CloudDownload className="h-3.5 w-3.5"/></span>}<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-24 flex-col justify-end bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent px-3 pb-3 pt-8"><div className="flex items-center justify-between text-[10px] font-medium tracking-wide text-white/85"><span>阅读进度</span><span className="font-mono text-xs font-semibold text-white">{Math.round(book.progress)}%</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,.9)] transition-[width] duration-500" style={{width: `${book.progress}%`}}/></div></div></div><h2 className="mt-3 line-clamp-2 text-sm font-bold text-slate-800 group-hover:text-orange-700">{book.title}</h2><p className="mt-0.5 truncate text-xs text-slate-400">{book.author || '未知作者'} · {formatLabel[book.format]}</p></button><button onClick={() => onNavigate('bookGuide', {bookId: book.bookId, collId})} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-orange-100 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"><Sparkles className="h-3.5 w-3.5"/>AI 导读</button><button onClick={() => setSelected(book)} className="absolute right-0 top-0 z-20 rounded-bl-lg bg-white/90 p-1.5 text-slate-500 opacity-0 shadow-sm transition group-hover:opacity-100"><MoreHorizontal className="h-4 w-4"/></button></div>)}</div>}
        {isDraggingBooks && <div className="pointer-events-none absolute inset-0 z-30 flex min-h-72 items-center justify-center rounded-2xl border-2 border-dashed border-orange-400 bg-orange-50/90 p-6 text-center shadow-sm backdrop-blur-sm"><div><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-orange-500 shadow-sm"><Upload className="h-6 w-6"/></div><p className="mt-3 text-base font-bold text-orange-700">松开即可导入图书</p><p className="mt-1 text-xs text-orange-600">支持 PDF、TXT、EPUB 和 MOBI，单本最大 500 MB</p></div></div>}
    </div></main>
    {selected && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/30 p-4 sm:items-center" onClick={() => setSelected(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onClick={e => e.stopPropagation()}><div className="mb-3 flex items-start justify-between"><div><p className="font-bold text-slate-800">{selected.title}</p><p className="text-xs text-slate-400">{selected.formattedSize} · {formatLabel[selected.format]}</p></div><button onClick={() => setSelected(null)}><X className="h-4 w-4 text-slate-400"/></button></div><div className="space-y-1"><button onClick={() => ensureLocal(selected, true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><BookOpen className="h-4 w-4 text-orange-500"/>{selected.canRead ? '在线阅读' : '下载 MOBI 文件'}</button>{selected.localState === 'cloud_only' && <button onClick={() => ensureLocal(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><CloudDownload className="h-4 w-4 text-sky-500"/>从云端下载</button>}<button onClick={() => { setRepairCandidate(selected); repairInputRef.current?.click(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><Upload className="h-4 w-4 text-orange-500"/>从本地文件补传</button><p className="px-3 text-xs leading-5 text-slate-400">用于修复本地或云端副本丢失；文件会在下次同步时重新备份。</p>{selected.localState === 'local' && (selected.remoteAvailable ? <button onClick={() => setReleaseCandidate(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-orange-50"><CloudDownload className="h-4 w-4 text-sky-500"/>释放本地副本</button> : <p className="flex items-center gap-2 px-3 py-2 text-xs leading-5 text-slate-400"><CloudDownload className="h-4 w-4 shrink-0"/>完成同步与备份后，才可释放本地副本</p>)}<button onClick={() => setDeleteCandidate(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/>删除图书</button></div></div></div>}
    <ConfirmationModal isOpen={Boolean(releaseCandidate)} onClose={() => setReleaseCandidate(null)} onConfirm={() => release(releaseCandidate!)} title="释放本地副本？" description={<>将删除《{releaseCandidate?.title}》的本地正文，封面和书籍数据会保留，可随时从云端恢复。</>} confirmText="确认释放" type="warning" isLoading={isActionLoading}/>
    <ConfirmationModal isOpen={Boolean(deleteCandidate)} onClose={() => setDeleteCandidate(null)} onConfirm={() => remove(deleteCandidate!)} title="删除这本图书？" description={<>《{deleteCandidate?.title}》将从书架中移除。</>} confirmText="删除" type="danger" isLoading={isActionLoading}/>
    {reading && <BookReader book={reading} onProgressSaved={(progress) => setBooks(current => current.map(item => item.bookId === reading.bookId ? {...item, progress, lastReadAt: new Date().toISOString()} : item))} onClose={() => {setReading(null); reload();}}/>}
    </>;
}
