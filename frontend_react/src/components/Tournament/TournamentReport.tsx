import {createPortal} from 'react-dom';
import {useEffect, useRef, useState} from 'react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {Bot, Crown, Flame, Heart, Sparkles, Swords, X, Zap} from 'lucide-react';
import type {DuelEvent, DuelParticipant, TournamentMatchDetail} from '../../types/api/tournament';
import {reasonLabel} from './tournamentLabels';

function actionBadgeClass(event: DuelEvent) {
    if (event.kind === 'heal' || event.kind === 'hot' || event.kind === 'passive_recovery') {
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium';
    }
    if (event.kind === 'potion') {
        if (event.healing !== undefined) return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium';
        if (event.restored !== undefined) return 'bg-sky-50 text-sky-700 border-sky-200 font-medium';
        return 'bg-slate-100 text-slate-700 border-slate-200 font-medium';
    }
    if (event.kind === 'defend' || event.kind === 'modifier' || event.kind === 'shield') {
        return 'bg-slate-100 text-slate-700 border-slate-200 font-medium';
    }
    if (event.kind === 'reflect' || event.kind === 'mp_share') {
        return 'bg-sky-50 text-sky-700 border-sky-200 font-medium';
    }
    if (event.kind !== 'damage' && event.kind !== 'dot') {
        return 'bg-slate-100 text-slate-700 border-slate-200 font-medium';
    }

    const action = event.action;
    if (action.includes('反击') || action.includes('反伤')) {
        return 'bg-sky-50 text-sky-700 border-sky-200 font-medium';
    }
    if (action.includes('普通攻击') || action === '攻击' || action.endsWith('攻击')) {
        return 'bg-rose-50 text-rose-700 border-rose-200 font-medium';
    }
    if (action.includes('盾击')) {
        return 'bg-orange-50 text-orange-700 border-orange-200 font-medium';
    }
    if (
        action.includes('防') ||
        action.includes('盾') ||
        action.includes('闪') ||
        action.includes('障') ||
        action.includes('壁') ||
        action.includes('铠') ||
        action.includes('结界') ||
        action.includes('庇佑') ||
        action.includes('护')
    ) {
        return 'bg-slate-100 text-slate-700 border-slate-200 font-medium';
    }
    if (
        action.includes('斩') ||
        action.includes('炎') ||
        action.includes('雷') ||
        action.includes('术') ||
        action.includes('刺') ||
        action.includes('射') ||
        action.includes('箭') ||
        action.includes('击') ||
        action.includes('弹') ||
        action.includes('刃') ||
        action.includes('袭') ||
        action.includes('爆') ||
        action.includes('咒') ||
        action.includes('裂') ||
        action.includes('破') ||
        action.includes('音') ||
        action.includes('光') ||
        action.includes('狂怒') ||
        action.includes('毒') ||
        action.includes('爪') ||
        action.includes('咬') ||
        action.includes('拳') ||
        action.includes('曲') ||
        action.includes('乐') ||
        action.includes('攻')
    ) {
        return 'bg-orange-50 text-orange-700 border-orange-200 font-medium';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200 font-medium';
}

function EventRow({
    event,
    names,
    winnerId,
    avatar,
}: {
    event: DuelEvent;
    names: Record<string, string>;
    winnerId?: string;
    avatar?: string;
}) {
    const isActorWinner = event.actor === winnerId;
    const actorName = names[event.actor] || event.actor;
    const targetName = event.target ? (names[event.target] || event.target) : '';

    return (
        <div className="flex flex-wrap items-center gap-1.5 py-1 text-xs">
            <span className={`inline-flex items-center gap-1 font-semibold ${isActorWinner ? 'text-amber-800' : 'text-slate-700'}`}>
                {avatar ? (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200">
                        {/^(https?:|data:|\/)/.test(avatar) ? (
                            <img src={avatar} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-[9px] leading-none">{avatar}</span>
                        )}
                    </span>
                ) : (
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${isActorWinner ? 'bg-amber-500' : 'bg-slate-400'}`} />
                )}
                {actorName}
            </span>

            {targetName && (
                <>
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-600">{targetName}</span>
                </>
            )}

            <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] leading-tight ${actionBadgeClass(event)}`}>
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

function ParticipantAvatar({avatar, name, isWinner}: {avatar?: string; name: string; isWinner: boolean}) {
    const [failed, setFailed] = useState(false);
    const isImage = Boolean(avatar && /^(https?:|data:|\/)/.test(avatar));
    if (isImage && !failed) {
        return (
            <img
                src={avatar}
                alt={name}
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
            />
        );
    }
    if (avatar && !isImage) {
        return <span className="text-lg leading-none">{avatar}</span>;
    }
    return <Bot className={`h-5 w-5 ${isWinner ? 'text-white' : 'text-slate-400'}`} />;
}

function ParticipantCard({
    participant,
    avatar,
    isWinner,
    finalResource,
}: {
    participant: DuelParticipant;
    avatar?: string;
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
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl font-bold text-sm ${
                        isWinner
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-xs border border-amber-300'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                        <ParticipantAvatar avatar={avatar} name={participant.name} isWinner={isWinner} />
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
    residents,
    roster,
}: {
    match: TournamentMatchDetail | null;
    error: string;
    onClose: () => void;
    residents?: {id: string; name: string; avatar?: string}[];
    roster?: {id: string; name: string; avatar?: string}[];
}) {
    const closeRef = useRef<HTMLButtonElement>(null);
    useEscapeDismissal(true, onClose);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        return () => { previous?.focus(); };
    }, []);

    const getParticipantId = (p: DuelParticipant) => p.actorId;

    const avatarById = Object.fromEntries([
        ...(residents || []).map(r => [r.id, r.avatar || '']),
        ...(roster || []).map(r => [r.id, r.avatar || '']),
    ]);
    const avatarByName = Object.fromEntries([
        ...(residents || []).map(r => [r.name, r.avatar || '']),
        ...(roster || []).map(r => [r.name, r.avatar || '']),
    ]);

    const getParticipantAvatar = (p?: DuelParticipant) => {
        if (!p) return '';
        const id = getParticipantId(p);
        return p.avatar || avatarById[id] || avatarByName[p.name] || '';
    };

    const names = Object.fromEntries([
        ...(residents || []).map(r => [r.id, r.name]),
        ...(roster || []).map(r => [r.id, r.name]),
        ...(match?.report.participants || []).map(p => [getParticipantId(p), p.name]),
    ]);

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
                                        avatar={getParticipantAvatar(participants[0])}
                                        isWinner={Boolean(winnerId && (getParticipantId(participants[0]) === winnerId || participants[0].name === names[winnerId] || participants[0].name === winnerId))}
                                        finalResource={finalResourceMap.get(getParticipantId(participants[0]))}
                                    />
                                    <ParticipantCard
                                        participant={participants[1]}
                                        avatar={getParticipantAvatar(participants[1])}
                                        isWinner={Boolean(winnerId && (getParticipantId(participants[1]) === winnerId || participants[1].name === names[winnerId] || participants[1].name === winnerId))}
                                        finalResource={finalResourceMap.get(getParticipantId(participants[1]))}
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
                                                {round.resources.map(r => {
                                                    const aid = r.actorId;
                                                    return (
                                                        <span key={aid} className="font-mono">
                                                            {names[aid] || aid}：
                                                            <span className={r.hp <= 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                                                                {r.hp} HP
                                                            </span>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="divide-y divide-slate-100/60">
                                            {round.events.map((event, i) => (
                                                <EventRow
                                                    key={i}
                                                    event={event}
                                                    names={names}
                                                    winnerId={winnerId}
                                                    avatar={avatarById[event.actor] || avatarByName[names[event.actor] || event.actor]}
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
