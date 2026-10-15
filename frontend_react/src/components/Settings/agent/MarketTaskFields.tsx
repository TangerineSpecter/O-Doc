import type {MarketDecisionConfig} from '../../../types/api/decision';

export function MarketTaskFields(_: {value: MarketDecisionConfig; onChange: (value: MarketDecisionConfig) => void}) {
    return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm leading-relaxed text-slate-600">居民自主决定是否逛市场，进入消耗5体力；可买卖、上架、改价、撤单并调整种植队列。最多5分钟、20次市场工具调用。</p>
        <p className="text-xs leading-5 text-slate-500">结构化决策连接开关、当前连接和排除场景由世界设置统一管理。复杂操作使用普通模型；连接失败时从当前真实状态继续，不重复成交。</p>
    </section>;
}
