import {useEffect, useRef, useState} from 'react';
import {ImagePlus, Upload, UploadCloud} from 'lucide-react';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ACCEPTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

export function ItemIconUploadForm({initialName = '', busy, onUpload}: {
    initialName?: string; busy: boolean; onUpload: (file: File, name: string) => Promise<boolean>;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState(initialName);
    const [preview, setPreview] = useState('');
    const [dragging, setDragging] = useState(false);
    const [fileError, setFileError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const selectFile = (next: File | undefined) => {
        if (!next) return;
        const supported = ACCEPTED_IMAGE_TYPES.has(next.type) || (!next.type && ACCEPTED_IMAGE_EXTENSIONS.test(next.name));
        if (!supported) {
            setFileError('仅支持 PNG、JPEG 或 WebP 图片。');
            return;
        }
        if (next.size > MAX_FILE_SIZE) {
            setFileError('图片不能超过 20MB。');
            return;
        }
        setFileError('');
        setFile(next);
        setPreview(URL.createObjectURL(next));
        if (!name.trim()) setName(next.name.replace(/\.[^.]+$/, ''));
    };

    useEffect(() => () => {if (preview) URL.revokeObjectURL(preview);}, [preview]);

    return <div
        onDragEnter={event => {
            if (busy || !Array.from(event.dataTransfer.types).includes('Files')) return;
            event.preventDefault();
            setDragging(true);
        }}
        onDragOver={event => {
            if (busy || !Array.from(event.dataTransfer.types).includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDragging(true);
        }}
        onDragLeave={event => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={event => {
            event.preventDefault();
            setDragging(false);
            if (!busy) selectFile(event.dataTransfer.files[0]);
        }}
        className={`rounded-xl border bg-slate-50/50 p-4 transition-colors ${dragging ? 'border-orange-400 bg-orange-50/70 ring-2 ring-orange-100' : 'border-slate-200'}`}
    >
        <div className="flex flex-col gap-4 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} aria-label={file ? `更换图片，当前为 ${file.name}` : '拖入图片或点击选择'} className={`grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${dragging ? 'border-orange-400' : 'border-slate-300 hover:border-orange-300'}`}>
                {preview ? <img src={preview} alt="上传图片预览" className="h-full w-full object-contain"/> : <span className="flex flex-col items-center gap-1 text-slate-400"><ImagePlus className="h-6 w-6"/><span className="text-[10px]">拖入图片</span></span>}
            </button>
            <div className="min-w-0 flex-1 space-y-2">
                <label className="block text-xs text-slate-600">图标名称<input value={name} maxLength={200} disabled={busy} onChange={event => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/></label>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="hidden" onChange={event => {
                    selectFile(event.target.files?.[0]);
                    event.target.value = '';
                }}/>
                <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:border-orange-200 hover:bg-orange-50/50 disabled:opacity-50">
                    <ImagePlus size={14}/>{file ? file.name : '选择 PNG / JPEG / WebP 图片'}
                </button>
                <p className="text-[11px] leading-5 text-slate-400">自动压缩为 256 × 256 图标，保留透明背景，只保存小图。最大 20MB，不支持动画。</p>
                {fileError && <p role="alert" className="text-[11px] text-red-600">{fileError}</p>}
            </div>
        </div>
        <button type="button" disabled={busy || !file || !name.trim()} onClick={() => {if (file) void onUpload(file, name.trim());}} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40">
            <Upload size={14}/>{busy ? '正在处理…' : '上传并压缩'}
        </button>
        {dragging && <p aria-live="polite" className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-orange-700"><UploadCloud size={14}/>松开鼠标即可添加图片</p>}
    </div>;
}
