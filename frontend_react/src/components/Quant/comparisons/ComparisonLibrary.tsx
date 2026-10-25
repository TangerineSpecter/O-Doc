import {useState} from 'react';
import {ArrowLeft, RefreshCw} from 'lucide-react';
import type {QuantFactorCandidate} from '../../../types/api/quant';
import type {QuantComparison, QuantFactorMerge} from '../../../types/api/quantComparison';
import type {QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {useQuantComparisons} from '../../../hooks/useQuantComparisons';
import {quantApi} from '../../../api/quant';
import {comparisonVerdicts} from '../../../utils/quantComparison';
import {quantDate} from '../../../utils/quant';
import {QuantButton, QuantEmpty, cardClass} from '../ui';
import {ComparisonPrepare} from './ComparisonPrepare';
import {ComparisonDetail} from './ComparisonDetail';
import {EquivalenceGroups} from './EquivalenceGroups';
import {MergeActionDialog} from './MergeActionDialog';

export function ComparisonLibrary({collection, initialCandidate, initialId = '', register, request, close, openSource}: {
    collection: string; initialCandidate?: QuantFactorCandidate; initialId?: string; register: QuantRegisterDraft;
    request: (action: () => void) => void; close: () => void; openSource: (value: Pick<QuantFactorCandidate, 'entryId' | 'reportId'>) => void;
}) {
    const [factorId, setFactorId] = useState(initialCandidate?.id || ''), [offset, setOffset] = useState(0), [selected, setSelected] = useState(initialId);
    const [creating, setCreating] = useState(false), [merging, setMerging] = useState<QuantComparison | null>(null), [withdrawing, setWithdrawing] = useState<QuantFactorMerge | null>(null);
    const state = useQuantComparisons(collection, factorId, offset, selected);
    const save = (value: QuantComparison) => {setCreating(false); setSelected(value.id); setOffset(0); state.reload();};
    const openComparison = (id: string) => request(() => setSelected(id));
    const openCandidate = (id: string) => void state.act(async () => {const factor = await quantApi.factor(collection, id); request(() => openSource(factor));});
    return <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6"><div className="mx-auto max-w-6xl space-y-5">
        <section className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">候选对照与逻辑分组</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">固定行情和各自输入参数，保留完整输出范围与差异。样本内一致后，可人工建立可撤销分组；每项原候选和历史独立保留。</p></div><div className="flex flex-wrap gap-2"><QuantButton primary onClick={() => request(() => setCreating(true))}>新建固定样本对照</QuantButton><QuantButton onClick={close}><ArrowLeft size={14}/>返回因子库</QuantButton><QuantButton aria-label="刷新对照证据" disabled={state.loading} onClick={state.reload}><RefreshCw size={15}/></QuantButton></div></div>
            {factorId && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500"><span>仅看{initialCandidate?.curation.name || '当前候选'}的直接对照与合并。</span><QuantButton onClick={() => {setFactorId(''); setSelected(''); setOffset(0);}}>查看全部对照与历史</QuantButton></div>}
        </section>
        {state.actionError && <p role="alert" className="text-sm text-red-600">{state.actionError}</p>}
        {state.loading ? <div role="status" className={`${cardClass} text-sm text-slate-500`}>正在加载对照与分组记录…</div> : state.error ? <div role="alert" className={`${cardClass} space-y-3 text-sm text-red-600`}><p>{state.error}</p><QuantButton onClick={state.reload}>重试</QuantButton></div> : <>
            {!state.items.length && !state.detail ? <QuantEmpty title="还没有固定样本对照" description="选择两个候选和一份已有行情，分别确认实际参数及输入映射。相同名称、表达式或语义相似不会自动建立证据合并。"/> : <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><div className="space-y-2" aria-label="固定样本对照列表">{state.items.map(row => <button key={row.id} onClick={() => openComparison(row.id)} aria-pressed={state.detail?.id === row.id} className={`w-full rounded-2xl border p-4 text-left ${state.detail?.id === row.id ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}><h3 className="break-words text-sm font-semibold">{row.name}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{comparisonVerdicts[row.verdict]}<br/>{quantDate(row.createdAt)}</p></button>)}</div>{state.detail && <ComparisonDetail comparison={state.detail} merge={() => setMerging(state.detail!)} openCandidate={openCandidate}/>}</div>}
            <EquivalenceGroups value={state.merges} openComparison={openComparison} withdraw={merge => setWithdrawing(merge)}/>
            {Math.max(state.total, state.merges.total) > 20 && <div className="flex justify-end gap-3"><QuantButton disabled={!offset} onClick={() => {setSelected(''); setOffset(value => Math.max(0, value - 20));}}>上一页记录</QuantButton><QuantButton disabled={offset + 20 >= Math.max(state.total, state.merges.total)} onClick={() => {setSelected(''); setOffset(value => value + 20);}}>下一页记录</QuantButton></div>}
        </>}
    </div>
        {creating && <ComparisonPrepare collection={collection} initial={initialCandidate} register={register} close={() => request(() => setCreating(false))} saved={save}/>}
        {merging && <MergeActionDialog collection={collection} comparison={merging} register={register} close={() => request(() => setMerging(null))} saved={() => {setMerging(null); state.reload();}}/>}
        {withdrawing && <MergeActionDialog collection={collection} merge={withdrawing} register={register} close={() => request(() => setWithdrawing(null))} saved={() => {setWithdrawing(null); state.reload();}}/>}
    </div>;
}
