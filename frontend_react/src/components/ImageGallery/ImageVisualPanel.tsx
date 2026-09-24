import {useEffect, useState} from 'react';
import {Images, Loader2, RotateCcw, Sparkles} from 'lucide-react';
import {
  createImageIndexJob, getImageVisualDetail, getSimilarImages, updateImageVisualDescription,
  type ImageSearchItem, type ImageVisualDetail,
} from '../../api/image';

interface Props {
  imageId: string;
  collId: string;
  status?: string;
  canManage: boolean;
  onViewSimilar: (imageId: string) => void;
  onIndexChanged: () => void;
}

export default function ImageVisualPanel({imageId, collId, status, canManage, onViewSimilar, onIndexChanged}: Props) {
  const [detail, setDetail] = useState<ImageVisualDetail | null>(null);
  const [similar, setSimilar] = useState<ImageSearchItem[]>([]);
  const [override, setOverride] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let live = true;
    void getImageVisualDetail(imageId).then(value => {
      if (!live) return;
      setDetail(value); setOverride(value.override || '');
      if (value.status === 'indexed') void getSimilarImages(imageId).then(result => { if (live) setSimilar(result.items); }).catch(() => {});
      else setSimilar([]);
    }).catch(() => { if (live) setMessage('视觉信息加载失败'); });
    return () => { live = false; };
  }, [imageId, status]);

  const start = async (mode: 'reuse' | 'refresh' | 'index_only') => {
    setBusy(true); setMessage('');
    try {
      await createImageIndexJob(collId, [imageId], mode);
      setMessage('已加入后台任务，可在索引管理中查看进度。');
      onIndexChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : '任务提交失败'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await updateImageVisualDescription(imageId, override);
      setDetail(previous => previous ? {...previous, override, status: result.status} : previous);
      setEditing(false); setMessage('已保存修正；已有索引将在后台更新。');
      onIndexChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-xl border border-orange-100 bg-orange-50/40 p-3.5 text-sm">
    <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Sparkles className="h-4 w-4 text-orange-500"/>画面检索</h3><span className="text-[11px] text-slate-500">{detail?.status === 'indexed' ? '已索引' : detail?.status === 'needs_recognition' ? '需重新识图' : detail?.status === 'needs_index' ? '需重建索引' : detail?.status === 'failed' ? '处理失败' : detail?.status === 'recognized' ? '已识图，未索引' : '未识图'}</span></div>
    {detail?.model && <p className="mt-1 text-[11px] text-slate-400">识图模型：{detail.model}</p>}
    {detail && !editing && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{detail.override || detail.aiDescription || '这张图片尚未生成视觉描述。'}</p>}
    {detail?.status === 'failed' && detail.error && <p className="mt-2 text-xs text-red-600">{detail.error}</p>}
    {editing && <textarea value={override} onChange={event => setOverride(event.target.value)} maxLength={4000} rows={5} className="mt-2 w-full rounded-lg border border-orange-200 bg-white p-2 text-xs leading-5 outline-none focus:ring-2 focus:ring-orange-500/20" aria-label="修正视觉描述"/>}
    {canManage && <div className="mt-3 flex flex-wrap gap-2 text-xs">
      {editing ? <><button disabled={busy} onClick={() => void save()} className="rounded-md bg-orange-500 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">保存修正</button><button onClick={() => { setEditing(false); setOverride(detail?.override || ''); }} className="text-slate-500">取消</button></> : <>
        <button disabled={busy} onClick={() => void start(detail?.status === 'recognized' || detail?.status === 'needs_index' ? 'index_only' : 'reuse')} className="rounded-md bg-orange-500 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">{detail?.status === 'recognized' || detail?.status === 'needs_index' ? '建立索引' : '识图并建索引'}</button>
        {(detail?.aiDescription || detail?.override) && <button onClick={() => setEditing(true)} className="rounded-md border border-orange-200 bg-white px-2.5 py-1.5 text-orange-700">修正描述</button>}
        {detail?.aiDescription && <button disabled={busy} onClick={() => void start('refresh')} className="inline-flex items-center gap-1 text-slate-500 disabled:opacity-50"><RotateCcw className="h-3 w-3"/>重新识图</button>}
      </>}
    </div>}
    {message && <p role="status" className="mt-2 text-xs text-orange-700">{message}</p>}
    {similar.length > 0 && <div className="mt-4 border-t border-orange-100 pt-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Images className="h-3.5 w-3.5"/>相似画面</p><div className="flex gap-2 overflow-x-auto pb-1">{similar.map(item => <button key={item.image.imageId} onClick={() => onViewSimilar(item.image.imageId)} title={item.image.title} className="w-20 shrink-0 text-left"><img src={item.image.imageUrl} alt={item.image.title} className="h-16 w-20 rounded-md bg-white object-cover"/><span className="mt-1 block truncate text-[11px] text-slate-600">{item.image.title}</span></button>)}</div></div>}
    {busy && <Loader2 className="mt-2 h-3.5 w-3.5 animate-spin text-orange-500"/>}
  </section>;
}
