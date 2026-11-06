import {useEffect, useRef, useState} from 'react';
import {Download, X} from 'lucide-react';
import {getPerformanceDetail, downloadPerformanceReport} from '@/api/performance';
import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';
import type {PerformanceDetail as Detail} from '@/types/performance';
import {duration, percentage, statusName} from './format';

export function PerformanceDetail({id, onClose}: {id: string; onClose: () => void}) {
    const [data, setData] = useState<Detail | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const pending = useRef<AbortController | null>(null);
    useEscapeDismissal(true, onClose);
    useEffect(() => {
        const controller = new AbortController();
        pending.current = controller;
        void getPerformanceDetail(id, controller.signal).then(value => {if (!controller.signal.aborted) setData(value);}).catch(() => {if (!controller.signal.aborted) setError('样本读取失败，记录可能已清理。');});
        return () => controller.abort();
    }, [id]);
    const download = async () => {
        setBusy(true); setError('');
        try {await downloadPerformanceReport(id, pending.current?.signal);} catch {setError('诊断报告下载失败，请重试。');} finally {setBusy(false);}
    };
    return <div data-modal-scroll-lock className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
        <section role="dialog" aria-modal="true" aria-labelledby="performance-detail-title" className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col border border-slate-200 shadow-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
                <h2 id="performance-detail-title" className="font-semibold text-slate-900">性能记录明细</h2>
                <button aria-label="关闭性能明细" onClick={onClose} className="p-2 text-slate-500"><X size={18}/></button>
            </div>
            <div className="p-5 overflow-y-auto scrollbar-hide space-y-5 text-sm text-slate-700">
                {error && <p role="alert" className="text-red-600">{error}</p>}
                {!data && !error && <p role="status">正在读取诊断证据…</p>}
                {data && <>
                    <div><p className="font-mono break-all text-slate-900">{data.event.operation}</p><p className="mt-2 tabular-nums">{duration(data.event.durationMs)} · {statusName(data.event.status)} · {new Date(data.event.started * 1000).toLocaleString()}</p></div>
                    <dl className="grid grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4">
                        <div><dt className="text-slate-500">SQL 次数 / 累计调用</dt><dd>{data.event.sqlCount} 次 / {duration(data.event.sqlMs)}</dd></div>
                        <div><dt className="text-slate-500">发生时版本</dt><dd>{data.event.build.version || '未知'} · {data.event.build.commit?.slice(0, 8) || 'commit 未采集'}</dd></div>
                        <div><dt className="text-slate-500">模型首输出 / 服务端首块</dt><dd>{duration(data.event.firstOutputMs)} / {duration(data.event.firstChunkMs)}</dd></div>
                        <div><dt className="text-slate-500">同类全部结果错误率</dt><dd>{percentage(data.baseline.allResults.errorRatio)}（{data.baseline.allResults.count} 次）</dd></div>
                    </dl>
                    <div><h3 className="font-medium text-slate-900 mb-2">代码位置</h3>{data.event.source?.length ? data.event.source.map((source, index) => <p className="font-mono text-xs break-all" key={index}>{source.file}:{source.line} · {source.function}</p>) : <p className="text-slate-500">未采集到项目调用位置</p>}</div>
                    {data.event.sql && <div><h3 className="font-medium text-slate-900">SQL 指纹</h3><p className="font-mono text-xs break-all mt-2">{data.event.sql.fingerprint}</p><p className="mt-1 text-slate-500">{data.event.sql.templateReason || 'SQL 正文未采集'}</p></div>}
                    <div><h3 className="font-medium text-slate-900 mb-2">执行阶段</h3><p className="text-xs text-slate-500 mb-3">阶段可能重叠，不能直接相加。截断 {data.event.truncated || 0} 项。</p>
                        {data.event.children?.length ? data.event.children.map(child => <div key={child.id} className="py-3 border-t border-slate-100 flex justify-between gap-4"><div className="min-w-0"><p className="break-all font-mono text-xs">{child.operation}</p><p className="text-xs text-slate-500 mt-1">{statusName(child.status)}</p></div><span className="tabular-nums whitespace-nowrap">{duration(child.durationMs)}</span></div>) : <p className="text-slate-500">没有已保存的子阶段</p>}
                    </div>
                    <p className="text-xs text-slate-500">{data.baseline.note}</p>
                </>}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end"><button onClick={() => void download()} disabled={!data || busy} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm inline-flex items-center gap-2"><Download size={16}/>{busy ? '正在生成…' : '导出诊断报告'}</button></div>
        </section>
    </div>;
}
