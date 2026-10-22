import {createPortal} from 'react-dom';
import {useEffect, useRef} from 'react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {Crown, Flame, Heart, Sparkles, Swords, X, Zap} from 'lucide-react';
import type {DuelEvent, DuelParticipant, TournamentMatchDetail} from '../../types/api/tournament';
import {reasonLabel} from './tournamentLabels';

function actionBadgeClass(action: string) {
    if (action.includes('反击')) {
        return 'bg-sky-50 text-sky-700 border-sky-200';
    }
    if (action.includes('斩') || action.includes('炎') || action.includes('雷') || action.includes('术') || action.includes('刺')) {
        return 'bg-orange-50 text-orange-700 border-orange-200 font-semibold';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
}

function EventRow({event, names, winnerId}: {event: DuelEvent; names: Record<string, string>; winnerId?: string}) {
    const isActorWinner = event.actor === winnerId;
    const actorName = names[event.actor] || event.actor;
    const targetName = event.target ? (names[event.target] || event.target) : '';

    return (
        <div className="flex flex-wrap items-center gap-1.5 py-1 text-xs">
            <span className={`inline-flex items-center gap-1 font-semibold ${isActorWinner ? 'text-amber-800' : 'text-slate-700'}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${isActorWinner ? 'bg-amber-500' : 'bg-slate-400'}`} />
                {actorName}
            </span>

            {targetName && (
                <>
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-600">{targetName}</span>
                </>
            )}

            <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] leading-tight ${actionBadgeClass(event.action)}`}>
                {event.action}
            </span>

            {event.damage !== undefined && (
                event.hit === false ? (
                    <span className="font-medium text-slate-400">（未命中 MISS）</span>
                ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-600">
                        造成 {event.damage} 伤害
                        {event.critical && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.2 text-[10px] font-bold text-amber-800">
                                <Sparkles className="h-2.5 w-2.5" />
                                暴击
                            </span>
                        )}
                    </span>
                )
            )}

            {event.healing !== undefined && (
                <span className="font-semibold text-emerald-600">
                    恢复 {event.healing} 生命
                </span>
            )}

            {event.restored !== undefined && (
                <span className="font-semibold text-sky-600">
                    恢复 {event.restored} 法力
                </span>
            )}
        </div>
    );
}

function ParticipantCard({
    participant,
    isWinner,
    finalResource,
}: {
    participant: DuelParticipant;
    isWinner: boolean;
    finalResource?: {hp: number; mp: number};
}) {
    const hpMax = Number(participant.stats.hpMax) || 1;
    const mpMax = Number(participant.stats.mpMax) || 1;
    const currentHp = finalResource ? Math.max(0, finalResource.hp) : hpMax;
    const currentMp = finalResource ? Math.max(0, finalResource.mp) : mpMax;
    const hpPercent = Math.min(100, Math.round((currentHp / hpMax) * 100));
    const mpPercent = Math.min(100, Math.round((currentMp / mpMax) * 100));

    return (
        <div className={`relative flex flex-col justify-between overflow-hidden rounded-xl border p-3.5 transition-all ${
            isWinner
                ? 'border-amber-300 bg-gradient-to-br from-amber-50/70 via-white to-orange-50/40 shadow-sm'
                : 'border-slate-200 bg-white/80'
        }`}>
            {isWinner && (
                <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    <Crown className="h-3 w-3 text-amber-600 fill-amber-500" />
                    胜出晋级
                </div>
            )}

            <div>
                <div className="flex items-center gap-2">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${
                        isWinner
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                        {participant.name.slice(0, 1)}
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900">{participant.name}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-500">
                                Lv.{participant.level}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">{participant.profession}</p>
                    </div>
                </div>

                {/* 状态血量条与魔力条 */}
                <div className="mt-3 space-y-1.5">
                    <div>
                        <div className="flex justify-between text-[11px] font-medium text-slate-600">
                            <span className="inline-flex items-center gap-1 text-slate-500">
                                <Heart className="h-3 w-3 text-rose-500 fill-rose-500/20" /> 生命
                            </span>
                            <span className="font-mono text-xs">{currentHp} / {hpMax}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                    hpPercent > 50 ? 'bg-emerald-500' : hpPercent > 20 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{width: `${hpPercent}%`}}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-[11px] font-medium text-slate-600">
                            <span className="inline-flex items-center gap-1 text-slate-500">
                                <Zap className="h-3 w-3 text-sky-500 fill-sky-500/20" /> 法力
                            </span>
                            <span className="font-mono text-xs">{currentMp} / {mpMax}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                                style={{width: `${mpPercent}%`}}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* 属性微芯片 */}
            <div className="mt-3 grid grid-cols-4 gap-1 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                <div>物攻 <strong className="font-semibold text-slate-700">{participant.stats.physicalAttack}</strong></div>
                <div>魔攻 <strong className="font-semibold text-slate-700">{participant.stats.magicAttack}</strong></div>
                <div>物防 <strong className="font-semibold text-slate-700">{participant.stats.physicalDefense}</strong></div>
                <div>魔防 <strong className="font-semibold text-slate-700">{participant.stats.magicDefense}</strong></div>
            </div>
        </div>
    );
}

export function TournamentReport({
    match,
    error,
    onClose,
}: {
    match: TournamentMatchDetail | null;
    error: string;
    onClose: () => void;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);
    useEscapeDismissal(true, onClose);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        return () => { previous?.focus(); };
    }, []);

    const names = Object.fromEntries((match?.report.participants || []).map(p => [p.actorId, p.name]));
    const winnerId = match?.result?.winnerId;
    const participants = match?.report?.participants || [];
    const rounds = match?.report?.rounds || [];
    const lastRound = rounds.length ? rounds[rounds.length - 1] : undefined;
    const finalResourceMap = new Map(lastRound?.resources.map(r => [r.actorId, r]) || []);

    return createPortal(
        <div
            data-modal-scroll-lock
            className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
            onKeyDown={event => {
                if (event.key === 'Tab') {
                    event.preventDefault();
                    closeRef.current?.focus();
                }
            }}
        >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" onClick={onClose} />

            <section
                role="dialog"
                aria-modal="true"
                aria-label="比赛战报"
                className="relative flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
                {/* 弹窗 Header */}
                <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-gradient-to-r from-slate-50 to-white">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 border border-orange-200">
                            <Swords size={16} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-base">比赛对决战报</h3>
                            <p className="text-xs text-slate-500">
                                {match?.kind === 'bronze' ? '季军荣誉争夺战' : '淘汰赛正赛回合复盘'}
                            </p>
                        </div>
                    </div>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        aria-label="关闭战报"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                {/* 弹窗主体内容 */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-hide">
                    {error ? (
                        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</p>
                    ) : !match ? (
                        <p className="py-12 text-center text-sm text-slate-400">正在调取回合战报数据…</p>
                    ) : (
                        <>
                            {/* 胜负状态 Banner */}
                            <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 border border-slate-200/80">
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <Flame size={14} className="text-orange-500" />
                                    战局结算：
                                    <span className="text-orange-600 font-bold">
                                        {reasonLabel[match.result.reason || ''] || '决胜击败'}
                                    </span>
                                </span>
                                {winnerId && (
                                    <span className="text-xs text-slate-500 font-medium">
                                        胜者：<strong className="text-slate-800">{names[winnerId] || winnerId}</strong>
                                    </span>
                                )}
                            </div>

                            {/* 双雄对峙选手卡片 */}
                            {participants.length === 2 && (
                                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                                    <ParticipantCard
                                        participant={participants[0]}
                                        isWinner={participants[0].actorId === winnerId}
                                        finalResource={finalResourceMap.get(participants[0].actorId)}
                                    />
                                    <ParticipantCard
                                        participant={participants[1]}
                                        isWinner={participants[1].actorId === winnerId}
                                        finalResource={finalResourceMap.get(participants[1].actorId)}
                                    />
                                </div>
                            )}

                            {/* 回合战斗记录 */}
                            <div className="space-y-3">
                                <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                                    <span>回合交锋记录</span>
                                    <span className="h-px flex-1 bg-slate-100" />
                                </h4>

                                {rounds.map((round) => (
                                    <div
                                        key={round.number}
                                        className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 transition-colors hover:bg-slate-50"
                                    >
                                        <div className="mb-2 flex items-center justify-between border-b border-slate-200/50 pb-2">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                                <span className="rounded bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-mono font-bold text-slate-700">
                                                    第 {round.number} 回合
                                                </span>
                                                {round.overtime && (
                                                    <span className="rounded bg-rose-50 px-1.5 py-0.2 text-[10px] font-semibold text-rose-600 border border-rose-200">
                                                        加赛 · 禁疗决战
                                                    </span>
                                                )}
                                            </span>

                                            {/* 该回合资源快照 */}
                                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                                {round.resources.map(r => (
                                                    <span key={r.actorId} className="font-mono">
                                                        {names[r.actorId] || r.actorId}：
                                                        <span className={r.hp <= 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                                                            {r.hp} HP
                                                        </span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="divide-y divide-slate-100/60">
                                            {round.events.map((event, i) => (
                                                <EventRow
                                                    key={i}
                                                    event={event}
                                                    names={names}
                                                    winnerId={winnerId}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                {!rounds.length && (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                                        对手弃权或本轮轮空，无需交战直接晋级。
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </section>
        </div>,
        document.body
    );
}
