import {useMemo} from 'react';
import {ArrowRight, Clock3, Compass, Footprints, Heart, Package, PauseCircle, PlayCircle, ShieldAlert, Sparkles, Swords, Trophy, ScrollText} from 'lucide-react';
import type {CombatAction, CombatEvent} from '../../types/api/combat';
import {elapsed, actionText} from './presentation';
import {
    observationEventMessage,
    observationEventGroups,
    observationKills,
    parseSettlementReport,
    sanitizeGroupRows,
    type ParsedSettlement
} from './observationRecords';
import {MonsterPortrait} from './atlas/MonsterPortrait';

/** 击败魔物卡片 */
function KillCard({action}: {action: CombatAction}) {
    const monsterName = action.monster?.name || '魔物';
    const level = action.monster?.level;
    const rank = action.monster?.rank;
    const rewards = action.rewards || [];

    return (
        <article className="overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-teal-50/30 to-white p-2.5 shadow-2xs">
            <div className="flex items-center gap-2.5">
                {action.monster?.id ? (
                    <MonsterPortrait
                        monsterId={action.monster.id}
                        name={monsterName}
                        rank={rank}
                        decorative
                        className="h-8 w-8 shrink-0 rounded-lg bg-emerald-100/60 ring-1 ring-emerald-200/80"
                        fallbackClassName="h-4 w-4"
                    />
                ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100/70 text-emerald-700">
                        <Trophy className="h-4 w-4" />
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-800">击败 {monsterName}</span>
                        {level != null && (
                            <span className="rounded bg-emerald-100/80 px-1 py-0.2 font-mono text-[9px] font-semibold text-emerald-800">
                                Lv.{level}
                            </span>
                        )}
                        {rank === 'boss' && (
                            <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-bold text-amber-800">
                                BOSS
                            </span>
                        )}
                        {rank === 'elite' && (
                            <span className="rounded bg-purple-100 px-1 py-0.2 text-[9px] font-semibold text-purple-700">
                                精英
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-emerald-700/90">成功消灭盘踞此处的敌人</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-emerald-200/80 bg-white/90 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 shadow-2xs">
                    +{action.experience ?? 0} EXP
                </span>
            </div>

            {rewards.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-emerald-150/70 pt-2">
                    <span className="text-[10px] font-medium text-emerald-800/80">战利品:</span>
                    {rewards.map((reward, i) => (
                        <span
                            key={reward.id || i}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200/70 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 shadow-2xs"
                        >
                            <Package className="h-2.5 w-2.5 text-emerald-600" />
                            {'name' in reward.item ? reward.item.name : '物品'}
                            {(reward.quantity ?? 1) > 1 && ` ×${reward.quantity}`}
                        </span>
                    ))}
                </div>
            )}
        </article>
    );
}

/** 遭遇魔物卡片 */
function EncounterCard({action}: {action: CombatAction}) {
    return (
        <article className="flex items-center justify-between gap-2 rounded-xl border border-indigo-150/80 bg-gradient-to-r from-indigo-50/70 via-indigo-50/25 to-white px-2.5 py-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-100/80 text-indigo-600">
                    <Swords className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-slate-800">
                        遭遇魔物 · {action.name || '未知敌人'}
                    </p>
                    <p className="text-[10px] text-slate-400">前方发现敌对踪迹，进入战斗交锋</p>
                </div>
            </div>
            <span className="shrink-0 rounded bg-indigo-100/70 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                交战开始
            </span>
        </article>
    );
}

/** 攻防交锋卡片 */
function AttackCard({action, playerName}: {action: CombatAction; playerName?: string}) {
    const isPlayer = Boolean(playerName ? action.actor === playerName : action.target !== playerName);
    const isHeal = action.healing != null || action.restored != null;
    const isMiss = action.hit === false;
    const isCrit = Boolean(action.critical);
    const damage = action.damage;

    // 治疗行动
    if (isHeal) {
        return (
            <article className="flex items-center justify-between gap-2 rounded-xl border border-emerald-150/70 bg-gradient-to-r from-emerald-50/50 via-white to-white px-2.5 py-2 shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-600">
                        <Heart className="h-3 w-3" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-800">
                            {action.actor || '角色'} · {action.action || '回复生命'}
                        </p>
                        <p className="text-[10px] text-slate-400">生命值与体力获得恢复</p>
                    </div>
                </div>
                <span className="shrink-0 font-mono text-xs font-bold text-emerald-600 tabular-nums">
                    +{action.healing ?? action.restored}
                </span>
            </article>
        );
    }

    // 玩家反击/主动出击
    if (isPlayer) {
        return (
            <article className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 shadow-2xs transition-colors hover:border-orange-200/60">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${isCrit ? 'bg-amber-100 text-amber-600' : 'bg-orange-50 text-orange-600'}`}>
                        {isCrit ? <Sparkles className="h-3 w-3" /> : <Swords className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-bold text-slate-800">{action.actor || '我方'}</span>
                            {action.action && action.action !== '普通攻击' ? (
                                <span className="inline-flex items-center rounded border border-indigo-150 bg-indigo-50 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-700">
                                    {action.action}
                                </span>
                            ) : (
                                <span className="text-[11px] font-medium text-slate-600">普通攻击</span>
                            )}
                            {action.target && (
                                <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate max-w-[100px]">{action.target}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="shrink-0 text-right">
                    {isMiss ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                            未命中
                        </span>
                    ) : isCrit ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200/80 bg-amber-50/90 px-1.5 py-0.5 font-mono text-xs font-black text-amber-600 shadow-2xs">
                            <span className="text-[8px] font-bold text-amber-600">暴击</span>
                            −{damage}
                        </span>
                    ) : damage != null ? (
                        <span className="font-mono text-xs font-bold text-slate-800 tabular-nums">
                            −{damage}
                        </span>
                    ) : null}
                </div>
            </article>
        );
    }

    // 魔物攻击玩家（我方受击）
    return (
        <article className="flex items-center justify-between gap-2 rounded-xl border border-rose-100/80 bg-gradient-to-r from-rose-50/40 via-white to-white px-2.5 py-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                    <ShieldAlert className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-slate-700">{action.actor || '魔物'}</span>
                        <span className="text-[11px] text-slate-500">{action.action || '普通攻击'}</span>
                        {action.target && (
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                                <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate max-w-[100px]">{action.target}</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="shrink-0 text-right">
                {isMiss ? (
                    <span className="rounded border border-teal-200/60 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">
                        闪避
                    </span>
                ) : damage != null ? (
                    <span className="font-mono text-xs font-bold text-rose-600 tabular-nums">
                        −{damage}
                    </span>
                ) : null}
            </div>
        </article>
    );
}

/** 动作卡片调度 */
function ActionCard({action, playerName}: {action: CombatAction; playerName?: string}) {
    if (action.kind === 'kill') return <KillCard action={action} />;
    if (action.kind === 'encounter') return <EncounterCard action={action} />;
    return <AttackCard action={action} playerName={playerName} />;
}

/** 探索长总结卡片 */
function SettlementCard({report, parsed}: {report: string; parsed: ParsedSettlement | null}) {
    if (!parsed) {
        return (
            <article className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/60 via-orange-50/20 to-white p-2.5 text-[11px] leading-relaxed text-amber-900 shadow-2xs">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-800">
                    <ScrollText className="h-3.5 w-3.5 text-amber-600" />
                    <span>探索结算总结</span>
                </div>
                <p>{report}</p>
            </article>
        );
    }

    return (
        <article className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 via-orange-50/30 to-white p-3 shadow-2xs">
            <header className="flex items-center justify-between gap-2 border-b border-amber-100/70 pb-2">
                <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                        <ScrollText className="h-3 w-3" />
                    </span>
                    <h4 className="text-xs font-bold text-amber-950">迷宫探索总结报告</h4>
                </div>
                {parsed.level != null ? (
                    <span className="rounded-full bg-amber-100/80 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
                        返回 Lv.{parsed.level}
                    </span>
                ) : (
                    <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        探险完成
                    </span>
                )}
            </header>

            {/* 核心战绩数据标签 */}
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                {parsed.minutes != null && (
                    <div className="flex items-center justify-between rounded-lg border border-amber-100/80 bg-white/90 px-2 py-1 text-[11px]">
                        <span className="text-[10px] text-slate-400">探索时长</span>
                        <span className="font-mono font-bold text-slate-800">{parsed.minutes} 分钟</span>
                    </div>
                )}
                {parsed.kills != null && (
                    <div className="flex items-center justify-between rounded-lg border border-amber-100/80 bg-white/90 px-2 py-1 text-[11px]">
                        <span className="text-[10px] text-slate-400">击败魔物</span>
                        <span className="font-mono font-bold text-emerald-700">{parsed.kills} 只</span>
                    </div>
                )}
                {parsed.experience != null && (
                    <div className="flex items-center justify-between rounded-lg border border-amber-100/80 bg-white/90 px-2 py-1 text-[11px]">
                        <span className="text-[10px] text-slate-400">获得经验</span>
                        <span className="font-mono font-bold text-amber-700">+{parsed.experience}</span>
                    </div>
                )}
                {parsed.energy != null && (
                    <div className="flex items-center justify-between rounded-lg border border-amber-100/80 bg-white/90 px-2 py-1 text-[11px]">
                        <span className="text-[10px] text-slate-400">消耗体力</span>
                        <span className="font-mono font-bold text-slate-700">{parsed.energy}</span>
                    </div>
                )}
            </div>

            {/* 战利品清单 */}
            {parsed.loots && parsed.loots.length > 0 && (
                <div className="mt-2 rounded-xl border border-amber-100/60 bg-white/60 p-2">
                    <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold text-amber-900/90">
                        <Package className="h-3 w-3 text-amber-600" />
                        <span>探险收获 ({parsed.loots.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {parsed.loots.map(item => (
                            <span
                                key={item.name}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-200/60 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-2xs"
                            >
                                <span className="text-slate-800">{item.name}</span>
                                <span className="font-mono font-bold text-amber-700">×{item.count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* 药剂消耗与原因 */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
                {parsed.reason && <p className="truncate max-w-[220px]">{parsed.reason}</p>}
                {parsed.potions != null && parsed.potions > 0 && (
                    <span className="ml-auto font-medium text-slate-600">消耗药剂 {parsed.potions} 瓶</span>
                )}
            </div>
        </article>
    );
}

/** 系统事件卡片（出发、暂停、巡逻等） */
function SystemEventCard({event}: {event: CombatEvent}) {
    const isDepart = event.kind === 'depart';
    const isPause = event.kind === 'pause';
    const isResume = event.kind === 'resume';
    const isRound = event.kind === 'round';
    const msg = observationEventMessage(event);

    if (isDepart) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-slate-150 bg-slate-50/80 px-2.5 py-1.5 text-[11px] text-slate-600">
                <Compass className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="font-semibold text-slate-700">{msg}</span>
            </div>
        );
    }

    if (isPause) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-orange-200/80 bg-orange-50/70 px-2.5 py-1.5 text-[11px] text-orange-800">
                <PauseCircle className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                <span>{msg}</span>
            </div>
        );
    }

    if (isResume) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-teal-200/80 bg-teal-50/70 px-2.5 py-1.5 text-[11px] text-teal-800">
                <PlayCircle className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                <span>{msg}</span>
            </div>
        );
    }

    if (isRound) {
        return (
            <div className="flex items-center gap-1.5 py-1 pl-1 text-[10px] text-slate-400">
                <Footprints className="h-3 w-3 shrink-0 text-slate-300" />
                <span>深入迷宫通道，搜寻未知的魔物踪迹…</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-1.5 text-[11px] text-slate-500 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>{msg}</span>
        </div>
    );
}

/** 动态事件流 */
export function ObservationEvents({events, playerName}: {events: CombatEvent[]; playerName?: string}) {
    const rawGroups = observationEventGroups(events);

    // 智能提取该组的核心标签
    const groupsWithMeta = useMemo(() => {
        return rawGroups.map(group => {
            const rows = sanitizeGroupRows(group.rows);
            const hasReport = rows.some(r => Boolean(r.payload.report));
            const hasKill = rows.some(r => r.payload.events?.some(a => a.kind === 'kill'));
            const hasEncounter = rows.some(r => r.payload.events?.some(a => a.kind === 'encounter'));
            const hasActions = rows.some(r => (r.payload.events?.length ?? 0) > 0);

            let badge: {text: string; className: string} | null = null;
            if (hasReport) {
                badge = {text: '探索结算', className: 'bg-amber-50 text-amber-800'};
            } else if (hasKill) {
                badge = {text: '魔物讨伐', className: 'bg-emerald-50 text-emerald-700'};
            } else if (hasEncounter) {
                badge = {text: '遭遇交锋', className: 'bg-indigo-50 text-indigo-700'};
            } else if (hasActions) {
                badge = {text: '交战回合', className: 'bg-slate-50 text-slate-500'};
            }

            return {
                ...group,
                rows,
                badge,
            };
        });
    }, [rawGroups]);

    return (
        <div className="space-y-4">
            {groupsWithMeta.map(group => (
                <section key={group.key} aria-label={`探索 ${elapsed(group.seconds)} 的战报`}>
                    {/* 吸顶时间标签栏：无边框天蓝色极简设计 */}
                    <div className="sticky -top-3 z-10 -mx-1 flex items-center gap-2 bg-white/95 px-1 py-1.5 backdrop-blur-sm">
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-sky-600">
                            <Clock3 className="h-3 w-3 text-sky-500" />
                            <time dateTime={`PT${group.seconds}S`} className="font-mono text-[11px] font-bold tracking-tight text-sky-600">
                                {elapsed(group.seconds)}
                            </time>
                        </span>
                        <span className="h-px flex-1 bg-gradient-to-r from-sky-100 via-slate-100 to-transparent" />
                        {group.badge && (
                            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${group.badge.className}`}>
                                {group.badge.text}
                            </span>
                        )}
                    </div>

                    {/* 连贯时间轴导轨 */}
                    <div className="relative ml-2 space-y-2 border-l border-slate-200/80 pl-3 pb-1">
                        {group.rows.map(row => {
                            if (row.payload.report) {
                                const parsed = parseSettlementReport(row.payload.report);
                                return (
                                    <div key={row.id} className="relative">
                                        <span className="absolute -left-[15px] top-2 h-1.5 w-1.5 rounded-full bg-amber-400 ring-2 ring-white" />
                                        <SettlementCard report={row.payload.report} parsed={parsed} />
                                    </div>
                                );
                            }

                            if (row.payload.events?.length) {
                                return (
                                    <div key={row.id} className="relative space-y-1.5">
                                        <span className="absolute -left-[15px] top-2 h-1.5 w-1.5 rounded-full bg-sky-400 ring-2 ring-white" />
                                        {row.payload.events.map((action, index) => (
                                            <ActionCard key={index} action={action} playerName={playerName} />
                                        ))}
                                    </div>
                                );
                            }

                            return (
                                <div key={row.id} className="relative">
                                    <span className="absolute -left-[15px] top-2 h-1.5 w-1.5 rounded-full bg-slate-300 ring-2 ring-white" />
                                    <SystemEventCard event={row} />
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}

            {!events.length && (
                <ObservationEmpty
                    label="等待第一条战报"
                    description="探索动作会持续播放，确认的战斗记录将按时间线实时呈现。"
                />
            )}
        </div>
    );
}

/** 击败记录列表 */
export function ObservationKills({events, total}: {events: CombatEvent[]; total: number}) {
    const records = observationKills(events);
    return (
        <div>
            <div className="mb-3 flex items-center justify-between rounded-xl border border-emerald-150/80 bg-gradient-to-r from-emerald-50 via-teal-50/30 to-white px-3 py-2.5 shadow-2xs">
                <span className="text-xs font-semibold text-emerald-800">已确认击败魔物</span>
                <strong className="font-mono text-lg font-bold text-emerald-900 tabular-nums">
                    {total}
                    <span className="ml-1 text-[10px] font-normal text-emerald-700">只</span>
                </strong>
            </div>

            <div className="space-y-2">
                {records.map(({key, action, seconds}) => (
                    <article
                        key={key}
                        className="flex items-center gap-2.5 rounded-xl border border-slate-150/80 bg-white p-2.5 shadow-2xs transition-all hover:border-emerald-200"
                    >
                        <MonsterPortrait
                            monsterId={action.monster?.id || ''}
                            name={action.monster?.name}
                            rank={action.monster?.rank}
                            decorative
                            className="h-10 w-10 shrink-0 rounded-lg bg-slate-50 ring-1 ring-slate-100"
                            fallbackClassName="h-5 w-5"
                        />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <p className="truncate text-xs font-bold text-slate-800">
                                    {action.monster?.name || '怪物'}
                                </p>
                                {action.monster?.rank === 'boss' && (
                                    <span className="rounded bg-amber-100 px-1 py-0.2 text-[8px] font-bold text-amber-800">
                                        BOSS
                                    </span>
                                )}
                                {action.monster?.rank === 'elite' && (
                                    <span className="rounded bg-purple-100 px-1 py-0.2 text-[8px] font-semibold text-purple-700">
                                        精英
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                                {action.monster && `Lv.${action.monster.level} · `}
                                {elapsed(seconds)}
                            </p>
                        </div>
                        <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 border border-emerald-150">
                            EXP +{action.experience ?? 0}
                        </span>
                    </article>
                ))}
            </div>

            {!records.length && (
                <ObservationEmpty
                    label="尚无击败记录"
                    description="击败结果确认后，魔物战利与所得经验会在此归档。"
                />
            )}
            {total > records.length && (
                <p className="mt-3 text-[10px] leading-4 text-slate-400">
                    此处显示已加载的击败记录，累计数量以总战报为准。
                </p>
            )}
        </div>
    );
}

/** 空状态卡片 */
export function ObservationEmpty({label, description}: {label: string; description: string}) {
    return (
        <div className="py-12 text-center">
            <Sparkles className="mx-auto mb-3 h-6 w-6 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">{label}</p>
            <p className="mx-auto mt-1.5 max-w-[210px] text-[10px] leading-5 text-slate-400">
                {description}
            </p>
        </div>
    );
}
