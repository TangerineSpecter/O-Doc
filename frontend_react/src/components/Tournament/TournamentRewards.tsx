import {AlertCircle, CheckCircle2, Clock, Medal, Sparkles, Trophy} from 'lucide-react';
import type {TournamentDetail, TournamentPotion} from '../../types/api/tournament';
import {placeLabel, slotLabel} from './tournamentLabels';
import {TournamentAvatar} from './TournamentAvatar';
import {EquipmentPortrait} from '../Combat/atlas/EquipmentPortrait';
import {PotionPortrait} from '../Combat/atlas/PotionPortrait';

interface TournamentRewardsProps {
    event: TournamentDetail;
    residents?: {id: string; name: string; avatar?: string}[];
}

function resolvePotionId(potion: TournamentPotion): string {
    const raw = potion.recipeId || '';
    if (raw.startsWith('elixir.') || raw.startsWith('potion.')) return raw;
    const map: Record<string, string> = {
        healing: 'elixir.healing',
        iron: 'elixir.iron',
        fury: 'elixir.fury',
        focus: 'elixir.focus',
        regen: 'elixir.regen',
        arcane: 'elixir.arcane',
        ember: 'elixir.ember',
        aegis: 'elixir.aegis',
        star: 'elixir.star',
        purify: 'elixir.purify',
    };
    if (map[raw]) return map[raw];
    const name = potion.name || '';
    if (name.includes('愈合') || name.includes('治疗')) return 'elixir.healing';
    if (name.includes('铁壁')) return 'elixir.iron';
    if (name.includes('狂暴')) return 'elixir.fury';
    if (name.includes('灵思') || name.includes('回蓝')) return 'elixir.focus';
    if (name.includes('活力') || name.includes('再生')) return 'elixir.regen';
    if (name.includes('奥术')) return 'elixir.arcane';
    if (name.includes('余烬')) return 'elixir.ember';
    if (name.includes('圣佑')) return 'elixir.aegis';
    if (name.includes('星辉')) return 'elixir.star';
    if (name.includes('净化')) return 'elixir.purify';
    return 'elixir.healing';
}

export function TournamentRewards({event, residents}: TournamentRewardsProps) {
    const names = Object.fromEntries([
        ...(residents || []).map(r => [r.id, r.name] as const),
        ...event.roster.map(r => [r.id, r.name] as const),
    ]);
    const avatars = Object.fromEntries([
        ...(residents || []).map(r => [r.id, r.avatar || ''] as const),
        ...event.roster.map(r => [r.id, r.avatar || ''] as const),
    ]);

    const placeConfigs = {
        1: {
            title: placeLabel[1] || '冠军',
            sub: '1st',
            cardBg: 'border-amber-200/90 bg-gradient-to-b from-amber-50/70 via-amber-50/20 to-white shadow-amber-500/5',
            badgeBg: 'bg-amber-100/90 text-amber-800 border-amber-300/80',
            nameColor: 'text-amber-950',
            Icon: Trophy,
            iconColor: 'text-amber-500',
        },
        2: {
            title: placeLabel[2] || '亚军',
            sub: '2nd',
            cardBg: 'border-blue-200/90 bg-gradient-to-b from-blue-50/60 via-slate-50/20 to-white shadow-blue-500/5',
            badgeBg: 'bg-blue-50 text-blue-700 border-blue-200/80',
            nameColor: 'text-slate-900',
            Icon: Medal,
            iconColor: 'text-blue-500',
        },
        3: {
            title: placeLabel[3] || '季军',
            sub: '3rd',
            cardBg: 'border-orange-200/90 bg-gradient-to-b from-orange-50/50 via-amber-50/15 to-white shadow-orange-500/5',
            badgeBg: 'bg-orange-50 text-orange-800 border-orange-200/80',
            nameColor: 'text-slate-900',
            Icon: Medal,
            iconColor: 'text-orange-600',
        },
    } as const;

    return (
        <div className="grid gap-3.5 md:grid-cols-3">
            {([1, 2, 3] as const).map(place => {
                const reward = event.rewards.find(r => r.place === place);
                const actor = event.result.podium?.[String(place)];
                const config = placeConfigs[place];
                const Icon = config.Icon;
                const actorName = actor ? (names[actor] || actor) : '';
                const actorAvatar = actor ? avatars[actor] : undefined;

                const unavailableText = !actor
                    ? event.status === 'active'
                        ? '名次决出后公布奖品'
                        : event.status === 'skipped'
                        ? '未开赛，不发奖'
                        : '该名次无奖励'
                    : reward?.status === 'forfeited'
                    ? '居民已退出 · 未发放奖品'
                    : null;

                const statusConfig = reward ? {
                    granted: {label: '已发入背包', icon: CheckCircle2, style: 'bg-emerald-50 text-emerald-700 border-emerald-200/80'},
                    rolled: {label: '已生成 · 等待入库', icon: Sparkles, style: 'bg-blue-50 text-blue-700 border-blue-200/80'},
                    pending: {label: '等待生成奖品', icon: Clock, style: 'bg-amber-50 text-amber-700 border-amber-200/80'},
                    forfeited: {label: '居民已退出 · 不发奖', icon: AlertCircle, style: 'bg-slate-100 text-slate-500 border-slate-200'},
                }[reward.status] : null;

                return (
                    <div
                        key={place}
                        className={`flex flex-col justify-between rounded-xl border p-3 sm:p-3.5 shadow-sm transition-all ${config.cardBg}`}
                    >
                        <div>
                            {/* 头部：荣誉名次与奖牌 */}
                            <div className="flex items-center justify-between">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold shadow-2xs ${config.badgeBg}`}>
                                    <Icon className={`h-3.5 w-3.5 ${config.iconColor}`} />
                                    {config.title}
                                </span>
                                <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                                    {config.sub}
                                </span>
                            </div>

                            {/* 获奖居民信息 */}
                            <div className="mt-2 flex items-center gap-2.5">
                                {actor ? (
                                    <>
                                        <TournamentAvatar
                                            name={actorName}
                                            avatar={actorAvatar}
                                            place={place}
                                            size="sm"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className={`truncate text-sm font-bold sm:text-base ${config.nameColor}`}>
                                                {actorName}
                                            </p>
                                            <p className="text-[10px] text-slate-400">参赛获胜居民</p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white/70 text-xs text-slate-300">
                                            ?
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-slate-400">
                                                {event.status === 'active' ? '等待决出名次' : '名次空缺'}
                                            </p>
                                            <p className="text-[10px] text-slate-400">
                                                {event.status === 'active' ? '赛程进行中' : '未产生获奖者'}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 奖品内容卡片 */}
                            <div className="mt-2 border-t border-slate-100/80 pt-2">
                                {unavailableText ? (
                                    <div className="rounded-lg border border-slate-100 bg-white/60 p-2 text-center text-xs text-slate-400">
                                        {unavailableText}
                                    </div>
                                ) : reward?.result.item ? (
                                    <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-white/80 p-2 shadow-2xs">
                                        <div
                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border p-1 shadow-2xs ${
                                                place === 1
                                                    ? 'border-amber-300/80 bg-gradient-to-br from-amber-50 to-amber-100/60'
                                                    : 'border-blue-300/80 bg-gradient-to-br from-blue-50 to-blue-100/60'
                                            }`}
                                        >
                                            <EquipmentPortrait
                                                equipmentId={reward.result.slot ? `equip.${reward.result.slot}.${reward.result.item.level}` : ''}
                                                name={reward.result.item.name}
                                                slot={reward.result.item.slot || reward.result.slot}
                                                equipmentType={reward.result.item.slot || reward.result.slot}
                                                decorative
                                                className="h-full w-full object-contain"
                                                fallbackClassName="h-5 w-5"
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className={`truncate text-xs font-bold sm:text-sm ${
                                                        place === 1 ? 'text-amber-800' : 'text-blue-700'
                                                    }`}
                                                >
                                                    {reward.result.item.name}
                                                </span>
                                                <span
                                                    className={`shrink-0 rounded px-1.5 py-0.2 text-[9.5px] font-bold ${
                                                        place === 1
                                                            ? 'bg-amber-100 text-amber-800'
                                                            : 'bg-blue-100 text-blue-700'
                                                    }`}
                                                >
                                                    {place === 1 ? '金装' : '蓝装'}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 text-[11px] text-slate-500">
                                                Lv.{reward.result.item.level} · {slotLabel[reward.result.slot || ''] || reward.result.item.slot}
                                            </p>
                                        </div>
                                    </div>
                                ) : reward?.result.potions ? (
                                    <div className="space-y-1 rounded-lg border border-slate-100 bg-white/80 p-1.5 shadow-2xs">
                                        {reward.result.potions.map((potion, idx) => {
                                            const potionId = resolvePotionId(potion);
                                            return (
                                                <div
                                                    key={idx}
                                                    className="flex items-center justify-between gap-1.5 rounded-md bg-slate-50/70 px-1.5 py-0.5"
                                                >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white p-0.5 shadow-2xs">
                                                            <PotionPortrait
                                                                potionId={potionId}
                                                                name={potion.name}
                                                                decorative
                                                                className="h-full w-full object-contain"
                                                            />
                                                        </div>
                                                        <span className="truncate text-[11px] font-semibold text-slate-700">
                                                            {potion.name}
                                                        </span>
                                                    </div>
                                                    <span className="shrink-0 rounded bg-amber-50 px-1 py-0.2 font-mono text-[9.5px] font-bold text-amber-700 border border-amber-200/60">
                                                        ★ {potion.stars} 星 × {potion.quantity || 1}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-slate-100 bg-white/60 p-2 text-center text-xs text-slate-500">
                                        {reward
                                            ? place === 3
                                                ? '一星炼金药水 × 3'
                                                : `随机${place === 1 ? '金' : '蓝'}装 × 1`
                                            : '暂无奖品配置'}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 底部：发放状态 */}
                        {statusConfig && (
                            <div className="mt-2 pt-1">
                                <span
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-2xs ${statusConfig.style}`}
                                >
                                    <statusConfig.icon className="h-3 w-3" />
                                    {statusConfig.label}
                                </span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
