import {useState} from 'react';
import {
    Sparkles,
    CalendarDays,
    RefreshCw,
    ShoppingBag,
    Timer,
    ArrowRight,
    HelpCircle,
    CheckCircle2,
    Clock,
} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';

interface RuleCardProps {
    icon: React.ComponentType<{className?: string}>;
    iconClass: string;
    tag: string;
    tagClass: string;
    title: string;
    points: {title: string; desc: string; highlight?: string}[];
}

const ruleSections: RuleCardProps[] = [
    {
        icon: Timer,
        iconClass: 'bg-green-50 text-green-600 border border-green-100',
        tag: '个人开工 · 半小时检查',
        tagClass: 'bg-green-50 text-green-700 border border-green-200',
        title: '农场种植队列怎么运行？',
        points: [
            {title: '错开开工', desc: '每日规划作物顺序、数量、施肥和采购上限，在每位居民自己的农场日程到点开工。后续程序每半小时先收获再播种，不消耗模型调用。'},
            {title: '市场等待', desc: '已有种子先种，缺料项目跳过；市场仍在个人机会到点查看实时库存，采购后继续队列，替代作物由市场决策说明理由。'},
            {title: '截止与跨日', desc: '活动时段结束停止播种。在田作物继续生长，可跨日收获；未播种项目截止失效，次日按真实剩余库存重新规划，空检查不记录动态。'},
        ],
    },
    {
        icon: CalendarDays,
        iconClass: 'bg-sky-50 text-sky-600 border border-sky-100',
        tag: '自动轮询 · 分批规划',
        tagClass: 'bg-sky-50/80 text-sky-700 border border-sky-200/60',
        title: '什么时候安排日程？',
        points: [
            {
                title: '新日动态分配',
                desc: '开启本机自动执行后，系统在轮询时按配置的生活周期和活动时间分配机会；持续运行时，通常在新一天开始后修订当天计划。',
            },
            {
                title: '启动即时处理',
                desc: '较晚启动则在启动后即时处理，并非必须等到凌晨。',
            },
            {
                title: '长周期分批生成',
                desc: '周、月等长周期的时间点可提前生成，具体活动分批精细规划。',
            },
        ],
    },
    {
        icon: RefreshCw,
        iconClass: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
        tag: '动态弹性 · 非定局',
        tagClass: 'bg-indigo-50/80 text-indigo-700 border border-indigo-200/60',
        title: '日程排好后，还会改变吗？',
        points: [
            {
                title: '随真实状态修订',
                desc: '居民会根据真实库存、体力、现金、目标和已经发生的经历实时修订后续计划。',
            },
            {
                title: '执行前最终复核',
                desc: '普通活动执行前再次复核；农场在每日规划中生成队列，到点直接开工，后续不再调用模型。',
            },
            {
                title: '核心心智模型',
                desc: '日程里的计划，',
                highlight: '不代表已经成交、出发或扣款。',
            },
        ],
    },
    {
        icon: ShoppingBag,
        iconClass: 'bg-orange-50 text-orange-600 border border-orange-100',
        tag: '每日 1 次 · 按需进退',
        tagClass: 'bg-orange-50/80 text-orange-700 border border-orange-200/60',
        title: '什么时候决定去不去市场？',
        points: [
            {
                title: '独立专属机会',
                desc: '每位参与居民每天有一次独立逛市场机会，在当天活动时间内分散安排，不占普通行动次数，也不必放在其他活动前面。',
            },
            {
                title: '到点依市决断',
                desc: '排程时只确定机会时间；到点后居民才结合当前需求、库存、余额、后续预算及实时市场，决定进入、买卖或不去。',
            },
            {
                title: '机会消耗机制',
                desc: '即使最终权衡后选择不去，也会正常算作消耗当天的市场机会。',
            },
        ],
    },
    {
        icon: Timer,
        iconClass: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
        tag: '弹性顺延 · 不跨天累加',
        tagClass: 'bg-emerald-50/80 text-emerald-700 border border-emerald-200/60',
        title: '错过时间或需临时补给怎么办？',
        points: [
            {
                title: '排队与当天顺延',
                desc: '世界执行岗位忙碌时市场机会继续等待；居民忙碌或体力不足时，可在当天内弹性顺延。',
            },
            {
                title: '不跨天与防重复',
                desc: '当天市场机会过期后不跨天积攒补跑，重启也不会重新抽时间或重复生成。',
            },
            {
                title: '活动专项补给',
                desc: '旅行等原有活动仍可按需即时补给；当天种植队列等待错开的市场机会，不额外唤起市场。',
            },
        ],
    },
];

export default function LifeScheduleHelp() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                aria-label="查看日程规划说明"
                aria-haspopup="dialog"
                aria-expanded={open}
                title="日程规划说明"
                onClick={() => setOpen(true)}
                className="inline-flex shrink-0 whitespace-nowrap items-center justify-center rounded-full p-1.5 text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
            >
                <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>

            {open && (
                <WorldDialog
                    title="日程规划说明"
                    description="时间按上海时间计算 · 到点再根据真实情况行动"
                    size="compact"
                    onClose={() => setOpen(false)}
                >
                    <div className="space-y-3.5 pb-1 text-slate-600">
                        {/* 机制核心横幅卡片：两阶段流转 */}
                        <div className="rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/90 via-amber-50/40 to-orange-50/20 p-3.5 sm:p-4 shadow-xs">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500 text-white shadow-xs">
                                        <Sparkles className="h-3.5 w-3.5" />
                                    </span>
                                    <h3 className="text-xs font-bold text-slate-900">
                                        核心运行机制：排程定机会 · 到点做决策
                                    </h3>
                                </div>
                                <span className="rounded-full border border-orange-200/60 bg-orange-100/80 px-2 py-0.5 text-[10px] font-medium text-orange-800">
                                    两阶段弹性决策
                                </span>
                            </div>

                            {/* 步骤可视化流转 */}
                            <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                                <div className="rounded-xl border border-orange-200/60 bg-white/90 p-2.5 shadow-xs">
                                    <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700">
                                            1
                                        </span>
                                        提前排程 · 分配机会
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-slate-500">
                                        系统预先规划时间点，<strong className="font-semibold text-slate-700">绝不提前代买或预扣预算</strong>
                                    </p>
                                </div>

                                <div className="hidden items-center justify-center text-orange-400 sm:flex">
                                    <ArrowRight className="h-4 w-4" />
                                </div>

                                <div className="rounded-xl border border-orange-200/60 bg-white/90 p-2.5 shadow-xs">
                                    <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700">
                                            2
                                        </span>
                                        到点执行 · 现场决断
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-slate-500">
                                        时间到达后，结合<strong className="font-semibold text-slate-700">库存、体力与实时行情</strong>决定是否行动
                                    </p>
                                </div>
                            </div>

                            {/* 生动例证 */}
                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-orange-200/60 bg-orange-100/50 px-3 py-2 text-amber-950">
                                <span className="shrink-0 rounded-md bg-orange-200/80 px-1.5 py-0.5 text-[10px] font-bold text-orange-900 tracking-wider">
                                    示例
                                </span>
                                <span className="text-[11px] leading-relaxed text-amber-900/90">
                                    当天排好 14:30 的市场机会，等到 14:30 到了才决定去不去，并查看当时的市场；排程期间绝不会提前买东西。
                                </span>
                            </div>
                        </div>

                        {/* 四大核心规则：2x2 网格卡片 */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {ruleSections.map(({icon: Icon, iconClass, tag, tagClass, title, points}) => (
                                <section
                                    key={title}
                                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition-all duration-200 hover:border-orange-200 hover:shadow-sm"
                                >
                                    <div>
                                        <div className="mb-2.5 flex items-center justify-between gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
                                                >
                                                    <Icon className="h-3.5 w-3.5" />
                                                </div>
                                                <h4 className="text-xs font-bold text-slate-900">{title}</h4>
                                            </div>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${tagClass}`}
                                            >
                                                {tag}
                                            </span>
                                        </div>

                                        <div className="space-y-1.5">
                                            {points.map((pt, idx) => (
                                                <div
                                                    key={idx}
                                                    className="rounded-lg bg-slate-50/70 p-2 text-[11px] leading-relaxed text-slate-600"
                                                >
                                                    <span className="font-semibold text-slate-800 mr-1">
                                                        • {pt.title}：
                                                    </span>
                                                    <span>{pt.desc}</span>
                                                    {pt.highlight && (
                                                        <strong className="font-semibold text-orange-600">
                                                            {pt.highlight}
                                                        </strong>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            ))}
                        </div>

                        {/* 底部认知贴士条 */}
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2 text-[11px] text-slate-500">
                            <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                <span>核心准则：不预扣预算 · 当天可顺延 · 跨天不累积</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span>上海时间 (UTC+8) 标准时区</span>
                            </div>
                        </div>
                    </div>
                </WorldDialog>
            )}
        </>
    );
}
