import {useEffect, useState} from 'react';
import {ImagePlus, Upload} from 'lucide-react';

export function ItemIconUploadForm({initialName = '', busy, onUpload}: {
    initialName?: string; busy: boolean; onUpload: (file: File, name: string) => Promise<boolean>;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState(initialName);
    const [preview, setPreview] = useState('');
    useEffect(() => () => {if (preview) URL.revokeObjectURL(preview);}, [preview]);
    return <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-xl border border-dashed border-slate-300 bg-white">
                {preview ? <img src={preview} alt="上传图片预览" className="h-full w-full object-contain"/> : <ImagePlus className="h-7 w-7 text-slate-300"/>}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
                <label className="block text-xs text-slate-600">图标名称<input value={name} maxLength={200} disabled={busy} onChange={event => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/></label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    <ImagePlus size={14}/>{file ? file.name : '选择 PNG / JPEG / WebP 图片'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="hidden" onChange={event => {
                        const next = event.target.files?.[0]; if (next) {setFile(next); setPreview(URL.createObjectURL(next)); if (!name.trim()) setName(next.name.replace(/\.[^.]+$/, ''));}
                    }}/>
                </label>
                <p className="text-[11px] leading-5 text-slate-400">自动压缩为 256 × 256 图标，保留透明背景，只保存小图。最大 20MB，不支持动画。</p>
            </div>
        </div>
        <button type="button" disabled={busy || !file || !name.trim()} onClick={() => {if (file) void onUpload(file, name.trim());}} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40">
            <Upload size={14}/>{busy ? '正在处理…' : '上传并压缩'}
        </button>
    </div>;
}
