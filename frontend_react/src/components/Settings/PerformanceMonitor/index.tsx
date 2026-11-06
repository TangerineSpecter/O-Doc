import {useState} from 'react';
import {ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid} from 'recharts';
import {RefreshCw, Settings2, Trash2} from 'lucide-react';
import {Select} from '@/components/common/Select';
import ConfirmationModal from '@/components/common/ConfirmationModal';
import {clearPerformance} from '@/api/performance';
import {usePerformanceMonitor} from '@/hooks/usePerformanceMonitor';
import type {PerformanceKind} from '@/types/performance';
import {PerformanceDetail} from './PerformanceDetail';
import {PerformancePolicyDialog} from './PerformancePolicyDialog';
import {duration, kindNames, percentage, quantile, statusName} from './format';

const kinds: Exclude<PerformanceKind, ''>[] = ['request', 'stream', 'sql', 'ai', 'task', 'http'];
const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50';

export function PerformanceMonitor() {
    const [hours, setHours] = useState('24');
    const [kind, setKind] = useState<PerformanceKind>('request');
    const [page, setPage] = useState(1);
    const [detail, setDetail] = useState<string | null>(null);
    const [policyOpen, setPolicyOpen] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const {data, loading, rankingsError, samplesError, databaseError, rankingsLoading, samplesLoading, samplesReady, error, partial, refresh, reset} = usePerformanceMonitor(Number(hours), kind, page);
    const metrics = data?.overview.byKind[kind as Exclude<PerformanceKind, ''>];
    const points = data?.overview.trend.filter(point => point.kind === kind) ?? [];
    const trend = points.flatMap((point, index) => index && point.at - points[index - 1].at > (data?.overview.trendStepSeconds || 60) * 1.5
        ? [{at: points[index - 1].at + (data?.overview.trendStepSeconds || 60), averageMs: null}, point] : [point]);
    const clear = async () => {
        setBusy(true); setActionError('');
        try {await clearPerformance(); setClearOpen(false); setPage(1); reset();} catch {setActionError('清空失败，请重试。');} finally {setBusy(false);}
    };
    return <div className="space-y-5 text-slate-700" data-performance-monitor>
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-wrap justify-between items-start gap-4">
                <div><h2 className="text-lg font-semibold text-slate-900">性能监控</h2><p className="text-sm text-slate-500 mt-1">从慢记录定位耗时，导出证据交给代码助手分析。</p></div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={hours} onChange={value => {setHours(value); setPage(1);}} options={[{value: '1', label: '最近 1 小时'}, {value: '24', label: '最近 24 小时'}, {value: '168', label: '最近 7 天'}]} ariaLabel="性能统计时间范围"/>
                    <button className={button} onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>刷新</button>
                    <button className={button} disabled={!data} onClick={() => setPolicyOpen(true)}><Settings2 size={15}/>采集设置</button>
                </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className={data?.overview.policy.enabled ? 'text-lime-700' : 'text-slate-500'}>{data?.overview.policy.enabled ? '● 正在采集' : '○ 采集已暂停'}</span>
                <span>仅当前部署 · 不参与 WebDAV</span>
                {data && <span>策略 v{data.overview.policy.version} · 本进程已丢弃 {data.overview.health.dropped} 条</span>}
                <span>最近落盘：{data?.overview.health.lastFlush ? new Date(data.overview.health.lastFlush * 1000).toLocaleTimeString() : '未获取'}</span>
            </div>
            {data?.overview.health.error && <p className="mt-3 text-sm text-amber-700">{data.overview.health.error}</p>}
            {partial && <p className="mt-3 text-sm text-amber-700">当前查询已达到读取上限，统计只代表已读取数据，请缩短时间范围。</p>}
        </section>
        <div role="tablist" aria-label="监控类型" className="flex flex-wrap gap-1 bg-slate-100 rounded-2xl p-1 w-fit">{kinds.map(value => <button role="tab" aria-selected={kind === value} key={value} onClick={() => {setKind(value); setPage(1);}} className={`rounded-xl px-3 py-2 text-sm ${kind === value ? 'bg-white text-orange-600 font-medium' : 'text-slate-500 hover:text-slate-800'}`}>{kindNames[value]}</button>)}</div>
        {(error || actionError) && <div role="alert" className="bg-red-50 text-red-700 rounded-2xl p-4 text-sm flex justify-between gap-4"><span>{error || actionError}</span><button onClick={() => void refresh()} className="underline">重试</button></div>}
        {loading && !data && <p role="status" className="p-6 text-sm text-slate-500">正在读取性能统计…</p>}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">{kindNames[kind]} · 当前时间范围</h3>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-5 tabular-nums">
                {[["调用次数", data ? metrics?.count?.toLocaleString() ?? '0' : '—'], ['近似 P95（区间）', quantile(metrics?.p95)], ['慢操作比例', percentage(metrics?.slowRatio)], ['错误比例', percentage(metrics?.errorRatio)]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="text-xl font-semibold text-slate-900 mt-2">{value}</dd></div>)}
            </dl>
            <p className="text-xs text-slate-500 mt-5">P95 按固定耗时桶估算；错误率包含同类全部结果。慢不等于失败，取消不计系统错误。</p>
            {metrics && ['invalid', 'incompatible'].includes(metrics.histogramStatus || '') && <p className="mt-2 text-xs text-amber-700">当前范围的耗时分布版本不兼容或数据不完整，P95/P99 暂不可用；次数和总耗时仍可查看。</p>}
            {trend.length > 0 && <div className="mt-5"><h4 className="text-xs text-slate-500 mb-3">平均耗时趋势（ms；无采样区间不插值）</h4><div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><CartesianGrid stroke="#f1f5f9" vertical={false}/><XAxis dataKey="at" tickFormatter={value => new Date(Number(value) * 1000).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} tick={{fontSize: 11}} minTickGap={35}/><YAxis width={45} tick={{fontSize: 11}}/><Tooltip labelFormatter={value => new Date(Number(value) * 1000).toLocaleString()}/><Line name="平均耗时（ms）" type="linear" dataKey="averageMs" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false}/></LineChart></ResponsiveContainer></div></div>}
        </section>
        {data?.overview.inflight.length ? <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"><h3 className="font-semibold text-slate-900 mb-3">正在执行 / 结果未知</h3>{data.overview.inflight.map(item => <div key={item.id} className="flex justify-between gap-4 text-xs py-2"><span className="font-mono break-all">{item.operation}</span><span className="whitespace-nowrap">{item.status === 'unknown' ? '心跳过期，结果未知' : `已开始 ${duration(item.elapsedMs)}`}</span></div>)}</section> : null}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-4">累计耗时排行</h3>
            {(rankingsError || (!data && error)) && !data?.rankings.length ? <p className="text-sm text-red-600 py-5">排行暂未加载，请重试。</p> : rankingsLoading && !data?.rankings.length ? <p role="status" className="text-sm text-slate-500 py-5">正在读取当前筛选的排行…</p> : data?.rankings.length ? <div className="overflow-x-auto scrollbar-hide"><table className="w-full text-sm"><thead><tr className="text-xs text-slate-500 border-b border-slate-100"><th className="text-left font-medium pb-3">操作 / 版本</th>{['次数', '累计耗时', '平均耗时', '近似 P95', '错误率'].map(title => <th key={title} className="text-right font-medium pb-3 pl-5 whitespace-nowrap">{title}</th>)}</tr></thead><tbody>{data.rankings.map((row, index) => <tr key={index} className="border-b last:border-0 border-slate-100"><td className="py-3 max-w-[360px]"><p className="font-mono text-xs break-all">{row.method} {row.operation}</p><p className="text-xs text-slate-500 mt-1">{row.build.version || '未知版本'} · 策略 v{row.policyVersion}</p></td>{[row.count, duration(row.totalMs), duration(row.averageMs), quantile(row.p95), percentage(row.errorRatio)].map((value, col) => <td className="text-right tabular-nums py-3 pl-5 whitespace-nowrap" key={col}>{value}</td>)}</tr>)}</tbody></table></div> : <p className="text-sm text-slate-500 py-5">尚无统计。开启采集后，执行相关操作，再刷新查看。</p>}
        </section>
        {kind === 'sql' && <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"><h3 className="font-semibold text-slate-900">PostgreSQL 原生统计</h3><p className="text-sm text-slate-500 mt-2">{databaseError ? '数据库状态读取失败，请重试。' : data?.database.reason || data?.database.gap || data?.database.selection || '正在读取扩展状态…'}</p>{data?.database.rows?.length ? <div className="mt-4 space-y-2">{data.database.rows.slice(0, 10).map(row => <div key={row.identity} className="flex justify-between gap-4 border-t border-slate-100 pt-2 text-xs"><span className="font-mono break-all">{row.identity}</span><span className="tabular-nums whitespace-nowrap">{row.calls} 次 · 累计 {duration(row.totalMs)}</span></div>)}</div> : null}<p className="text-xs text-slate-500 mt-3">原生累计快照与应用侧排行口径不同，不合并计数。</p></section>}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4"><h3 className="font-semibold text-slate-900">诊断样本 <span className="text-slate-500 text-sm font-normal">{samplesReady && data ? data.total : '—'} 条</span></h3><button className={button} onClick={() => setClearOpen(true)}><Trash2 size={14}/>清空监控数据</button></div>
            <p className="text-xs text-slate-500 mb-3">保留慢操作、失败和少量正常样本。打开一条记录可导出诊断包。</p>
            {(samplesError || (!data && error)) && !data?.samples.length ? <p className="text-sm text-red-600 py-5">样本暂未加载，请重试。</p> : samplesLoading && !samplesReady ? <p role="status" className="text-sm text-slate-500 py-5">正在读取当前页样本…</p> : data?.samples.length ? <div>{data.samples.map(sample => <button key={sample.id} data-performance-sample={sample.id} onClick={() => setDetail(sample.id)} className="w-full text-left py-4 border-t border-slate-100 flex justify-between items-start gap-4 hover:bg-slate-50"><div className="min-w-0"><p className="font-mono text-xs break-all text-slate-800">{sample.operation}</p><p className="text-xs text-slate-500 mt-2">{new Date(sample.created).toLocaleString()} · {statusName(sample.status)}</p></div><span className="tabular-nums text-sm whitespace-nowrap text-orange-700">{duration(sample.durationMs)}</span></button>)}</div> : <p className="text-sm text-slate-500 py-5">当前范围没有已保存的诊断样本。</p>}
            <div className="flex justify-end gap-3 items-center mt-4 text-xs text-slate-500"><button className={button} disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} 页</span><button className={button} disabled={!data || page * 20 >= data.total || loading} onClick={() => setPage(value => value + 1)}>下一页</button></div>
        </section>
        {detail && <PerformanceDetail key={detail} id={detail} onClose={() => setDetail(null)}/>}
        {policyOpen && data && <PerformancePolicyDialog policy={data.overview.policy} onClose={() => setPolicyOpen(false)} onSaved={() => void refresh()}/>}
        <ConfirmationModal isOpen={clearOpen} onClose={() => !busy && setClearOpen(false)} onConfirm={clear} isLoading={busy} type="danger" title="清空性能监控数据" description="将删除当前部署已保存的性能统计、样本和数据库快照。采集策略保留，业务数据不受影响。" confirmText="确认清空"/>
    </div>;
}
