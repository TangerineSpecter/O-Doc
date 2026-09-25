import {useEffect, useMemo, useState} from 'react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {Check, RotateCcw, Search, Sparkles, Trash2, X} from 'lucide-react';
import {
  cancelImageIndexJob, createImageIndexJob, getImageIndexJobs, removeImageIndexes,
  type Image, type ImageIndexJob, type ImageIndexSummary, type ImageIndexStatus,
} from '../../api/image';

const STATUS: Record<ImageIndexStatus, string> = {
  unrecognized: '未识图', recognized: '已识图，未索引', indexed: '已索引',
  needs_recognition: '图片已变更', needs_index: '需重建索引', failed: '处理失败',
};

interface Props {
  open: boolean;
  onClose: () => void;
  collId: string;
  images: Image[];
  summary: ImageIndexSummary | null;
  onRefresh: () => Promise<void>;
}

export default function ImageIndexManager({open, onClose, collId, images, summary, onRefresh}: Props) {
  useEscapeDismissal(open, onClose);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'unindexed' | 'failed'>('all');
  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [recent, setRecent] = useState<ImageIndexJob[]>([]);
  const active = summary?.job;

  useEffect(() => {
    if (!open) return;
    void getImageIndexJobs(collId).then(setRecent).catch(() => setRecent([]));
  }, [open, collId, active?.id]);

  const rows = useMemo(() => images.filter(image => {
    const status = summary?.statuses[image.imageId] || 'unrecognized';
    if (filter === 'unindexed' && status === 'indexed') return false;
    if (filter === 'failed' && status !== 'failed') return false;
    return !keyword.trim() || image.title.toLowerCase().includes(keyword.trim().toLowerCase());
  }), [images, summary, filter, keyword]);

  const run = async (mode: ImageIndexJob['mode'], all = false) => {
    setBusy(true); setMessage('');
    try {
      const job = await createImageIndexJob(collId, all ? 'all' : selected, mode);
      setMessage(`已提交 ${job.total} 张图片，后台将逐张处理。`);
      setSelected([]);
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交任务失败');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await removeImageIndexes(collId, selected);
      setMessage(`已移除 ${result.removed} 张图片的本机索引，识图描述仍保留。`);
      setSelected([]);
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '移除索引失败');
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!active) return;
    setBusy(true); setMessage('');
    try {
      await cancelImageIndexJob(active.id);
      setMessage('已请求停止；当前正在处理的图片完成后任务会结束。');
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '取消任务失败');
    } finally { setBusy(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div><h2 className="text-lg font-bold text-slate-900">图片索引管理</h2><p className="mt-1 text-xs text-slate-500">手动选择需要识图的照片；每张拍摄组照片独立处理。</p></div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="关闭索引管理"><X className="h-5 w-5"/></button>
        </header>
        <div className="border-b border-slate-100 bg-orange-50/50 px-5 py-3 text-xs text-slate-600">
          本机已索引 <strong className="text-orange-700">{summary?.indexed ?? 0}</strong> / {summary?.total ?? images.length} 张
          {active && <div className="mt-2 flex items-center justify-between gap-3"><span>{active.state === 'queued' ? '等待处理' : '正在处理'}：{active.completed} / {active.total} · 失败 {active.failed}</span><button disabled={busy || active.cancelRequested} onClick={() => void cancel()} className="font-semibold text-red-600 hover:underline disabled:opacity-50">{active.cancelRequested ? '正在停止' : '停止后续图片'}</button></div>}
          {!active && recent[0] && <p className="mt-1">上次任务：{recent[0].state === 'completed' ? '已完成' : recent[0].state === 'cancelled' ? '已取消' : recent[0].state} · 失败 {recent[0].failed} 张</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          {(['all', 'unindexed', 'failed'] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1 text-xs ${filter === value ? 'border-orange-200 bg-orange-50 font-semibold text-orange-700' : 'border-slate-200 text-slate-500 hover:border-orange-200'}`}>{value === 'all' ? '全部' : value === 'unindexed' ? '未索引' : '失败'}</button>)}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2"><Search className="h-3.5 w-3.5 text-slate-400"/><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="按标题筛选" className="h-8 w-28 bg-transparent text-xs outline-none sm:w-40"/></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {rows.map(image => {
            const checked = selected.includes(image.imageId);
            const status = summary?.statuses[image.imageId] || 'unrecognized';
            return <label key={image.imageId} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
              <input type="checkbox" checked={checked} onChange={() => setSelected(previous => checked ? previous.filter(id => id !== image.imageId) : [...previous, image.imageId])} className="accent-orange-500"/>
              <img src={image.imageUrl} alt="" className="h-11 w-11 rounded-lg bg-slate-100 object-cover"/>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{image.title}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${status === 'indexed' ? 'bg-lime-50 text-lime-700' : status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{STATUS[status]}</span>
            </label>;
          })}
          {rows.length === 0 && <p className="py-12 text-center text-sm text-slate-400">当前筛选下没有图片</p>}
        </div>
        <footer className="border-t border-slate-100 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button onClick={() => setSelected(rows.map(image => image.imageId))} className="font-semibold text-slate-600 hover:text-orange-600"><Check className="mr-1 inline h-3.5 w-3.5"/>选中当前列表</button>
            <button onClick={() => setSelected([])} className="text-slate-400 hover:text-slate-700">清空选择</button>
            <span className="text-slate-400">已选 {selected.length} 张</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy || Boolean(active) || !selected.length} onClick={() => void run('reuse')} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-45"><Sparkles className="mr-1 inline h-3.5 w-3.5"/>识图并建索引</button>
            <button disabled={busy || Boolean(active) || !selected.length} onClick={() => void run('index_only')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-45"><RotateCcw className="mr-1 inline h-3.5 w-3.5"/>仅重建向量</button>
            <button disabled={busy || Boolean(active) || !selected.length} onClick={() => void run('refresh')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-45">重新识图</button>
            <button disabled={busy || Boolean(active) || !selected.length} onClick={() => void remove()} className="rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-45"><Trash2 className="mr-1 inline h-3.5 w-3.5"/>移除索引</button>
            <button disabled={busy || Boolean(active) || !images.length} onClick={() => void run('reuse', true)} className="ml-auto rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-45">整个文集建索引</button>
          </div>
          {message && <p role="status" className="mt-2 text-xs text-slate-600">{message}</p>}
          {recent[0]?.failed > 0 && <p className="mt-2 text-xs text-red-600">{Object.entries(recent[0].failures).slice(0, 3).map(([id, reason]) => `${images.find(image => image.imageId === id)?.title || id}：${reason}`).join('；')}</p>}
        </footer>
      </div>
    </div>
  );
}
