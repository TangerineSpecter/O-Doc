import {useState} from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    FlaskConical,
    Package,
    Sparkles,
    Swords,
    Zap,
} from 'lucide-react';
import type {ParsedSettlement} from '../Combat/observationRecords';

interface ExplorationFeedSettlementProps {
    parsed: ParsedSettlement;
    status: string;
}

/** 整理休整/结束原因文案 */
function formatSettlementReason(reason?: string, status?: string) {
    if (!reason) {
        return status === 'failed' ? '角色倒地 · 正在休息' : '探险完成 · 凯旋归来';
    }
    // 规范化多余标点和空格
    let text = reason.replace(/[，,；;。.\s]+/g, ' · ').trim();
    if (text.startsWith('· ')) text = text.slice(2);
    if (text.endsWith(' ·')) text = text.slice(0, -2);
    return text;
}

export function ExplorationFeedSettlement({parsed, status}: ExplorationFeedSettlementProps) {
    const [showRaw, setShowRaw] = useState(false);

    const isFallen = status === 'failed' || Boolean(parsed.reason?.includes('倒地') || parsed.reason?.includes('休息'));
    const bannerReason = formatSettlementReason(parsed.reason, status);

    return (
        <section aria-label="迷宫探索总结" className="mt-2.5 space-y-2.5">
            {/* 状态与休整横幅 */}
            <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
                    isFallen
                        ? 'border-rose-200/80 bg-gradient-to-r from-rose-50/90 via-orange-50/30 to-white'
                        : 'border-orange-200/80 bg-gradient-to-r from-orange-50/90 via-amber-50/30 to-white'
                }`}
            >
                <div
                    className={`flex items-center gap-1.5 font-medium ${
                        isFallen ? 'text-rose-800' : 'text-orange-800'
                    }`}
                >
                    {isFallen ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                    ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                    )}
                    <span>{bannerReason}</span>
                </div>

                {parsed.level != null && (
                    <span
                        className={`inline-flex shrink-0 items-center rounded-md border bg-white/95 px-2 py-0.5 font-mono text-[10px] font-bold shadow-2xs ${
                            isFallen
                                ? 'border-rose-200/70 text-rose-700'
                                : 'border-orange-200/70 text-orange-700'
                        }`}
                    >
                        返回 Lv.{parsed.level}
                    </span>
                )}
            </div>

            {/* 核心战绩指标 4 宫格 */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {/* 击败魔物 */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2 sm:p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Swords className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                        <span>击败魔物</span>
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-slate-800 sm:text-lg">
                        {parsed.kills ?? 0} <span className="font-sans text-xs font-normal text-slate-500">只</span>
                    </div>
                </div>

                {/* 获得经验 */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2 sm:p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span>获得经验</span>
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-amber-600 sm:text-lg">
                        +{parsed.experience ?? 0} <span className="font-sans text-xs font-normal text-slate-500">EXP</span>
                    </div>
                </div>

                {/* 消耗体力 */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2 sm:p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Zap className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                        <span>消耗体力</span>
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-slate-700 sm:text-lg">
                        {parsed.energy ?? 0} <span className="font-sans text-xs font-normal text-slate-500">点</span>
                    </div>
                </div>

                {/* 探索用时 */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2 sm:p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>探索用时</span>
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-slate-800 sm:text-lg">
                        {parsed.minutes ?? 0} <span className="font-sans text-xs font-normal text-slate-500">分钟</span>
                    </div>
                </div>
            </div>

            {/* 战利品收获清单 */}
            {parsed.loots && parsed.loots.length > 0 && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-2.5">
                    <div className="mb-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                            <Package className="h-3.5 w-3.5 text-orange-500" />
                            <span>战利品收获</span>
                            <span className="rounded-full bg-slate-200/70 px-1.5 py-0.2 font-mono text-[10px] text-slate-600">
                                {parsed.loots.length} 种
                            </span>
                        </div>
                        {parsed.potions != null && parsed.potions > 0 && (
                            <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                                <FlaskConical className="h-3 w-3 text-indigo-500" />
                                <span>消耗药剂 {parsed.potions} 瓶</span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {parsed.loots.map(item => (
                            <span
                                key={item.name}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-2xs transition-shadow hover:shadow-xs"
                            >
                                <span className="font-medium text-slate-800">{item.name}</span>
                                <span className="font-mono font-bold text-orange-600">×{item.count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* 无战利品但有药剂消耗时的展示 */}
            {(!parsed.loots || parsed.loots.length === 0) && parsed.potions != null && parsed.potions > 0 && (
                <div className="flex items-center justify-end gap-1 text-[11px] text-slate-500">
                    <FlaskConical className="h-3 w-3 text-indigo-500" />
                    <span>消耗药剂 {parsed.potions} 瓶</span>
                </div>
            )}

            {/* 可选的原始文本折叠查看 */}
            <div className="pt-0.5">
                <button
                    type="button"
                    onClick={() => setShowRaw(!showRaw)}
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <span>{showRaw ? '收起完整记录' : '查看完整记录'}</span>
                    {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showRaw && (
                    <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-xs leading-relaxed text-slate-500 break-words border border-slate-200/60">
                        {parsed.raw}
                    </p>
                )}
            </div>
        </section>
    );
}
