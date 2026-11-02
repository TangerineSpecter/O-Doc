import {useState} from 'react';
import {X} from 'lucide-react';
export default function DiaryTagsInput({tags, onChange}: {tags: string[]; onChange: (tags: string[]) => void}) {
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const add = () => {
        const values = input.split(/[,，、\n]/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);
        const next = [...new Set([...tags, ...values])];
        if (next.length > 10 || next.some(t => t.length > 30)) {setError('最多 10 个标签，每个不超过 30 字'); return;}
        onChange(next); setInput(''); setError('');
    };
    return <div><label htmlFor="diary-tags" className="text-sm font-semibold">标签</label><div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">{tags.map(tag => <span key={tag} className="flex max-w-full items-center gap-1 break-all rounded-full bg-orange-50 px-2.5 py-1 text-xs text-orange-700">{tag}<button type="button" aria-label={`移除标签 ${tag}`} onClick={() => onChange(tags.filter(t => t !== tag))}><X size={12}/></button></span>)}<input id="diary-tags" value={input} onChange={e => setInput(e.target.value)} onBlur={add} onKeyDown={e => {if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' || e.key === ',' || e.key === '，') {e.preventDefault(); add();}}} placeholder="输入标签，按回车添加" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></div>{error ? <p role="alert" className="mt-1 text-xs text-red-600">{error}</p> : <p className="mt-2 text-xs text-slate-500">最多 10 个，支持逗号分隔。</p>}</div>;
}
