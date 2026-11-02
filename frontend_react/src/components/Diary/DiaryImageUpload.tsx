import {useRef, useState} from 'react';
import {ArrowUpLeft, ImagePlus, Images, Loader2, X} from 'lucide-react';
import type {DiaryDraft} from '../../types/api/diary';
import {collectDroppedFiles} from '../../utils/imageUpload';
import DiaryPhoto from './DiaryPhoto';
import DiaryLibraryPicker from './DiaryLibraryPicker';
import {diaryImagePatch, MAX_DIARY_IMAGES} from './diaryImages';
interface Props {draft: DiaryDraft; onChange: (patch: Partial<DiaryDraft>) => void; onUpload: (files: File[]) => void; uploading: boolean}
export default function DiaryImageUpload({draft, onChange, onUpload, uploading}: Props) {
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);
    const input = useRef<HTMLInputElement>(null);
    const full = draft.imageAssetIds.length >= MAX_DIARY_IMAGES;
    return <div><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">日记配图</p><span className="text-xs tabular-nums text-slate-500">{draft.imageAssetIds.length} / {MAX_DIARY_IMAGES}</span></div>
        {!!draft.imageAssetIds.length && <div className="mb-3 grid grid-cols-3 gap-2">{draft.imageAssetIds.map((id, index) => <div key={id} className="group relative overflow-hidden rounded-lg border border-slate-200"><DiaryPhoto assetId={id} url="" className="aspect-square w-full object-cover"/>{index === 0 ? <span className="absolute bottom-0 left-0 bg-slate-900/70 px-2 py-1 text-[11px] text-white">封面</span> : <button type="button" disabled={uploading} title="设为封面" aria-label={`将图片 ${index + 1} 设为封面`} onClick={() => onChange(diaryImagePatch([id, ...draft.imageAssetIds.filter(item => item !== id)]))} className="absolute bottom-1 left-1 rounded bg-white/95 p-1 text-slate-600"><ArrowUpLeft size={13}/></button>}<button type="button" disabled={uploading} aria-label={`移除配图 ${index + 1}`} onClick={() => onChange(diaryImagePatch(draft.imageAssetIds.filter(item => item !== id)))} className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-slate-600"><X size={13}/></button></div>)}</div>}
        {!draft.imageAssetIds.length && draft.coverUrl && <div className="relative mb-3"><DiaryPhoto assetId={null} url={draft.coverUrl} className="aspect-[4/3] w-full rounded-xl object-cover"/><button type="button" aria-label="移除历史配图" onClick={() => onChange(diaryImagePatch([]))} className="absolute right-2 top-2 rounded-full bg-white p-1.5 text-slate-600"><X size={15}/></button></div>}
        <div data-diary-dropzone aria-label="拖拽上传日记图片" onDragEnter={event => {event.preventDefault(); event.stopPropagation(); if (!uploading && !full) {dragDepth.current++; setDragging(true);}}} onDragOver={event => {event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = uploading || full ? 'none' : 'copy';}} onDragLeave={event => {event.preventDefault(); event.stopPropagation(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false);}} onDrop={event => {event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); if (!uploading && !full) onUpload(collectDroppedFiles(event.dataTransfer));}} className={`rounded-xl border border-dashed transition-colors ${dragging ? 'border-orange-500 bg-orange-50' : 'border-slate-300 bg-white'} ${uploading || full ? 'opacity-60' : 'hover:border-orange-300'}`}>
            <button type="button" disabled={uploading || full} onClick={() => input.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 px-3 py-5 text-sm text-slate-600 focus-visible:outline-orange-500">{uploading ? <Loader2 size={22} className="animate-spin"/> : <ImagePlus size={22}/>}<span>{uploading ? '正在上传…' : full ? '已达到图片数量上限' : dragging ? '松开即可上传图片' : '点击选择或拖拽图片到这里'}</span>{!uploading && !full && <span className="text-xs text-slate-500">支持一次添加多张</span>}</button>
            <input ref={input} aria-label="上传日记图片" type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" disabled={uploading || full} className="sr-only" onChange={event => {const files = Array.from(event.target.files || []); if (files.length) onUpload(files); event.target.value = '';}}/>
        </div><button type="button" disabled={uploading || full} onClick={() => setLibraryOpen(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:border-orange-300 hover:bg-orange-50 disabled:opacity-40"><Images size={17}/>从图片文集选择</button>
        {libraryOpen && <DiaryLibraryPicker existing={draft.imageAssetIds} onClose={() => setLibraryOpen(false)} onAdd={ids => onChange(diaryImagePatch([...new Set([...draft.imageAssetIds, ...ids])]))}/>}
        <p className="mt-2 text-xs leading-5 text-slate-500">最多 {MAX_DIARY_IMAGES} 张，每张最大 10 MB。支持 JPG / PNG / GIF / WebP。上传后存入资源库，保存日记后建立关联。</p>
    </div>;
}
