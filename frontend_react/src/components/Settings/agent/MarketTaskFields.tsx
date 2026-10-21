import type {MarketDecisionConfig} from '../../../types/api/decision';

export function MarketTaskFields({value, onChange}: {value: MarketDecisionConfig; onChange: (value: MarketDecisionConfig) => void}) {
    const automation = value.marketAutomationV2 === true;
    return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm leading-relaxed text-slate-600">居民自主决定是否逛市场，进入消耗5体力；可买卖、上架、改价、撤单并调整种植队列。最多5分钟、20次市场工具调用。</p>
        <p className="text-xs leading-5 text-slate-500">结构化决策连接开关、当前连接和排除场景由世界设置统一管理。复杂操作使用普通模型；连接失败时从当前真实状态继续，不重复成交。</p>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700">市场自动化</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                    开启后每天为每位活跃居民生成一份市场计划，每小时只读预检一次；命中可执行的买卖才进场，每次消耗 5 体力、最长 5 分钟。关闭时保留原有的每日市场机会。
                </p>
                <p className="mt-1.5 text-xs leading-5 text-slate-400">
                    依赖世界设置中的结构化决策连接，以及本机自动执行开关；决策不可用时按“不新增采购”降级。
                </p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={automation}
                onClick={() => onChange({...value, marketAutomationV2: !automation})}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    automation
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                }`}
            >
                {automation && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                <span>{automation ? '启用中' : '已关闭'}</span>
            </button>
        </div>
    </section>;
}
