import {useState} from 'react';
import {X} from 'lucide-react';
import {savePerformancePolicy} from '@/api/performance';
import type {PerformancePolicy} from '@/types/performance';
import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';

const fields = [
    ['requestMs', '普通接口慢阈值（ms）'], ['sqlMs', '单次 SQL 慢阈值（ms）'],
    ['sqlTotalMs', 'SQL 累计慢阈值（ms）'], ['sqlCount', 'SQL 次数提示阈值'],
    ['streamMs', '流式总时长阈值（ms）'], ['firstChunkMs', '流式首块阈值（ms）'],
    ['aiMs', 'AI 总时长阈值（ms）'], ['firstOutputMs', 'AI 首输出阈值（ms）'],
    ['taskMs', '任务执行阈值（ms）'], ['httpMs', '外部调用阈值（ms）'],
    ['sampleDays', '明细保留天数'], ['aggregateDays', '统计保留天数'], ['maxMb', '容量预算（MiB）'],
] as const;

export function PerformancePolicyDialog({policy, onClose, onSaved}: {policy: PerformancePolicy; onClose: () => void; onSaved: () => void}) {
    const [draft, setDraft] = useState(policy);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEscapeDismissal(!busy, onClose);
    const save = async () => {
        const changes: Partial<PerformancePolicy> = {enabled: draft.enabled};
        for (const [key] of fields) {
            if (!Number.isInteger(draft[key]) || draft[key] < 1) {setError('所有阈值与保留策略必须是正整数。'); return;}
            changes[key] = draft[key];
        }
        setBusy(true); setError('');
        try {await savePerformancePolicy(changes); onSaved(); onClose();} catch {setError('保存失败，请检查数值范围或稍后重试。');} finally {setBusy(false);}
    };
    return <div data-modal-scroll-lock className="fixed inset-0 z-[100] bg-black/40 p-4 flex items-center justify-center">
        <section role="dialog" aria-modal="true" aria-labelledby="performance-policy-title" className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl max-h-[88vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between"><h2 id="performance-policy-title" className="font-semibold">性能采集设置</h2><button disabled={busy} onClick={onClose} aria-label="关闭采集设置"><X size={18}/></button></div>
            <div className="p-5 overflow-y-auto scrollbar-hide space-y-5">
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({...draft, enabled: e.target.checked})}/>启用当前部署的性能采集</label>
                <p className="text-xs text-slate-500">仅本机保存，不参与 WebDAV。策略约 5 秒内传播到其他工作进程；保留期限和容量可能触发清理。</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{fields.map(([key, label]) => <label key={key} className="text-xs text-slate-600 space-y-2"><span>{label}</span><input type="number" min={1} value={draft[key]} onChange={e => setDraft({...draft, [key]: Number(e.target.value)})} className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"/></label>)}</div>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end"><button disabled={busy} onClick={() => void save()} className="rounded-xl bg-orange-500 text-white px-4 py-2 text-sm disabled:opacity-50">{busy ? '保存中…' : '保存采集设置'}</button></div>
        </section>
    </div>;
}
