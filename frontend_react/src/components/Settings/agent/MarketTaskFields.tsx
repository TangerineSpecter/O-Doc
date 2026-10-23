import {Clock, ShieldCheck, ShoppingBag, Sparkles, Wrench, Zap} from 'lucide-react';
import type {MarketDecisionConfig} from '../../../types/api/decision';

export function MarketTaskFields({value, onChange}: {value: MarketDecisionConfig; onChange: (value: MarketDecisionConfig) => void}) {
    const automation = value.marketAutomationV2 === true;

    return (
        <section className="space-y-4 rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/30 via-white to-white p-5 shadow-xs">
            {/* 顶部标题与行为标签 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-2xs">
                        <ShoppingBag className="h-4.5 w-4.5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-800">市场自主交易机制</h4>
                        <p className="text-xs text-slate-500">居民根据需求自主决断进场，支持挂牌与采购</p>
                    </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    自主行为
                </span>
            </div>

            {/* 3 大核心指标网格 */}
            <div className="grid grid-cols-3 gap-2.5">
                <div className="flex flex-col items-center justify-center rounded-xl border border-amber-100/90 bg-amber-50/40 px-3 py-2.5 text-center transition-colors">
                    <div className="flex items-center gap-1 text-xs font-medium text-amber-700">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        <span>体力消耗</span>
                    </div>
                    <span className="mt-1 text-sm font-bold text-slate-800">5 点 / 次</span>
                    <span className="mt-0.5 text-[10px] text-slate-400">进场即扣 · 自主决断</span>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl border border-amber-100/90 bg-amber-50/40 px-3 py-2.5 text-center transition-colors">
                    <div className="flex items-center gap-1 text-xs font-medium text-amber-700">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        <span>时长上限</span>
                    </div>
                    <span className="mt-1 text-sm font-bold text-slate-800">5 分钟</span>
                    <span className="mt-0.5 text-[10px] text-slate-400">单次上限 · 超时结算</span>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl border border-amber-100/90 bg-amber-50/40 px-3 py-2.5 text-center transition-colors">
                    <div className="flex items-center gap-1 text-xs font-medium text-amber-700">
                        <Wrench className="h-3.5 w-3.5 text-amber-500" />
                        <span>工具调用</span>
                    </div>
                    <span className="mt-1 text-sm font-bold text-slate-800">最多 20 次</span>
                    <span className="mt-0.5 text-[10px] text-slate-400">单轮保护 · 防循环</span>
                </div>
            </div>

            {/* 支持的操作范围标签 */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-xs font-medium text-slate-400">支持操作：</span>
                {['买入物品', '挂牌上架', '修改定价', '撤回挂单', '种植队列联动'].map(action => (
                    <span
                        key={action}
                        className="rounded-md border border-slate-200/60 bg-slate-100/80 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                    >
                        {action}
                    </span>
                ))}
            </div>

            {/* 决策模型与容灾提示 */}
            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p className="leading-relaxed">
                    结构化决策连接由世界设置统一管理。复杂操作调用通用模型；连接中断时基于当前真实状态继续，杜绝重复成交。
                </p>
            </div>

            {/* 市场自动化 V2 控制面板 */}
            <div
                className={`rounded-xl border p-4 transition-all duration-200 ${
                    automation
                        ? 'border-emerald-200 bg-gradient-to-b from-emerald-50/40 to-white shadow-2xs'
                        : 'border-slate-200 bg-slate-50/50'
                }`}
            >
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                automation ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200/80 text-slate-500'
                            }`}
                        >
                            <Sparkles className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-800">市场自动化 (V2)</span>
                                {automation && (
                                    <span className="rounded bg-emerald-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                        智能预检中
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500">开启后每天生成市场计划，命中意向才进场</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            automation ? 'text-emerald-700' : 'text-slate-500'
                        }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${automation ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {automation ? '已启用' : '已关闭'}
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={automation}
                            onClick={() => onChange({...value, marketAutomationV2: !automation})}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                                automation ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                    automation ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>
                </div>

                {/* 自动化运行机制分步卡片 */}
                <div className="mt-3.5 grid grid-cols-1 gap-2 border-t border-slate-200/60 pt-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200/60 bg-white/80 p-2.5">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            1. 每日规划
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">
                            每天为每位活跃居民规划一份买卖意向与预算。
                        </p>
                    </div>

                    <div className="rounded-lg border border-slate-200/60 bg-white/80 p-2.5">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            2. 按需进场
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">
                            每小时只读预检，命中可撮合买卖才消耗 5 体力进场。
                        </p>
                    </div>

                    <div className="rounded-lg border border-slate-200/60 bg-white/80 p-2.5">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            3. 安全降级
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">
                            决策不可用时按“不新增采购”降级；关闭保留常规机会。
                        </p>
                    </div>
                </div>

                <p className="mt-2 text-[10px] text-slate-400">
                    * 依赖世界设置中的结构化决策连接与本机自动执行开关。
                </p>
            </div>
        </section>
    );
}
