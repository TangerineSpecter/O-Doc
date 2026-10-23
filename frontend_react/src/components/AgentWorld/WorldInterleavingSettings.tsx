import {useState} from 'react';
import {
    AlertCircle,
    CheckCircle2,
    ChefHat,
    Coffee,
    Compass,
    Fish,
    FlaskConical,
    Hammer,
    Loader2,
    RefreshCw,
    Save,
    ShieldCheck,
    Sparkles,
    Timer,
} from 'lucide-react';
import {useWorldLifeConfig} from '../../hooks/useWorldLifeConfig';
import {useToast} from '../common/ToastProvider';
import type {LifeSettings} from '../../types/api/agentLife';
import TimingStepper from './TimingStepper';

interface TimingItem {
    key: keyof Pick<LifeSettings, 'interleavingCheckMinutes' | 'interleavingDecisionMinutes' | 'interleavingWaitMinutes'>;
    label: string;
    description: string;
    fallback: number;
    min: number;
    max: number;
    step: number;
}

const TIMINGS: TimingItem[] = [
    {
        key: 'interleavingCheckMinutes',
        label: '条件预检间隔',
        description: '定时巡检居民空档与资源',
        fallback: 5,
        min: 1,
        max: 1440,
        step: 1,
    },
    {
        key: 'interleavingDecisionMinutes',
        label: '决策冷却间隔',
        description: '两次模型选择的最短等待',
        fallback: 30,
        min: 1,
        max: 10080,
        step: 5,
    },
    {
        key: 'interleavingWaitMinutes',
        label: '暂不活动等待',
        description: '休整或无候选后的冷却重试',
        fallback: 60,
        min: 1,
        max: 10080,
        step: 10,
    },
];

const ACTIVITIES = [
    {label: '美食烹饪', icon: ChefHat, iconColor: 'text-amber-500', bg: 'bg-amber-50/70 border-amber-100 text-amber-900'},
    {label: '炼金制剂', icon: FlaskConical, iconColor: 'text-purple-500', bg: 'bg-purple-50/70 border-purple-100 text-purple-900'},
    {label: '铁匠锻造', icon: Hammer, iconColor: 'text-blue-500', bg: 'bg-blue-50/70 border-blue-100 text-blue-900'},
    {label: '水边垂钓', icon: Fish, iconColor: 'text-cyan-500', bg: 'bg-cyan-50/70 border-cyan-100 text-cyan-900'},
    {label: '迷宫探索', icon: Compass, iconColor: 'text-emerald-500', bg: 'bg-emerald-50/70 border-emerald-100 text-emerald-900'},
    {label: '休整待命', icon: Coffee, iconColor: 'text-slate-500', bg: 'bg-slate-50 border-slate-200/70 text-slate-700'},
];

export function WorldInterleavingSettings({onClose}: {onClose?: () => void} = {}) {
    const state = useWorldLifeConfig();
    const toast = useToast();
    const [saving, setSaving] = useState(false);

    if (state.loading && !state.config) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                <p className="text-xs">正在读取空档活动设置…</p>
            </div>
        );
    }

    if (state.error && !state.config) {
        return (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-700 space-y-3">
                <div className="flex items-center justify-center gap-1.5 font-semibold">
                    <AlertCircle className="h-4 w-4" />
                    <span>设置加载失败</span>
                </div>
                <p className="text-xs text-red-600">{state.error}</p>
                <button
                    type="button"
                    onClick={state.refresh}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>重新加载</span>
                </button>
            </div>
        );
    }

    const enabled = state.config?.settings.interleavingEnabled ?? false;

    const handleSave = async () => {
        setSaving(true);
        try {
            const success = await state.save();
            if (success) {
                toast.success('空档活动设置已保存');
                onClose?.();
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4 text-slate-700">
            {state.error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                    <span className="flex-1">{state.error}</span>
                </div>
            )}

            {/* 顶层主开关卡片 */}
            <div
                className={`relative flex items-center justify-between gap-4 rounded-2xl border p-4 transition-all duration-200 ${
                    enabled
                        ? 'border-orange-200/90 bg-gradient-to-r from-orange-50/70 via-amber-50/30 to-white shadow-2xs'
                        : 'border-slate-200 bg-slate-50/70'
                }`}
            >
                <div className="flex items-center gap-3.5 min-w-0">
                    <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                            enabled
                                ? 'bg-orange-500 text-white shadow-sm'
                                : 'bg-slate-200 text-slate-500'
                        }`}
                    >
                        <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800">
                                启用自动穿插
                            </span>
                            <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                                    enabled
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-slate-200 bg-slate-100 text-slate-500'
                                }`}
                            >
                                {enabled ? (
                                    <>
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        已开启
                                    </>
                                ) : (
                                    '已暂停'
                                )}
                            </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 truncate">
                            主日程空档期由决策模型在合法候选中自主选择活动
                        </p>
                    </div>
                </div>

                <label className="relative inline-flex cursor-pointer items-center shrink-0">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={e => state.field('interleavingEnabled', e.target.checked)}
                        disabled={state.loading || saving}
                        className="peer sr-only"
                    />
                    <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-orange-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/20 peer-disabled:opacity-50" />
                </label>
            </div>

            {/* 可穿插活动领域徽标 */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">支持的空档活动</span>
                    <span className="text-[11px] text-slate-400">仅对通过前置预检的领域进行决策</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ACTIVITIES.map(item => {
                        const Icon = item.icon;
                        return (
                            <div
                                key={item.label}
                                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${item.bg}`}
                            >
                                <Icon className={`h-3.5 w-3.5 shrink-0 ${item.iconColor}`} />
                                <span className="truncate">{item.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 节奏与冷却参数卡片组 */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Timer className="h-3.5 w-3.5 text-orange-500" />
                        <span>节奏与冷却控制</span>
                    </div>
                    <span className="text-[11px] text-slate-400">时间单位均为分钟</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {TIMINGS.map(({key, label, description, fallback, min, max, step}) => {
                        const currentVal = state.config?.settings[key] ?? fallback;
                        return (
                            <div
                                key={key}
                                className={`rounded-xl border p-3 space-y-2 shadow-2xs transition-all ${
                                    enabled
                                        ? 'border-slate-200/90 bg-white'
                                        : 'border-slate-100 bg-slate-50/50'
                                }`}
                            >
                                <div>
                                    <div className="text-xs font-semibold text-slate-800">{label}</div>
                                    <p
                                        className="mt-0.5 text-[11px] text-slate-400 leading-tight truncate"
                                        title={description}
                                    >
                                        {description}
                                    </p>
                                </div>
                                <TimingStepper
                                    label={label}
                                    value={currentVal}
                                    min={min}
                                    max={max}
                                    step={step}
                                    disabled={!enabled || state.loading || saving}
                                    onChange={next => state.field(key, next)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 体力保护与规则说明卡片 */}
            <div className="rounded-xl border border-orange-100/80 bg-orange-50/30 p-3.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                    <ShieldCheck className="h-4 w-4 text-orange-500" />
                    <span>调度保护与执行机制</span>
                </div>
                <ul className="space-y-1.5 text-slate-600 text-[11px] leading-relaxed">
                    <li className="flex items-start gap-1.5">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                        <span>
                            <strong>优先预留体力</strong>：自动扣除后续主日程、次日安排及已接悬赏所需体力，余量不足时绝不强行穿插。
                        </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                        <span>
                            <strong>按需模型决策</strong>：仅在存在合法活动候选时调用决策模型；无可用活动或选择暂不活动时不消耗无谓决策。
                        </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                        <span>
                            <strong>顺延与事实记录</strong>：已开始的探索或垂钓若遇延长，主日程按规则顺延，实际起止与产出如实沉淀在日程中。
                        </span>
                    </li>
                </ul>
            </div>

            {/* 底部操作条 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>设置随生活配置即时同步</span>
                </div>
                <div className="flex items-center gap-2">
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={state.loading || saving}
                            className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50"
                        >
                            取消
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={state.loading || saving}
                        onClick={handleSave}
                        className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 active:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>保存中…</span>
                            </>
                        ) : (
                            <>
                                <Save className="h-3.5 w-3.5" />
                                <span>保存设置</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
