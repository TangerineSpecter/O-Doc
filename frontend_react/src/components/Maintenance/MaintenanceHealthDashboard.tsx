import {useMemo} from 'react';
import {
    Activity, AlertTriangle, Check, CircleAlert, HeartPulse,
    ShieldAlert, ShieldCheck,
} from 'lucide-react';
import type {HealthPayload, HealthSeverity} from '../../types/api/maintenance';

interface MaintenanceHealthDashboardProps {
    health: HealthPayload | null;
    loading?: boolean;
    selectedSeverity: HealthSeverity | '';
    onSelectSeverity: (severity: HealthSeverity | '') => void;
}

interface SeverityCardConfig {
    level: HealthSeverity;
    title: string;
    sublabel: string;
    desc: string;
    icon: typeof CircleAlert;
    colorClasses: {
        iconBox: string;
        accentText: string;
        badge: string;
        progress: string;
        selectedRing: string;
        selectedBorder: string;
    };
}

const severityConfigs: SeverityCardConfig[] = [
    {
        level: 'critical',
        title: '需处理',
        sublabel: '项异常',
        desc: '影响检索或存在损坏内容',
        icon: CircleAlert,
        colorClasses: {
            iconBox: 'bg-rose-50 text-rose-600 ring-rose-200/80',
            accentText: 'text-rose-600',
            badge: 'bg-rose-50 text-rose-700 ring-rose-200/60',
            progress: 'bg-rose-500',
            selectedRing: 'ring-2 ring-rose-400/70',
            selectedBorder: 'border-rose-400 bg-rose-50/20',
        },
    },
    {
        level: 'warning',
        title: '建议关注',
        sublabel: '项需完善',
        desc: '未分类、无标签规范问题',
        icon: AlertTriangle,
        colorClasses: {
            iconBox: 'bg-amber-50 text-amber-600 ring-amber-200/80',
            accentText: 'text-amber-600',
            badge: 'bg-amber-50 text-amber-700 ring-amber-200/60',
            progress: 'bg-amber-500',
            selectedRing: 'ring-2 ring-amber-400/70',
            selectedBorder: 'border-amber-400 bg-amber-50/20',
        },
    },
    {
        level: 'info',
        title: '待整理',
        sublabel: '项可优化',
        desc: '零散笔记与元数据补充',
        icon: Activity,
        colorClasses: {
            iconBox: 'bg-sky-50 text-sky-600 ring-sky-200/80',
            accentText: 'text-sky-600',
            badge: 'bg-sky-50 text-sky-700 ring-sky-200/60',
            progress: 'bg-sky-500',
            selectedRing: 'ring-2 ring-sky-400/70',
            selectedBorder: 'border-sky-400 bg-sky-50/20',
        },
    },
];

export default function MaintenanceHealthDashboard({
    health,
    loading,
    selectedSeverity,
    onSelectSeverity,
}: MaintenanceHealthDashboardProps) {
    const score = health?.score ?? 0;
    const totalIssues = useMemo(() => {
        if (!health) return 0;
        return (
            (health.severityCounts.critical || 0) +
            (health.severityCounts.warning || 0) +
            (health.severityCounts.info || 0)
        );
    }, [health]);

    // 计算分值对应颜色、评级与描述
    const scoreTier = useMemo(() => {
        if (!health) {
            return {
                strokeColor: '#cbd5e1',
                textColor: 'text-slate-400',
                badgeBg: 'bg-slate-100 text-slate-600 ring-slate-200',
                label: '检查中',
                summary: '正在检查健康状态…',
                icon: HeartPulse,
            };
        }
        if (score >= 80) {
            return {
                strokeColor: '#10b981',
                textColor: 'text-emerald-600',
                badgeBg: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
                label: '健康良好',
                summary: '结构清晰规范，继续保持',
                icon: ShieldCheck,
            };
        }
        if (score >= 60) {
            return {
                strokeColor: '#f97316',
                textColor: 'text-orange-600',
                badgeBg: 'bg-orange-50 text-orange-700 ring-orange-200/70',
                label: '建议关注',
                summary: '部分文档标签或分类缺失',
                icon: AlertTriangle,
            };
        }
        return {
            strokeColor: '#f43f5e',
            textColor: 'text-rose-600',
            badgeBg: 'bg-rose-50 text-rose-700 ring-rose-200/70',
            label: '需处理',
            summary: '检测到较多异常，建议尽快修复',
            icon: ShieldAlert,
        };
    }, [health, score]);

    // 紧凑型环形刻度参数（尺寸收缩，保持高度克制）
    const radius = 23;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;
    const ScoreIcon = scoreTier.icon;

    return (
        <section className="grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-4">
            {/* 卡片 1：综合健康指数主仪表盘（移动端独占首行横向紧凑展示） */}
            <div className="col-span-3 sm:col-span-1 relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-br from-white via-orange-50/15 to-white p-3 shadow-sm transition-all duration-200 hover:shadow sm:rounded-2xl sm:p-4">
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-orange-100/30 blur-xl" />

                {/* 顶部标题与评级 */}
                <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <ScoreIcon className="h-3.5 w-3.5 text-orange-500" />
                        <span>健康指数</span>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${scoreTier.badgeBg}`}>
                        {scoreTier.label}
                    </span>
                </div>

                {/* 中间仪表刻度与评分（紧凑化尺寸） */}
                <div className="relative my-1.5 sm:my-2 flex items-center gap-3">
                    <div className="relative flex h-11 w-11 sm:h-[54px] sm:w-[54px] shrink-0 items-center justify-center">
                        <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 60 60">
                            <circle
                                cx="30"
                                cy="30"
                                r={radius}
                                className="stroke-slate-100"
                                strokeWidth="5"
                                fill="transparent"
                            />
                            <circle
                                cx="30"
                                cy="30"
                                r={radius}
                                stroke={scoreTier.strokeColor}
                                strokeWidth="5"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                fill="transparent"
                                className="transition-all duration-700 ease-out"
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                            <span className="text-base sm:text-lg font-black tracking-tight text-slate-900">
                                {loading ? '--' : score}
                            </span>
                        </div>
                    </div>

                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-600">
                            {scoreTier.summary}
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                            共 {totalIssues} 项待跟进
                        </p>
                    </div>
                </div>

                {/* 底部微提示 */}
                <div className="relative border-t border-slate-100/80 pt-1 text-[10px] text-slate-400 sm:pt-1.5">
                    文章、闪念与 RAG 综合评估
                </div>
            </div>

            {/* 卡片 2、3、4：三个严重程度互动卡片（移动端三列并排展示，高度极度克制收拢） */}
            {severityConfigs.map(config => {
                const count = health?.severityCounts[config.level] || 0;
                const percentage = totalIssues > 0 ? Math.round((count / totalIssues) * 100) : 0;
                const isSelected = selectedSeverity === config.level;
                const Icon = config.icon;

                return (
                    <button
                        type="button"
                        key={config.level}
                        onClick={() => onSelectSeverity(isSelected ? '' : config.level)}
                        className={`col-span-1 group relative flex flex-col justify-between rounded-xl border bg-white p-2.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow sm:rounded-2xl sm:p-4 focus:outline-none ${
                            isSelected
                                ? `${config.colorClasses.selectedBorder} ${config.colorClasses.selectedRing}`
                                : 'border-slate-200/90 hover:border-slate-300'
                        }`}
                    >
                        {/* 顶部图标与占比胶囊 */}
                        <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                                <span className={`flex h-5 w-5 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-md sm:rounded-lg ring-1 transition-transform group-hover:scale-105 ${config.colorClasses.iconBox}`}>
                                    <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                </span>
                                <span className="truncate text-xs sm:text-sm font-bold text-slate-800">
                                    {config.title}
                                </span>
                            </div>

                            {isSelected ? (
                                <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-slate-900 px-1 py-0.5 sm:px-1.5 text-[9px] sm:text-[10px] font-bold text-white shadow-sm">
                                    <Check className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                                    <span className="hidden sm:inline">已选</span>
                                </span>
                            ) : (
                                <span className="hidden sm:inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                    占比 {percentage}%
                                </span>
                            )}
                        </div>

                        {/* 中间指标大字与单位 */}
                        <div className="my-1 sm:my-1.5 flex items-baseline gap-1">
                            <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                                {count}
                            </span>
                            <span className="truncate text-[10px] sm:text-[11px] font-medium text-slate-400">
                                {config.sublabel}
                            </span>
                        </div>

                        {/* 进度微条与底部释义 */}
                        <div className="space-y-1">
                            <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${config.colorClasses.progress}`}
                                    style={{width: `${percentage}%`}}
                                />
                            </div>
                            <p className="hidden sm:block truncate text-[10px] text-slate-400" title={config.desc}>
                                {config.desc}
                            </p>
                        </div>
                    </button>
                );
            })}
        </section>
    );
}
