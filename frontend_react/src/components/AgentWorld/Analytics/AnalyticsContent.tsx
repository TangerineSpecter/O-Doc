import type {ReactNode} from 'react';
import {
    BookOpenText,
    Briefcase,
    CalendarDays,
    Coins,
    Compass,
    Fish,
    Info,
    MessageCircle,
    MessageSquareQuote,
    ShoppingBag,
    Sparkles,
    Sprout,
    Swords,
    Ticket,
    TrendingUp,
    Users,
    UtensilsCrossed,
    Wallet,
} from 'lucide-react';
import type {ResidentAnalytics} from '../../../types/api/residentAnalytics';
import {analyticsMoney} from '../../../utils/residentAnalytics';
import AgentAvatar from '../AgentAvatar';
import {ActivityChart, FinanceChart} from './AnalyticsCharts';
import ResidentsComparison from './ResidentsComparison';
import CombatResidentsRanking from './CombatResidentsRanking';
import FishingStatistics from './FishingStatistics';
import LotteryStatistics from './LotteryStatistics';

function Section({
    title,
    description,
    icon: Icon,
    badge,
    children,
    wide = false,
}: {
    title: string;
    description?: string;
    icon?: typeof Users;
    badge?: ReactNode;
    children: ReactNode;
    wide?: boolean;
}) {
    return (
        <section
            className={`min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm transition-shadow hover:shadow-md ${
                wide ? 'lg:col-span-2' : ''
            }`}
        >
            <div
                className={`flex flex-wrap items-center justify-between gap-2 ${
                    description ? 'mb-3 border-b border-slate-100 pb-2.5' : 'mb-2'
                }`}
            >
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {Icon && (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                                <Icon className="h-3.5 w-3.5"/>
                            </span>
                        )}
                        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                    </div>
                    {description ? (
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{description}</p>
                    ) : null}
                </div>
                {badge && <div className="shrink-0">{badge}</div>}
            </div>
            {children}
        </section>
    );
}

const financeLabels: Record<string, string> = {
    post: '作品收入',
    comment: '评论收入',
    prize: '月榜奖金',
    fishing: '钓鱼',
    lottery: '大乐透',
    travel: '旅行费用',
    souvenir: '旅行购物',
    farm: '农场收支',
    market: '市场收支',
    investment: '投资已实现盈亏',
    combat: '冒险收支',
    cooking: '烹饪收支',
    bounty: '悬赏收入',
};

const categoryTheme: Record<string, {label: string; color: string; bar: string; bg: string; icon: typeof Users}> = {
    work: {label: '工作', color: 'text-sky-600', bar: 'bg-sky-500', bg: 'bg-sky-50', icon: Briefcase},
    post: {label: '创作', color: 'text-purple-600', bar: 'bg-purple-500', bg: 'bg-purple-50', icon: BookOpenText},
    interaction: {label: '社交', color: 'text-pink-600', bar: 'bg-pink-500', bg: 'bg-pink-50', icon: MessageCircle},
    farm: {label: '农场', color: 'text-emerald-600', bar: 'bg-emerald-500', bg: 'bg-emerald-50', icon: Sprout},
    lottery: {label: '大乐透', color: 'text-orange-700', bar: 'bg-orange-600', bg: 'bg-orange-50', icon: Ticket},
    fishing: {label: '钓鱼', color: 'text-cyan-700', bar: 'bg-cyan-600', bg: 'bg-cyan-50', icon: Fish},
    cooking: {label: '烹饪', color: 'text-amber-600', bar: 'bg-amber-500', bg: 'bg-amber-50', icon: UtensilsCrossed},
    travel: {label: '旅行', color: 'text-teal-600', bar: 'bg-teal-500', bg: 'bg-teal-50', icon: Compass},
    market: {label: '市场', color: 'text-orange-600', bar: 'bg-orange-500', bg: 'bg-orange-50', icon: ShoppingBag},
    investment: {label: '投资', color: 'text-indigo-600', bar: 'bg-indigo-500', bg: 'bg-indigo-50', icon: TrendingUp},
    combat: {label: '冒险', color: 'text-rose-600', bar: 'bg-rose-500', bg: 'bg-rose-50', icon: Swords},
};

export default function AnalyticsContent({data}: {data: ResidentAnalytics}) {
    const {overview: stats, outcomes} = data;
    const individual = Boolean(data.actorId);

    // 计算活跃指标与日常总数
    const totalBehaviors = data.daily.reduce((sum, item) => sum + item.behaviors, 0);
    const totalCategoryEvents = data.categories.reduce((sum, item) => sum + item.count, 0);

    // 6 个顶级概览卡片配置
    const cards = [
        {
            label: individual ? '活跃天数' : '活跃居民',
            subLabel: individual ? '区间内生活记录' : '有实际活动的居民',
            value: individual ? stats.activeDays : stats.activeResidents,
            unit: individual ? '天' : '位',
            icon: Users,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            border: 'border-amber-100/90',
            glow: 'from-amber-500/10 to-transparent',
        },
        {
            label: individual ? '行为总数' : '活跃居民天数',
            subLabel: individual ? '各类日常行为总计' : '所有居民活跃天之和',
            value: individual ? totalBehaviors : stats.activeDays,
            unit: individual ? '次' : '天',
            icon: CalendarDays,
            color: 'text-orange-600',
            bg: 'bg-orange-50',
            border: 'border-orange-100/90',
            glow: 'from-orange-500/10 to-transparent',
        },
        {
            label: '发布作品',
            subLabel: '心血著作与文章',
            value: stats.publications,
            unit: '篇',
            icon: BookOpenText,
            color: 'text-violet-600',
            bg: 'bg-violet-50',
            border: 'border-violet-100/90',
            glow: 'from-violet-500/10 to-transparent',
        },
        {
            label: '主动互动',
            subLabel: '社交问候与交往',
            value: stats.interactions,
            unit: '次',
            icon: MessageCircle,
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            border: 'border-rose-100/90',
            glow: 'from-rose-500/10 to-transparent',
        },
        {
            label: '实际收入',
            subLabel: '资金流入总额',
            value: analyticsMoney(stats.income),
            icon: Coins,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100/90',
            glow: 'from-emerald-500/10 to-transparent',
        },
        {
            label: '实际支出',
            subLabel: `净差额 ${analyticsMoney(stats.net)}`,
            value: analyticsMoney(stats.expense),
            icon: Wallet,
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            border: 'border-rose-100/90',
            glow: 'from-rose-500/10 to-transparent',
        },
    ];

    // 按行为频率降序排列生活的重心
    const sortedCategories = [...data.categories].sort((a, b) => b.count - a.count);

    // 计算互动比/回响率
    const responseRate = stats.interactions > 0
        ? Math.round((stats.received / stats.interactions) * 100)
        : 0;

    // 净收支状态
    const isNetNegative = stats.net.startsWith('-');
    const isNetZero = stats.net === '0' || stats.net === '0.00';

    return (
        <div className="space-y-4">
            {/* 紧凑型核心指标 KPI 仪表盘 */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {cards.map(card => (
                    <div
                        key={card.label}
                        title={card.subLabel}
                        className={`group relative min-w-0 overflow-hidden rounded-xl border ${card.border} bg-white px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-2xs transition-all duration-150 hover:border-slate-300 hover:shadow-xs`}
                    >
                        <div
                            className={`pointer-events-none absolute -right-4 -bottom-4 h-12 w-12 rounded-full bg-gradient-to-br ${card.glow} blur-lg opacity-40 transition-opacity group-hover:opacity-80`}
                        />
                        <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-[11px] font-medium text-slate-500">{card.label}</span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${card.bg} ${card.color}`}>
                                <card.icon className="h-3 w-3"/>
                            </span>
                        </div>
                        <div className="mt-1 flex items-baseline gap-1">
                            <strong className="truncate text-base font-extrabold tracking-tight tabular-nums text-slate-800 sm:text-lg">
                                {card.value}
                            </strong>
                            {card.unit && <span className="shrink-0 text-[10px] font-medium text-slate-400">{card.unit}</span>}
                        </div>
                    </div>
                ))}
            </div>

            {/* 主内容区域网格 */}
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                {/* 活跃趋势 - 独占整行展示平滑趋势大盘 */}
                <Section
                    title="活跃趋势"
                    icon={TrendingUp}
                    wide
                    badge={
                        <div className="flex items-center gap-2 rounded-lg bg-orange-50/80 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                            <span>区间总行为</span>
                            <strong className="font-mono text-xs">{totalBehaviors} 次</strong>
                        </div>
                    }
                >
                    <ActivityChart data={data.daily} individual={individual}/>
                </Section>

                {/* 生活的重心 */}
                <Section
                    title="生活的重心"
                    icon={Sparkles}
                    description="按行为事件次数统计，占比高者即为该时期生活的核心投入方向。"
                    badge={
                        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                            <span>事件总数</span>
                            <strong className="font-mono text-xs text-slate-800">{totalCategoryEvents} 次</strong>
                        </div>
                    }
                >
                    <div className="space-y-2.5 pt-1">
                        {sortedCategories.map(row => {
                            const conf = categoryTheme[row.key] || {
                                label: row.name,
                                color: 'text-slate-600',
                                bar: 'bg-slate-400',
                                bg: 'bg-slate-50',
                                icon: Briefcase,
                            };
                            const IconComponent = conf.icon;
                            const isZero = row.count === 0;

                            return (
                                <div
                                    key={row.key}
                                    className={`flex items-center gap-3 rounded-xl p-1.5 transition-colors ${
                                        isZero ? 'opacity-40 hover:opacity-75' : 'hover:bg-slate-50'
                                    }`}
                                >
                                    <div className="flex w-16 shrink-0 items-center gap-1.5">
                                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${conf.bg} ${conf.color}`}>
                                            <IconComponent className="h-3 w-3"/>
                                        </span>
                                        <span className="truncate text-xs font-medium text-slate-700">{row.name}</span>
                                    </div>
                                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${conf.bar}`}
                                            style={{width: `${Math.max(row.percentage, isZero ? 0 : 3)}%`}}
                                        />
                                    </div>
                                    <div className="w-24 shrink-0 text-right tabular-nums">
                                        <span className="text-xs font-bold text-slate-700">{row.count} 次</span>
                                        <span className="ml-1 text-[11px] text-slate-400">({row.percentage}%)</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Section>

                {/* 创作与往来 */}
                <Section
                    title="创作与往来"
                    icon={BookOpenText}
                    description="作品按稳定作品 ID 去重；主动互动与收到回响分别统计，呈现社交人脉与吸引力。"
                >
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-violet-100/90 bg-violet-50/40 px-3 py-2 sm:py-2.5">
                            <div className="flex items-center gap-1 text-[11px] font-medium text-violet-700">
                                <BookOpenText className="h-3 w-3"/>
                                <span>创作作品</span>
                            </div>
                            <div className="mt-1 flex items-baseline gap-1">
                                <strong className="text-base sm:text-lg font-black tracking-tight tabular-nums text-violet-950">
                                    {stats.publications}
                                </strong>
                                <span className="text-[10px] font-medium text-violet-500">篇</span>
                            </div>
                        </div>
                        <div className="rounded-xl border border-rose-100/90 bg-rose-50/40 px-3 py-2 sm:py-2.5">
                            <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
                                <MessageCircle className="h-3 w-3"/>
                                <span>主动互动</span>
                            </div>
                            <div className="mt-1 flex items-baseline gap-1">
                                <strong className="text-base sm:text-lg font-black tracking-tight tabular-nums text-rose-950">
                                    {stats.interactions}
                                </strong>
                                <span className="text-[10px] font-medium text-rose-500">次</span>
                            </div>
                        </div>
                        <div className="rounded-xl border border-teal-100/90 bg-teal-50/40 px-3 py-2 sm:py-2.5">
                            <div className="flex items-center justify-between text-[11px] font-medium text-teal-700">
                                <div className="flex items-center gap-1">
                                    <MessageSquareQuote className="h-3 w-3"/>
                                    <span>收到回响</span>
                                </div>
                                {stats.interactions > 0 && (
                                    <span className="rounded bg-teal-100/80 px-1 py-0.2 text-[9px] font-bold text-teal-800">
                                        {responseRate}%
                                    </span>
                                )}
                            </div>
                            <div className="mt-1 flex items-baseline gap-1">
                                <strong className="text-base sm:text-lg font-black tracking-tight tabular-nums text-teal-950">
                                    {stats.received}
                                </strong>
                                <span className="text-[10px] font-medium text-teal-500">次</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5 text-orange-500"/>
                                <span>经常往来的对象</span>
                            </h4>
                            {data.peers.length > 0 && (
                                <span className="text-[10px] font-medium text-slate-400">
                                    共 {data.peers.length} 位往来
                                </span>
                            )}
                        </div>
                        {data.peers.length ? (
                            <div className="max-h-60 overflow-y-auto overscroll-contain scrollbar-hide space-y-1.5 pr-0.5">
                                {data.peers.map((peer, index) => {
                                    const peerAvatar = data.residents.find(r => r.id === peer.id)?.avatar;
                                    const rankBadge = index === 0
                                        ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                        : index === 1
                                          ? 'bg-slate-200 text-slate-700 border border-slate-300'
                                          : index === 2
                                            ? 'bg-orange-100 text-orange-800 border border-orange-200'
                                            : 'bg-slate-100 text-slate-500';

                                    return (
                                        <div
                                            key={peer.id}
                                            className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2 text-xs transition-colors hover:border-orange-200 hover:bg-orange-50/30"
                                        >
                                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${rankBadge}`}>
                                                {String(index + 1).padStart(2, '0')}
                                            </span>
                                            <AgentAvatar name={peer.name} avatar={peerAvatar} size="xs"/>
                                            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700" title={peer.name}>
                                                {peer.name}
                                            </span>
                                            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-orange-600 shadow-xs border border-orange-100">
                                                {peer.count} 次往来
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
                                统计区间内暂无居民往来记录
                            </div>
                        )}
                    </div>
                </Section>

                {/* 生活成果 */}
                <Section
                    title="生活成果"
                    icon={Sprout}
                    wide
                    description="农场操作、远行探索与冒险征途的沉浸式足迹，见证居民日常劳作与收获。"
                >
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        {/* 田园与耕作 */}
                        <div className="rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/50 to-white p-3 shadow-2xs">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                                    <Sprout className="h-3 w-3"/>
                                </span>
                                <span>田园耕作</span>
                            </div>
                            <div className="mt-2 space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">收获作物</span>
                                    <span className="font-bold tabular-nums text-slate-800">{outcomes.harvests} 次</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">畜牧产物</span>
                                    <span className="font-bold tabular-nums text-slate-800">{outcomes.collections} 次</span>
                                </div>
                            </div>
                        </div>

                        {/* 远行与足迹 */}
                        <div className="rounded-xl border border-teal-100 bg-gradient-to-b from-teal-50/50 to-white p-3 shadow-2xs">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-800">
                                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-100 text-teal-700">
                                    <Compass className="h-3 w-3"/>
                                </span>
                                <span>远行足迹</span>
                            </div>
                            <div className="mt-2 space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">完成旅行</span>
                                    <span className="font-bold tabular-nums text-slate-800">{outcomes.journeys} 次</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">打卡胜地</span>
                                    <span className="font-bold tabular-nums text-slate-800">{outcomes.destinations} 处</span>
                                </div>
                            </div>
                        </div>

                        {/* 冒险与试炼 */}
                        <div className="rounded-xl border border-rose-100 bg-gradient-to-b from-rose-50/50 to-white p-3 shadow-2xs">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-rose-100 text-rose-700">
                                    <Swords className="h-3 w-3"/>
                                </span>
                                <span>勇气试炼</span>
                            </div>
                            <div className="mt-2 space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">探险探索</span>
                                    <span className="font-bold tabular-nums text-slate-800">{outcomes.explorations} 次</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">战胜强敌</span>
                                    <span className="font-bold tabular-nums text-slate-800">{outcomes.wins} 场</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </Section>

                {/* 收支趋势 - 柱状对比与差额盈亏 */}
                <Section
                    title="收支趋势"
                    icon={Coins}
                    description="排除初始资金；柱状对比每日收入与支出，可勾选展示当日净盈亏正负差额。"
                    badge={
                        <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${
                            isNetZero
                                ? 'bg-slate-100 text-slate-600'
                                : isNetNegative
                                  ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>
                            <span>区间净收支</span>
                            <span className="font-mono">{analyticsMoney(stats.net)}</span>
                        </div>
                    }
                >
                    <FinanceChart data={data.daily}/>
                    <div className="mt-2.5 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs">
                        <div className="flex items-center gap-3.5">
                            <div>
                                <span className="text-slate-400">总流入：</span>
                                <strong className="font-semibold text-emerald-700">{analyticsMoney(stats.income)}</strong>
                            </div>
                            <div>
                                <span className="text-slate-400">总流出：</span>
                                <strong className="font-semibold text-rose-600">{analyticsMoney(stats.expense)}</strong>
                            </div>
                        </div>
                        <div className="text-[10px] text-slate-400">
                            账本已核验
                        </div>
                    </div>
                </Section>

                {/* 资金流向分布 */}
                <Section
                    title="资金从哪里来、到哪里去"
                    icon={Wallet}
                    description="世界汇总保留居民间交易的双方流水，直观查看各项收支模块。"
                >
                    {data.financeSources.length ? (
                        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/30">
                            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-[11px] font-semibold text-slate-400">
                                <span>资金类型</span>
                                <span className="w-24 text-right">收入流入</span>
                                <span className="w-24 text-right">支出流出</span>
                            </div>
                            {data.financeSources.map(row => (
                                <div key={row.kind} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-xs hover:bg-white transition-colors">
                                    <span className="truncate font-medium text-slate-700" title={financeLabels[row.kind] || row.kind}>
                                        {financeLabels[row.kind] || row.kind}
                                    </span>
                                    <span className="w-24 text-right tabular-nums font-semibold text-emerald-700">
                                        {row.income === '0' || row.income === '0.00' ? (
                                            <span className="text-slate-300 font-normal">-</span>
                                        ) : (
                                            `+${analyticsMoney(row.income)}`
                                        )}
                                    </span>
                                    <span className="w-24 text-right tabular-nums font-semibold text-rose-600">
                                        {row.expense === '0' || row.expense === '0.00' ? (
                                            <span className="text-slate-300 font-normal">-</span>
                                        ) : (
                                            `-${analyticsMoney(row.expense)}`
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400">
                            统计区间内暂无入账与支出流水记录
                        </div>
                    )}
                </Section>

                <Section title="大乐透统计" icon={Ticket} description="购票结果与实际资金收支分开展示，待开奖不计入中奖率。" wide>
                    <LotteryStatistics data={data.lotteryStatistics}/>
                </Section>

                <Section title="钓鱼统计" icon={Fish} description="按所选日期内的实际出钓、逐竿及捕获事实统计。普通鱼捕获率不含空竿、垃圾和鱼王。" wide>
                    <FishingStatistics rows={data.fishingComparison || []}/>
                </Section>

                <Section title="居民战斗经历排行榜" icon={Swords} description="比较实际探索与击败成果，点击居民打开战斗统计卡片。" wide>
                    <CombatResidentsRanking rows={data.combatComparison||[]} startDate={data.startDate} endDate={data.endDate}/>
                </Section>
                {/* 居民对比（多居民汇总模式） */}
                {!individual && (
                    <Section
                        title="居民生活对比排行榜"
                        icon={Users}
                        description="比较全镇居民活跃出勤、创作成果与经济收支。点击表头排序，点击居民查看区间内收支明细。"
                        wide
                    >
                        <ResidentsComparison rows={data.comparison} startDate={data.startDate} endDate={data.endDate}/>
                    </Section>
                )}
            </div>

            {/* 统计口径折叠提示 */}
            <details className="group rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 text-[11px] leading-relaxed text-slate-500 transition-colors hover:bg-slate-50">
                <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-700 select-none">
                    <span className="flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-slate-400"/>
                        统计口径与说明
                    </span>
                    <span className="text-xs text-slate-400 transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div className="mt-2.5 border-t border-slate-200/60 pt-2 text-slate-500 space-y-1">
                    <p>仅统计已保存并且当前账号可见的事实。工作按开始、旅行按出发、冒险按不可变出发记录计次；历史未记录的余额、体力及属性变化不推算。</p>
                    {data.notes.map(note => (
                        <p key={note}>{note}</p>
                    ))}
                </div>
            </details>
        </div>
    );
}
