import {useRef, useState} from 'react';
import {ImageUp, Layers3, Loader2, Search, X} from 'lucide-react';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onReference: (file: File) => void;
  onClear: () => void;
  onManage: () => void;
  active: boolean;
  busy: boolean;
  canManage: boolean;
  indexed: number;
  total: number;
  error: string;
  semanticAvailable: boolean;
  resultCount: number;
}

export default function ImageSmartSearchBar({query, onQueryChange, onSearch, onReference, onClear, onManage, active, busy, canManage, indexed, total, error, semanticAvailable, resultCount}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState('');
  const submitFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setLocalError('请选择不超过 10 MB 的图片文件');
      return;
    }
    setLocalError('');
    onReference(file);
  };

  return (
    <section
      className={`mb-5 rounded-xl border bg-white/90 p-3.5 shadow-sm transition-colors sm:p-4 ${dragging ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200'}`}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); submitFile(event.dataTransfer.files[0]); }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/10" onSubmit={event => { event.preventDefault(); onSearch(); }}>
          <Search className="h-4 w-4 shrink-0 text-orange-500"/>
          <input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="描述画面，例如：紫发少女拿着法杖" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" aria-label="自然语言搜图"/>
          {active && <button type="button" onClick={onClear} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="清除搜图"><X className="h-4 w-4"/></button>}
          <button type="submit" disabled={busy || !query.trim()} className="shrink-0 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">{busy ? '搜索中' : '搜图'}</button>
        </form>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:border-orange-200 hover:text-orange-600 disabled:opacity-50"><ImageUp className="h-4 w-4"/>参考图</button>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={event => { submitFile(event.target.files?.[0]); event.target.value = ''; }}/>
          {canManage && <button type="button" onClick={onManage} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-100"><Layers3 className="h-4 w-4"/>索引管理</button>}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>本机已索引 <strong className="font-semibold text-slate-700">{indexed}</strong> / {total} 张</span>
        {active && <span>找到 {resultCount} 组图片{busy && <Loader2 className="ml-1 inline h-3 w-3 animate-spin"/>}</span>}
        {active && !semanticAvailable && <span className="text-amber-700">语义模型不可用，当前仅显示关键词结果</span>}
        {dragging && <span className="font-medium text-orange-600">松开以搜索相似画面</span>}
        {(error || localError) && <span role="alert" className="text-red-600">{error || localError}</span>}
      </div>
    </section>
  );
}
