import {useRef, useState} from 'react';
import {Pencil, Trash2, X, Loader2} from 'lucide-react';
import {type DiaryDraft, type DiaryEntry} from '../../types/api/diary';
import ConfirmationModal from '../common/ConfirmationModal';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {uploadDiaryImage} from '../../api/diary';
import DiaryDetailsFields from './DiaryDetailsFields';
import DiaryMetadata from './DiaryMetadata';
import DiaryGallery from './DiaryGallery';
import {diaryImagePatch, MAX_DIARY_IMAGES} from './diaryImages';
import {localDay} from './diaryDate';
interface Props {entry?: DiaryEntry; onClose: () => void; onSave: (draft: DiaryDraft, id?: string) => Promise<void>; onDelete: (id: string) => Promise<void>}
export default function DiaryEditor({entry, onClose, onSave, onDelete}: Props) {
    const initial: DiaryDraft = entry ? {title: entry.title, content: entry.content, entryDate: entry.entryDate, coverUrl: entry.coverUrl, coverAssetId: entry.coverAssetId, imageAssetIds: entry.imageAssetIds, mood: entry.mood, weather: entry.weather, tags: entry.tags} : {title: '', content: '', entryDate: localDay(new Date()), coverUrl: '', coverAssetId: null, imageAssetIds: [], mood: '', weather: '', tags: []};
    const [draft, setDraft] = useState(initial);
    const [editing, setEditing] = useState(!entry);
    const uploadInProgress = useRef(false);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState<'delete' | 'discard' | null>(null);
    const close = () => {if (!busy && !uploading) {if (JSON.stringify(draft) !== JSON.stringify(initial)) setConfirm('discard'); else onClose();}};
    useEscapeDismissal(true, close);
    const update = <K extends keyof DiaryDraft>(key: K, value: DiaryDraft[K]) => setDraft(d => ({...d, [key]: value}));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!draft.title.trim() || !draft.content.trim()) {setError('请填写标题和正文'); return;}
        setBusy(true); setError('');
        try {await onSave({...draft, title: draft.title.trim(), content: draft.content.trim()}, entry?.diaryId); onClose();}
        catch {setError('保存失败，内容已保留，请重试');} finally {setBusy(false);}
    };
    const upload = async (files: File[]) => {
        if (uploadInProgress.current || !files.length) return;
        if (draft.imageAssetIds.length + files.length > MAX_DIARY_IMAGES) {setError(`每篇日记最多添加 ${MAX_DIARY_IMAGES} 张图片，请减少后重试`); return;}
        uploadInProgress.current = true; setUploading(true); setError('');
        const failures: string[] = [];
        try {
            for (const file of files) {
                try {
                    const asset = await uploadDiaryImage(file);
                    setDraft(d => d.imageAssetIds.includes(asset.id) ? d : ({...d, ...diaryImagePatch([...d.imageAssetIds, asset.id])}));
                } catch (problem) {failures.push(`${file.name}：${problem instanceof Error ? problem.message : '上传失败'}`);}
            }
            if (failures.length) setError(`部分图片上传失败，成功图片已保留。${failures.join('；')}`);
        } finally {uploadInProgress.current = false; setUploading(false);}
    };
    return <div data-modal-scroll-lock className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4" onClick={close}>
        <section role="dialog" aria-modal="true" aria-label={editing ? '编辑日记' : '日记详情'} className="relative max-h-[90dvh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl scrollbar-hide" onClick={event => event.stopPropagation()}>
            <header className="sticky top-0 z-20 flex items-center justify-between bg-white p-6"><h2 className="text-lg font-bold">{editing ? (entry ? '编辑日记' : '写日记') : '日记详情'}</h2><div className="flex items-center gap-2">{entry && !editing && <><button aria-label="编辑日记" onClick={() => setEditing(true)} className="rounded-lg p-2 hover:bg-orange-50"><Pencil size={18}/></button><button aria-label="删除日记" onClick={() => setConfirm('delete')} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={18}/></button></>}<button aria-label="关闭" disabled={busy || uploading} onClick={close} className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button></div></header>
            {editing ? <form onSubmit={submit} className="px-6 pb-6"><fieldset disabled={busy || uploading} className="grid min-w-0 gap-7 md:grid-cols-[minmax(0,1fr)_300px]"><div className="min-w-0 space-y-5"><label className="block text-sm font-semibold">标题<input autoFocus required maxLength={150} value={draft.title} onChange={e => update('title', e.target.value)} placeholder="给今天起个名字" className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"/></label>
                <label className="block text-sm font-semibold">日期<input type="date" required value={draft.entryDate} onChange={e => update('entryDate', e.target.value)} className="mt-2 block w-full min-w-0 rounded-xl border border-slate-200 p-2.5 font-normal sm:max-w-xs"/></label>
                <label className="block text-sm font-semibold">正文<textarea required maxLength={50000} value={draft.content} onChange={e => update('content', e.target.value)} rows={12} placeholder="今天发生了什么？从一个小小的瞬间开始吧。" className="mt-2 h-64 w-full resize-none md:h-[480px] rounded-xl border border-slate-200 p-3 font-normal leading-7"/></label>
                </div><DiaryDetailsFields draft={draft} onChange={patch => setDraft(d => ({...d, ...patch}))} onUpload={upload} uploading={uploading}/></fieldset>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <div className="sticky bottom-0 z-10 mt-6 flex justify-end gap-3 bg-white py-4"><button type="button" disabled={busy || uploading} onClick={close} className="rounded-full bg-slate-100 px-5 py-2.5 text-sm">取消</button><button disabled={busy || uploading} className="flex items-center gap-2 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin"/>}保存日记</button></div>
            </form> : <article className="px-6 pb-8"><p className="mb-3 text-xs text-slate-500">{entry?.entryDate}</p><h3 className="break-words text-xl font-bold text-slate-900">{entry?.title}</h3>{entry && <DiaryMetadata entry={entry}/>}<p className="mt-5 whitespace-pre-wrap break-words text-sm leading-8 text-slate-700">{entry?.content}</p>{entry && <DiaryGallery ids={entry.imageAssetIds} legacyUrl={entry.coverUrl}/>}{error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}</article>}
        </section>
        <ConfirmationModal isOpen={confirm !== null} title={confirm === 'delete' ? '删除这篇日记？' : '放弃未保存的内容？'} description={confirm === 'delete' ? '删除后将不再显示这篇日记。' : '关闭后本次修改不会保存。'} confirmText={confirm === 'delete' ? '删除' : '放弃修改'} isLoading={busy} onClose={() => setConfirm(null)} onConfirm={async () => {if (confirm === 'discard') {onClose(); return;} if (!entry) return; setBusy(true); try {await onDelete(entry.diaryId); onClose();} catch {setError('删除失败，请重试'); setConfirm(null);} finally {setBusy(false);}}}/>
    </div>;
}
