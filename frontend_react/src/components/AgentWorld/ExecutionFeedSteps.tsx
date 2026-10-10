import {Grid2X2, Hammer, ListOrdered, ShoppingBag, Sprout} from 'lucide-react';
import type {DailyFeedEvent} from '../../types/api/dailyFeed';

interface ExecutionFeedStepsProps {
    steps: NonNullable<DailyFeedEvent['steps']>;
    reason?: string;
}

// 根据动作标题返回视觉徽标样式与图标
function getActionBadge(title: string) {
    if (title.includes('扩地') || title.includes('扩建')) {
        return {
            className: 'bg-amber-50 text-amber-800 border-amber-200/80',
            icon: Grid2X2,
        };
    }
    if (title.includes('建造') || title.includes('升级')) {
        return {
            className: 'bg-orange-50 text-orange-800 border-orange-200/80',
            icon: Hammer,
        };
    }
    if (
        title.includes('播种') ||
        title.includes('浇水') ||
        title.includes('收获') ||
        title.includes('喂养') ||
        title.includes('施肥') ||
        title.includes('产物')
    ) {
        return {
            className: 'bg-lime-50 text-lime-800 border-lime-200/80',
            icon: Sprout,
        };
    }
    if (
        title.includes('买') ||
        title.includes('购') ||
        title.includes('卖') ||
        title.includes('售') ||
        title.includes('市场') ||
        title.includes('交易')
    ) {
        return {
            className: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
            icon: ShoppingBag,
        };
    }
    return {
        className: 'bg-slate-100 text-slate-700 border-slate-200/80',
        icon: null,
    };
}

// 提取步骤细节并移除与整体规划重复的长文本
function cleanStepDetail(detail: string, commonReason?: string, title?: string): string {
    let text = detail ? detail.trim() : '';
    if (commonReason) {
        const cleanReason = commonReason.trim();
        if (text === cleanReason) {
            text = '';
        } else if (text.endsWith(` · ${cleanReason}`)) {
            text = text.slice(0, -` · ${cleanReason}`.length);
        } else if (text.includes(cleanReason)) {
            text = text.replace(cleanReason, '').trim().replace(/^·\s*|\s*·$/g, '');
        }
    }
    // 兜底扩地等无参数动作的展示可读性
    if (!text && (title?.includes('扩地') || title?.includes('扩建'))) {
        return '购买 4 块耕地';
    }
    return text;
}

// 格式化金额变动
function formatStepAmount(amount: string | null) {
    if (!amount) return null;
    const num = Number(amount);
    if (Number.isNaN(num) || num === 0) return null;
    const isNegative = num < 0;
    const absVal = Math.abs(num);
    const formatted = absVal % 1 === 0 ? absVal.toString() : absVal.toFixed(2);
    return {
        isNegative,
        // 使用标准数学减号与精简单位，避免文本过长且排版更专业
        text: `${isNegative ? '−' : '+'}${formatted} 币`,
    };
}

// 格式化时间
function formatStepTime(occurredAt: string) {
    try {
        return new Date(occurredAt).toLocaleTimeString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    } catch {
        return '';
    }
}

/**
 * 结构化多步执行时间线组件
 * 清晰展示单次机会中执行的各项具体步骤、类型徽标、金额变动与时间
 */
export function ExecutionFeedSteps({steps, reason}: ExecutionFeedStepsProps) {
    if (!steps || steps.length === 0) return null;

    // 智能探测多步骤中完全相同的长后缀（防御历史旧数据未清理的情况）
    let detectedCommonSuffix = reason || '';
    if (!detectedCommonSuffix && steps.length > 1) {
        const detailsWithText = steps.map(s => s.detail?.trim() || '').filter(Boolean);
        if (detailsWithText.length > 1) {
            const first = detailsWithText[0];
            const separatorIdx = first.lastIndexOf(' · ');
            const candidate = separatorIdx !== -1 ? first.slice(separatorIdx + 3) : first;
            if (candidate.length > 15 && detailsWithText.every(d => d.endsWith(candidate))) {
                detectedCommonSuffix = candidate;
            }
        }
    }

    return (
        <section
            aria-label="本次活动执行明细"
            className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 sm:p-3.5"
        >
            {/* 步骤条目头部微信息 */}
            <div className="mb-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <ListOrdered className="h-3.5 w-3.5 text-orange-500" />
                    <span>执行明细</span>
                    <span className="rounded-full bg-slate-200/70 px-1.5 py-0.2 font-mono text-[10px] text-slate-600">
                        {steps.length} 步
                    </span>
                </div>
            </div>

            {/* 时间线步骤列表（自然平铺展开，无内部滚动） */}
            <ol className="relative space-y-2.5 pl-6 before:absolute before:bottom-2 before:left-2.5 before:top-2 before:w-px before:bg-slate-200/80">
                {steps.map((step, index) => {
                    const badge = getActionBadge(step.title);
                    const BadgeIcon = badge.icon;
                    const cleanedDetail = cleanStepDetail(step.detail, detectedCommonSuffix, step.title);
                    const amountInfo = formatStepAmount(step.amount);
                    const timeText = formatStepTime(step.occurredAt);

                    return (
                        <li key={step.id || `${step.title}-${index}`} className="relative flex flex-col gap-1 text-xs">
                            {/* 步骤序号节点（工整微圆角小标） */}
                            <span
                                aria-hidden="true"
                                className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-md border border-orange-200/90 bg-white font-mono text-[10px] font-bold text-orange-600 shadow-2xs"
                            >
                                {index + 1}
                            </span>

                            {/* 步骤主体内容 */}
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                    {/* 操作动作徽标（工整微圆角） */}
                                    <span
                                        className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-tight ${badge.className}`}
                                    >
                                        {BadgeIcon && <BadgeIcon className="h-3 w-3" />}
                                        <span>{step.title}</span>
                                    </span>

                                    {/* 核心动作详情 */}
                                    {cleanedDetail && (
                                        <span className="break-words font-medium text-slate-700">
                                            {cleanedDetail}
                                        </span>
                                    )}
                                </div>

                                {/* 右侧：金额与时间（工整微圆角标签，舒展居中） */}
                                <div className="flex shrink-0 items-center gap-3 sm:gap-3.5">
                                    {amountInfo && (
                                        <span
                                            className={`inline-flex h-5 items-center justify-center rounded-md border px-1.5 font-mono text-[11px] font-medium leading-none tabular-nums ${
                                                amountInfo.isNegative
                                                    ? 'border-rose-200/70 bg-rose-50/80 text-rose-600'
                                                    : 'border-emerald-200/70 bg-emerald-50/80 text-emerald-600'
                                            }`}
                                        >
                                            {amountInfo.text}
                                        </span>
                                    )}

                                    {timeText && (
                                        <time
                                            dateTime={step.occurredAt}
                                            className="font-mono text-[11px] tabular-nums text-slate-400"
                                        >
                                            {timeText}
                                        </time>
                                    )}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
