import {
    Crown,
    Compass,
    Clock,
    Sparkles,
    Zap,
    FlaskConical,
    Target,
    CheckCircle2,
    Undo2,
    BatteryLow,
    Skull,
    HelpCircle,
    Shield,
    Info,
    Swords,
} from 'lucide-react';
import type {CombatAnalyticsResident} from '../../../types/api/residentAnalytics';
import {combatDuration} from '../../../utils/combatAnalytics';
import AgentAvatar from '../AgentAvatar';
import WorldDialog from '../WorldDialog';
import {MonsterPortrait} from '../../Combat/atlas/MonsterPortrait';
import {ProfessionBadge} from '../ProfessionBadge';

export default function ResidentCombatCard({
    resident: row,
    startDate,
    endDate,
    onClose,
}: {
    resident: CombatAnalyticsResident;
    startDate: string;
    endDate: string;
    onClose: () => void;
}) {
    // 结局统计集合
    const outcomes = [
        {
            label: '圆满完成',
            count: row.completed,
            icon: CheckCircle2,
            activeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20',
            inactiveColor: 'bg-slate-50 text-slate-400 border-slate-200/70',
        },
        {
            label: '提前召回',
            count: row.recalled,
            icon: Undo2,
            activeColor: 'bg-sky-50 text-sky-700 border-sky-200 ring-sky-500/20',
            inactiveColor: 'bg-slate-50 text-slate-400 border-slate-200/70',
        },
        {
            label: '体力/额度耗尽',
            count: row.exhausted,
            icon: BatteryLow,
            activeColor: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20',
            inactiveColor: 'bg-slate-50 text-slate-400 border-slate-200/70',
        },
        {
            label: '力竭倒地',
            count: row.fallen,
            icon: Skull,
            activeColor: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20 font-bold',
            inactiveColor: 'bg-slate-50 text-slate-400 border-slate-200/70',
        },
        {
            label: '其他方式结束',
            count: row.otherEnded,
            icon: HelpCircle,
            activeColor: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20',
            inactiveColor: 'bg-slate-50 text-slate-400 border-slate-200/70',
        },
    ];

    // 成功率数值
    const successRateValue = row.successRate ?? 0;

    return (
        <WorldDialog
            title={`${row.name} · 战斗经历`}
            description={`${startDate} 至 ${endDate} 出发的探索 · 截至本次读取的实际成果`}
            onClose={onClose}
            size="wide"
        >
            <div className="scrollbar-hide flex-1 space-y-3 pb-2">
                {/* 1. 居民基本信息栏 (收敛高度，清爽紧凑，高度约 44px) */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/40 px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <AgentAvatar name={row.name} avatar={row.avatar} size="xs" />
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 truncate">{row.name}</h3>
                            <ProfessionBadge
                                professionName={row.jobName}
                                size="xs"
                                variant="indigo"
                                showEmpty
                                emptyText="未就职"
                                icon={Swords}
                            />
                            <span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-500 border border-slate-200/60">
                                {row.departed ? (row.archived ? '已归档' : '历史居民') : '城镇居民'}
                            </span>
                            {row.ongoing > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
                                    {row.ongoing} 次进行中
                                </span>
                            )}
                        </div>
                    </div>

                    {/* 右侧内联数据微指标 */}
                    <div className="flex items-center gap-2.5 text-xs text-slate-500">
                        <span>
                            累计击败 <strong className="font-bold text-orange-600 tabular-nums">{row.kills}</strong> 只
                        </span>
                        <span className="text-slate-300">·</span>
                        <span>
                            探索胜率 <strong className="font-bold text-emerald-700 tabular-nums">{row.successRate !== null ? `${row.successRate}%` : '—'}</strong>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span>
                            历练时长 <strong className="font-medium text-slate-700 tabular-nums">{combatDuration(row.elapsedSeconds)}</strong>
                        </span>
                    </div>
                </div>

                {/* 2. 核心战役数据矩阵 (4 宫格大指标卡，去除冗余套壳) */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {/* 首领魔物 */}
                    <div
                        className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${
                            row.bossKills > 0
                                ? 'border-amber-200/90 bg-gradient-to-br from-amber-50/80 to-yellow-50/60 shadow-2xs'
                                : 'border-slate-200/70 bg-white shadow-2xs'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-500">首领魔物讨伐</span>
                            <Crown
                                className={`h-4 w-4 ${
                                    row.bossKills > 0 ? 'text-amber-600 fill-amber-500/20' : 'text-slate-300'
                                }`}
                            />
                        </div>
                        <div className="mt-2.5">
                            <span className="text-xl font-black tabular-nums text-slate-900">
                                {row.bossKills}
                            </span>
                            <span className="ml-1 text-xs text-slate-400">只</span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                            {row.bossKills > 0 ? '已攻克危险地牢领主' : '未遭遇或尚未讨伐'}
                        </p>
                    </div>

                    {/* 历练获得经验 */}
                    <div className="flex flex-col justify-between rounded-xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/50 to-blue-50/40 p-3.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-indigo-700">历练经验收益</span>
                            <Sparkles className="h-4 w-4 text-indigo-500" />
                        </div>
                        <div className="mt-2.5">
                            <span className="text-xl font-black tabular-nums text-indigo-900">
                                +{row.experience}
                            </span>
                            <span className="ml-1 text-xs text-indigo-500">EXP</span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">强化角色能力与成长</p>
                    </div>

                    {/* 体力消耗 */}
                    <div className="flex flex-col justify-between rounded-xl border border-amber-100/90 bg-gradient-to-br from-amber-50/50 to-orange-50/40 p-3.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-amber-800">累计消耗体力</span>
                            <Zap className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="mt-2.5">
                            <span className="text-xl font-black tabular-nums text-slate-900">
                                {row.energy}
                            </span>
                            <span className="ml-1 text-xs text-slate-400">点</span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">出勤与战斗体能透支</p>
                    </div>

                    {/* 药剂消耗 */}
                    <div className="flex flex-col justify-between rounded-xl border border-sky-100/90 bg-gradient-to-br from-sky-50/50 to-blue-50/40 p-3.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-sky-800" title="普通红蓝药与炼金药水的实际使用总数">消耗药剂（含炼金）</span>
                            <FlaskConical className="h-4 w-4 text-sky-500" />
                        </div>
                        <div className="mt-2.5">
                            <span className="text-xl font-black tabular-nums text-slate-900">
                                {row.potions}
                            </span>
                            <span className="ml-1 text-xs text-slate-400">瓶</span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">生命与状态维系补给</p>
                    </div>
                </div>

                {/* 3. 探索出勤与效率全览 (双栏宽卡片，告别狭窄挤压) */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* 成功率与出勤卡 */}
                    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <Compass className="h-4 w-4 text-emerald-600" />
                                <h4 className="text-xs font-bold text-slate-900">探索历程与成功率</h4>
                            </div>
                            <span className="text-xs font-bold text-emerald-700 tabular-nums">
                                {row.successRate !== null ? `${row.successRate}%` : '暂无结算'}
                            </span>
                        </div>

                        {/* 进度条 */}
                        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                                style={{width: `${Math.min(100, Math.max(0, successRateValue))}%`}}
                            />
                        </div>

                        <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                            <div>
                                <p className="text-[10px] text-slate-400">总探索场次</p>
                                <p className="mt-0.5 text-xs font-bold text-slate-800">{row.explorations} 次</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400">按计划完成</p>
                                <p className="mt-0.5 text-xs font-bold text-emerald-700">{row.completed} 次</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400">进行中/暂停</p>
                                <p className="mt-0.5 text-xs font-bold text-amber-700">{row.ongoing} 次</p>
                            </div>
                        </div>
                    </div>

                    {/* 作战效率与时长卡 */}
                    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-sky-600" />
                                <h4 className="text-xs font-bold text-slate-900">时间与作战效率</h4>
                            </div>
                            <span className="text-[11px] text-slate-400">
                                每小时约 {row.killsPerHour !== null ? `${row.killsPerHour} 只` : '—'}
                            </span>
                        </div>

                        <div className="mt-3.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
                                <span className="text-slate-500">最长单次探索</span>
                                <span className="font-bold tabular-nums text-slate-800">
                                    {combatDuration(row.longestSeconds)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
                                <span className="text-slate-500">平均单次耗时</span>
                                <span className="font-bold tabular-nums text-slate-800">
                                    {combatDuration(row.averageSeconds)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. 探索结局分布 (轻巧胶囊列，不占过大高度) */}
                <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Target className="h-3.5 w-3.5 text-slate-600" />
                            <h4 className="text-xs font-bold text-slate-900">历次探索结局</h4>
                        </div>
                        <span className="text-[11px] text-slate-400">
                            共计结算 {row.settled} 场
                        </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {outcomes.map(item => {
                            const Icon = item.icon;
                            const hasCount = item.count > 0;
                            return (
                                <div
                                    key={item.label}
                                    className={`flex items-center justify-between rounded-lg border px-2.5 py-2 transition-colors ${
                                        hasCount ? item.activeColor : item.inactiveColor
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Icon className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate text-xs font-medium">{item.label}</span>
                                    </div>
                                    <span className="ml-1 text-xs font-black tabular-nums">
                                        {item.count}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* 5. 魔物击败明细 (精巧小卡片，图片限制为 40px，严禁过大) */}
                <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-orange-600" />
                            <h4 className="text-xs font-bold text-slate-900">魔物击败明细</h4>
                        </div>
                        <span className="text-[11px] text-slate-400">
                            收录 {row.monsters.length} 种魔物
                        </span>
                    </div>

                    {row.monsters.length ? (
                        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {row.monsters.map(monster => {
                                const killPercentage =
                                    row.kills > 0 ? Math.round((monster.kills / row.kills) * 100) : 0;
                                return (
                                    <div
                                        key={monster.id}
                                        className="group flex items-center gap-3 rounded-lg border border-slate-200/80 bg-slate-50/40 p-2.5 transition-all hover:border-orange-200 hover:bg-orange-50/30"
                                    >
                                        {/* 怪物小头像 (严格限制 40px × 40px，禁止溢出) */}
                                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white p-0.5 shadow-2xs">
                                            <MonsterPortrait
                                                monsterId={monster.id}
                                                name={monster.name}
                                                className="h-full w-full"
                                                fallbackClassName="h-6 w-6"
                                            />
                                        </div>

                                        {/* 怪物信息与小进度条 */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                                <p className="truncate text-xs font-bold text-slate-800">
                                                    {monster.name}
                                                </p>
                                                <span className="shrink-0 rounded-full bg-orange-100/90 px-2 py-0.5 text-[10px] font-black text-orange-700">
                                                    {monster.kills} 只
                                                </span>
                                            </div>

                                            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                                                <span className="rounded bg-amber-50 px-1 py-0.2 font-medium text-amber-700 border border-amber-200/60">
                                                    Lv.{monster.highestLevel}
                                                </span>
                                                <span>占 {killPercentage}%</span>
                                            </div>

                                            {/* 微型进度条 */}
                                            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200/60">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500"
                                                    style={{width: `${Math.min(100, Math.max(3, killPercentage))}%`}}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-6 text-center text-xs text-slate-400">
                            <Shield className="mx-auto mb-1.5 h-6 w-6 text-slate-300" />
                            <p>统计区间内暂无魔物击败记录</p>
                        </div>
                    )}

                    {row.unclassifiedKills > 0 && (
                        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-1.5 text-xs text-amber-800">
                            <Info className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <span>
                                另有 <strong>{row.unclassifiedKills}</strong> 次历史击败缺少魔物明细，已合并计入累计击败。
                            </span>
                        </div>
                    )}
                </section>

                {/* 6. 统计口径说明 */}
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-400">
                    <p className="flex items-center gap-1 font-medium text-slate-500">
                        <Info className="h-3 w-3 text-slate-400" />
                        统计口径说明
                    </p>
                    <p className="mt-0.5">
                        成功率 = 按计划完成 / 已结算探索；召回、倒地、体力耗尽等均计入分母。时长使用实际战斗推进秒数（不计暂停等待）。
                        组队共同击杀按本人参与记录计入，加入前和离队后的击杀不计；经验按本人实际获得累计，药剂包含普通药剂和炼金药水。
                    </p>
                </div>
            </div>
        </WorldDialog>
    );
}


