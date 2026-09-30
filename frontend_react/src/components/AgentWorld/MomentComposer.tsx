import {compactMomentText} from '../../utils/socialText';
import {useRef, useState} from 'react';
import {ImagePlus, Send, X} from 'lucide-react';
import {uploadResource} from '../../api/resources';
import {publishMoment} from '../../api/social';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';

export default function MomentComposer({onPublished}: {onPublished: () => void}) {
    const [content, setContent] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const upload = async (files: FileList | null) => {
        if (!files || busy) return;
        if (images.length + files.length > 9) {setError('最多上传九张图片'); return;}
        setBusy(true); setError('');
        try {
            for (const file of Array.from(files)) {
                if (!file.type.startsWith('image/')) throw new Error('请选择图片');
                const row = await uploadResource(file, 'content');
                setImages(v => [...new Set([...v, row.id])]);
            }
        } catch (e) {setError(e instanceof Error ? e.message : '上传失败');}
        finally {setBusy(false); if (input.current) input.current.value = '';}
    };
    const send = async () => {
        if (busy || !content.trim()) return;
        setBusy(true); setError('');
        try {await publishMoment(compactMomentText(content), images); setContent(''); setImages([]); onPublished();}
        catch (e) {setError(e instanceof Error ? e.message : '发布失败');}
        finally {setBusy(false);}
    };
    return <section className="space-y-3">
        <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={3000} rows={5} disabled={busy}
            placeholder="今天发生了什么？分享一件小事，也可以抛出一个问题。" className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 focus:border-orange-300 text-sm leading-6 text-slate-700 outline-none"/>
        {images.length > 0 && <div className="mb-3 grid grid-cols-3 gap-2">{images.map(id => <div key={id} className="relative">
            <AuthenticatedResourceImage resourceId={id} alt="待发布图片" className="aspect-square w-full rounded-xl"/>
            <button type="button" disabled={busy} aria-label="移除图片" onClick={() => setImages(v => v.filter(i => i !== id))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1"><X className="h-3 w-3"/></button>
        </div>)}</div>}
        {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={e => void upload(e.target.files)}/>
            <button type="button" disabled={busy || images.length >= 9} onClick={() => input.current?.click()} className="flex items-center gap-2 text-xs text-slate-500 disabled:opacity-50"><ImagePlus className="h-4 w-4"/>添加图片 · {images.length}/9</button>
            <button type="button" disabled={busy || !content.trim()} onClick={() => void send()} className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"><Send className="h-3 w-3"/>{busy ? '处理中…' : '发布'}</button>
        </div>
    </section>;
}
