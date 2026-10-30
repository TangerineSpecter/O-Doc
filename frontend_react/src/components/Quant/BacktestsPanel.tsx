import type {QuantWorkspace} from '../../types/api/quantReading';
import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Edit3, Plus, Trash2 } from 'lucide-react';
import { quantApi } from '../../api/quant';
import { Select } from '../common/Select';
import ConfirmationModal from '../common/ConfirmationModal';
import { QuantButton, QuantEmpty, QuantField, QuantModal, cardClass, inputClass } from './ui';
import { quantVersionLabel as versionLabel } from '../../utils/quant';
import { quantDate } from '../../utils/quant';
import { useQuantDraftRegistration, type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantBacktest, QuantBacktestInput } from '../../types/api/quant';

export function BacktestsPanel({
    entry,
    collection,
    controller,
    register,
    request,
}: {
    entry: QuantWorkspace;
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    request: (next: () => void) => void;
}) {
    const [editing, setEditing] = useState<QuantBacktest | 'new' | null>(null);
    const [removing, setRemoving] = useState<QuantBacktest | null>(null);
    const versions = entry.implementationHeaders.flatMap((implementation) =>
        (entry.versionHeaders[implementation.id]||[]).map((version) => ({ version, implementation })),
    );
    return (
        <div className="space-y-5">
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">回测记录</h2>
                        <p className="mt-1 text-xs text-slate-400">记录外部平台运行条件与证据，每次实验独立保留。</p>
                    </div>
                    <QuantButton primary onClick={() => setEditing('new')}>
                        <Plus size={15} />
                        记录回测
                    </QuantButton>
                </div>
            </section>
            {entry.backtests.length ? (
                entry.backtests.map((backtest) => {
                    const reference = versions.find((item) => item.version.id === backtest.versionId);
                    const attachments = entry.attachments.filter((item) => item.backtestId === backtest.id);
                    return (
                        <article key={backtest.id} className={cardClass}>
                            <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 pb-4">
                                <div className="rounded-xl bg-orange-50 p-2.5 text-orange-500 shadow-2xs">
                                    <BarChart3 size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="break-words text-base font-bold text-slate-900">{backtest.name}</h3>
                                        {backtest.symbol && (
                                            <span className="rounded-md bg-orange-50 px-2 py-0.5 font-mono text-xs font-semibold text-orange-700">
                                                {backtest.symbol}
                                            </span>
                                        )}
                                        {backtest.timeframe && (
                                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                {backtest.timeframe}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 break-words text-xs text-slate-400">
                                        {reference
                                            ? versionLabel(reference.implementation, reference.version)
                                            : '代码版本未知'}{' '}
                                        · {quantDate(backtest.createdAt)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <QuantButton
                                        size="sm"
                                        aria-label={`编辑回测 ${backtest.name}`}
                                        onClick={() => setEditing(backtest)}
                                    >
                                        <Edit3 size={14} />
                                        编辑
                                    </QuantButton>
                                    <QuantButton
                                        size="sm"
                                        danger
                                        aria-label={`删除回测 ${backtest.name}`}
                                        onClick={() => setRemoving(backtest)}
                                    >
                                        <Trash2 size={14} />
                                    </QuantButton>
                                </div>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                                {[
                                    ['标的', backtest.symbol],
                                    ['周期', backtest.timeframe],
                                    ['开始时间', backtest.startDate],
                                    ['结束时间', backtest.endDate],
                                ].map(([label, value]) => (
                                    <div key={label} className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3">
                                        <dt className="text-[11px] font-semibold text-slate-400">{label}</dt>
                                        <dd className="mt-1 break-words font-medium text-slate-800">{value || '未填写'}</dd>
                                    </div>
                                ))}
                            </dl>
                            {backtest.metrics.length ? (
                                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                                    {backtest.metrics.map((metric, index) => (
                                        <div
                                            key={index}
                                            className="rounded-xl border border-orange-200/60 bg-gradient-to-br from-orange-50/40 via-white to-white p-3.5 shadow-2xs"
                                        >
                                            <p className="truncate text-xs font-medium text-slate-500">
                                                {metric.name || '未命名指标'}
                                            </p>
                                            <p className="mt-1.5 break-words font-mono text-lg font-extrabold text-slate-900">
                                                {metric.value || '未填写'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-4 text-xs text-slate-400">指标未填写</p>
                            )}
                            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200/70 bg-slate-50/60 p-4 text-xs sm:grid-cols-2">
                                <p className="whitespace-pre-wrap leading-6 text-slate-600">
                                    <span className="font-bold text-slate-700">参数：</span>
                                    {backtest.parameters || '未填写'}
                                </p>
                                <p className="whitespace-pre-wrap leading-6 text-slate-600">
                                    <span className="font-bold text-slate-700">费用假设：</span>
                                    {backtest.fees || '未填写'}
                                </p>
                            </div>
                            <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
                                <p className="mb-1 text-xs font-bold text-slate-400">实验结论与备注</p>
                                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                                    {backtest.conclusion || '尚未记录结论'}
                                </p>
                            </div>
                            {attachments.length > 0 && (
                                <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700">
                                    关联附件：{attachments.map((item) => item.name).join('、')}
                                </p>
                            )}
                        </article>
                    );
                })
            ) : (
                <QuantEmpty
                    title="留住每次实验的条件与结论"
                    description="可以先归档不完整的结果。标的、参数、费用与代码版本日后补齐，未知值会明确显示。"
                >
                    <QuantButton onClick={() => setEditing('new')}>
                        <Plus size={15} />
                        记录第一次回测
                    </QuantButton>
                </QuantEmpty>
            )}
            {editing && (
                <BacktestModal
                    key={editing === 'new' ? 'new' : editing.id}
                    backtest={editing === 'new' ? null : editing}
                    entry={entry}
                    collection={collection}
                    controller={controller}
                    register={register}
                    close={() => request(() => setEditing(null))}
                    saved={() => setEditing(null)}
                />
            )}
            <ConfirmationModal
                isOpen={!!removing}
                onClose={() => setRemoving(null)}
                title="删除这次回测？"
                description="将移除这次回测记录。关联的脚本、报告与图片仍保留在研究附件中。"
                isLoading={controller.busy}
                onConfirm={async () => {
                    if (
                        removing &&
                        (await controller.safe(() => quantApi.removeBacktest(collection, entry.id, removing.id)))
                    )
                        setRemoving(null);
                }}
            />
        </div>
    );
}

function BacktestModal({
    backtest,
    entry,
    collection,
    controller,
    register,
    close,
    saved,
}: {
    backtest: QuantBacktest | null;
    entry: QuantWorkspace;
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    close: () => void;
    saved: () => void;
}) {
    const initial: QuantBacktestInput = {
        name: backtest?.name || '',
        versionId: backtest?.versionId || null,
        symbol: backtest?.symbol || '',
        timeframe: backtest?.timeframe || '',
        startDate: backtest?.startDate || '',
        endDate: backtest?.endDate || '',
        parameters: backtest?.parameters || '',
        fees: backtest?.fees || '',
        metrics: backtest?.metrics || [],
        conclusion: backtest?.conclusion || '',
    };
    const [draft, setDraft] = useState(initial);
    const [baseline, setBaseline] = useState(JSON.stringify(initial));
    const patch = (field: keyof QuantBacktestInput, value: string | null) =>
        setDraft((current) => ({ ...current, [field]: value }));
    const save = useCallback(async () => {
        if (!draft.name.trim()) {
            controller.setError('请填写回测名称');
            return false;
        }
        const data = {
            ...draft,
            name: draft.name.trim(),
            metrics: draft.metrics.filter((metric) => metric.name.trim() || metric.value.trim()),
        };
        const ok = await controller.safe(() => quantApi.backtest(collection, entry.id, data, backtest?.id));
        if (ok) {
            setBaseline(JSON.stringify(draft));
            saved();
        }
        return ok;
    }, [draft, controller, collection, entry.id, backtest?.id, saved]);
    useQuantDraftRegistration('backtest', JSON.stringify(draft) !== baseline, save, register, () =>
        setDraft(JSON.parse(baseline) as QuantBacktestInput),
    );
    const [implementationId,setImplementationId]=useState('');
    const ensureVersionHeader=controller.ensureVersionHeader,setReadError=controller.setError;
    useEffect(()=>{
        if(!backtest?.versionId)return;
        let alive=true;void ensureVersionHeader(backtest.versionId).then(row=>{if(alive)setImplementationId(row.implementationId);}).catch(cause=>setReadError(String(cause)));
        return()=>{alive=false;};
    },[backtest?.versionId,ensureVersionHeader,setReadError]);
    const versionOptions = [
        { value: '', label: '代码版本未知' },
        ...entry.implementationHeaders.flatMap((implementation) =>
            (entry.versionHeaders[implementation.id]||[]).map((version) => ({
                value: version.id,
                label: versionLabel(implementation, version),
            })),
        ),
    ];
    return (
        <QuantModal title={backtest ? '编辑回测记录' : '记录回测'} close={close} wide busy={controller.busy}>
            <label className="mb-4 block space-y-2 text-sm"><span>代码实现（用于选择版本）</span><Select menuPortal value={implementationId} options={[{value:'',label:'暂不指定'},...entry.implementationHeaders.map(row=>({value:row.id,label:row.name}))]} onChange={id=>{setImplementationId(id);void controller.safe(()=>controller.loadVersionHeaders(id),false);}}/></label>
            {implementationId&&controller.pages[`versions:${implementationId}`]?.hasMore&&<QuantButton onClick={()=>void controller.safe(()=>controller.moreVersions(implementationId),false)}>更多代码版本</QuantButton>}
            {controller.pages.implementations?.hasMore&&<QuantButton onClick={()=>void controller.safe(()=>controller.loadPage('implementations',true),false)}>更多代码实现</QuantButton>}
            <div className="grid gap-4 sm:grid-cols-2">
                <QuantField
                    label="回测名称"
                    value={draft.name}
                    onChange={(value) => patch('name', value)}
                    placeholder="例如：沪深 300 · 日线 · 样本外测试"
                    required
                />
                <label className="space-y-2 text-sm font-semibold text-slate-700">
                    <span className="block">关联代码版本</span>
                    <Select
                        menuPortal
                        value={draft.versionId || ''}
                        options={versionOptions}
                        onChange={(value) => patch('versionId', value || null)}
                    />
                </label>
                <QuantField label="标的 / 股票池" value={draft.symbol} onChange={(value) => patch('symbol', value)} />
                <QuantField
                    label="周期"
                    value={draft.timeframe}
                    onChange={(value) => patch('timeframe', value)}
                    placeholder="日线 / 1小时 / 15分钟"
                />
                <QuantField
                    type="date"
                    label="开始日期"
                    value={draft.startDate}
                    onChange={(value) => patch('startDate', value)}
                />
                <QuantField
                    type="date"
                    label="结束日期"
                    value={draft.endDate}
                    onChange={(value) => patch('endDate', value)}
                />
                <QuantField
                    label="参数"
                    value={draft.parameters}
                    onChange={(value) => patch('parameters', value)}
                    multiline
                    rows={3}
                />
                <QuantField
                    label="费用假设"
                    value={draft.fees}
                    onChange={(value) => patch('fees', value)}
                    multiline
                    rows={3}
                    placeholder="手续费、滑点、交易限制等"
                />
            </div>
            <section>
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">自填指标</h3>
                    <QuantButton
                        onClick={() =>
                            setDraft((current) => ({
                                ...current,
                                metrics: [...current.metrics, { name: '', value: '' }],
                            }))
                        }
                    >
                        <Plus size={14} />
                        添加指标
                    </QuantButton>
                </div>
                <div className="space-y-2">
                    {draft.metrics.map((metric, index) => (
                        <div key={index} className="flex gap-2">
                            <input
                                aria-label={`指标 ${index + 1} 名称`}
                                value={metric.name}
                                onChange={(e) =>
                                    setDraft((current) => ({
                                        ...current,
                                        metrics: current.metrics.map((item, at) =>
                                            at === index ? { ...item, name: e.target.value } : item,
                                        ),
                                    }))
                                }
                                placeholder="例如：夏普比率"
                                className={inputClass}
                            />
                            <input
                                aria-label={`指标 ${index + 1} 结果`}
                                value={metric.value}
                                onChange={(e) =>
                                    setDraft((current) => ({
                                        ...current,
                                        metrics: current.metrics.map((item, at) =>
                                            at === index ? { ...item, value: e.target.value } : item,
                                        ),
                                    }))
                                }
                                placeholder="数值与单位"
                                className={inputClass}
                            />
                            <QuantButton
                                danger
                                aria-label={`移除指标 ${index + 1}`}
                                onClick={() =>
                                    setDraft((current) => ({
                                        ...current,
                                        metrics: current.metrics.filter((_, at) => at !== index),
                                    }))
                                }
                            >
                                <Trash2 size={15} />
                            </QuantButton>
                        </div>
                    ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">指标按原报告填写，保留单位。不进行计算或推断。</p>
            </section>
            <QuantField
                label="结论与疑问"
                value={draft.conclusion}
                onChange={(value) => patch('conclusion', value)}
                multiline
            />
            <p className="text-xs text-slate-400">保存后，可在附件页上传报告或曲线图片，并关联这次回测。</p>
            <div className="flex justify-end gap-3">
                <QuantButton onClick={close} disabled={controller.busy}>
                    取消
                </QuantButton>
                <QuantButton primary onClick={() => void save()} disabled={controller.busy}>
                    保存回测
                </QuantButton>
            </div>
            {controller.error && (
                <p role="alert" className="text-sm text-red-600">
                    {controller.error}
                </p>
            )}
        </QuantModal>
    );
}
