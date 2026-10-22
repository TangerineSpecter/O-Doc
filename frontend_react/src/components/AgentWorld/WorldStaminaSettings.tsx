import {BatteryCharging, Loader2, Save} from 'lucide-react';
import {useWorldStaminaSettings} from '../../hooks/useWorldStaminaSettings';

export function WorldStaminaSettings() {
    const state = useWorldStaminaSettings();
    return (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <BatteryCharging className="h-5 w-5"/>
                </div>
                <div>
                    <h3 className="text-sm font-bold text-slate-800">体力恢复</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">统一设置所有居民的自然恢复速度，体力上限保持 100 点。</p>
                </div>
            </div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-xs leading-5 text-slate-500">
                <p>按实际经过时间持续恢复，无需等待整点。设置为 0 可暂停自然恢复。</p>
                <p>新速度从保存时开始生效，已经恢复的体力保持不变。设置随 WebDAV 备份和同步。</p>
            </div>
            <form className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-end sm:justify-between" onSubmit={event => { event.preventDefault(); void state.save(); }}>
                <div className="w-full max-w-sm space-y-2">
                    <label htmlFor="world-stamina-rate" className="block text-sm font-semibold text-slate-700">每小时恢复量</label>
                    <div className="relative">
                        <input id="world-stamina-rate" type="number" inputMode="numeric" min={0} max={100} step={1} required
                            value={state.rate} disabled={state.loading || state.saving || state.savedRate === null}
                            aria-describedby="world-stamina-rate-help"
                            onChange={event => state.setRate(event.target.value === '' ? '' : Number(event.target.value))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-20 font-mono text-sm text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:bg-slate-50 disabled:text-slate-400"/>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">点/小时</span>
                    </div>
                    <p id="world-stamina-rate-help" className="text-xs text-slate-500">{state.loading ? '正在读取设置…' : state.savedRate === null ? '读取设置后可修改。' : `当前已保存：${state.savedRate} 点/小时，可设置 0～100 的整数。`}</p>
                    {state.rate !== '' && !state.valid && <p role="alert" className="text-xs text-amber-700">请输入 0～100 的整数。</p>}
                    {state.error && <p role="alert" className="text-xs text-red-600">{state.error}{state.savedRate === null && <button type="button" onClick={state.retry} className="ml-2 underline">重试加载</button>}</p>}
                </div>
                <button type="submit" disabled={state.loading || state.saving || !state.valid || state.savedRate === null || state.rate === state.savedRate}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                    {state.saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}
                    {state.saving ? '保存中…' : '保存设置'}
                </button>
            </form>
        </section>
    );
}
