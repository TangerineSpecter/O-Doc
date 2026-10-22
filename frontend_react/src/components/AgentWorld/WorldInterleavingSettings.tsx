import {DecisionProcessInfo} from './DecisionProcessInfo';
import {useWorldLifeConfig} from '../../hooks/useWorldLifeConfig';
import {useToast} from '../common/ToastProvider';
import type {LifeSettings} from '../../types/api/agentLife';

const timings: Array<{key: keyof Pick<LifeSettings, 'interleavingCheckMinutes' | 'interleavingDecisionMinutes' | 'interleavingWaitMinutes'>; label: string; fallback: number; max: number}> = [
    {key: 'interleavingCheckMinutes', label: '条件预检间隔', fallback: 5, max: 1440},
    {key: 'interleavingDecisionMinutes', label: '两次活动选择至少间隔', fallback: 30, max: 10080},
    {key: 'interleavingWaitMinutes', label: '选择暂不活动后的等待', fallback: 60, max: 10080},
];
export function WorldInterleavingSettings() {
    const state = useWorldLifeConfig();
    const toast = useToast();
    return <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div><h3 className="text-sm font-bold text-slate-800 flex items-center gap-1">空档活动<DecisionProcessInfo kind="interleaving"/></h3>
            <p className="mt-2 text-xs leading-6 text-slate-500">居民完成主日程规划后，可在空档选择美食、炼金、铁匠铺、钓鱼、迷宫探索或暂不活动。系统会为后续日程和已接任务保留体力。</p></div>
        {state.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
        {!state.config ? <p className="text-xs text-slate-500">{state.loading ? '正在加载设置…' : '设置加载失败'} <button type="button" onClick={state.refresh}>重新加载</button></p> : <>
            <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={state.config.settings.interleavingEnabled ?? false} onChange={e => state.field('interleavingEnabled', e.target.checked)} disabled={state.loading}/>启用自动穿插</label>
            <div className="grid gap-4 sm:grid-cols-3">{timings.map(({key, label, fallback, max}) => <label key={key} className="text-xs text-slate-600">{label}<div className="mt-2 flex items-center gap-2"><input className="w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2" type="number" min={1} max={max} value={state.config!.settings[key] ?? fallback} onChange={e => state.field(key, Number(e.target.value))}/><span className="shrink-0 whitespace-nowrap">分钟</span></div></label>)}</div>
            <p className="text-xs leading-6 text-slate-500">需要已配置的决策连接。没有可执行活动时不会调用模型；选择失败会保留进度并等待重试。已开始的探索或钓鱼延长时，主日程可顺延。执行记录显示在日程中。</p>
            <button type="button" disabled={state.loading} onClick={async () => {if (await state.save()) toast.success('穿插设置已保存');}} className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{state.loading ? '保存中…' : '保存设置'}</button>
        </>}
    </section>;
}
