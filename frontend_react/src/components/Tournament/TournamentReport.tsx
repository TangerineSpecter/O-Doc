import {X} from 'lucide-react';
import type {DuelEvent, TournamentMatchDetail} from '../../types/api/tournament';
import {reasonLabel} from './tournamentLabels';

function eventText(event: DuelEvent, names: Record<string, string>) {
    const target = event.target ? ` → ${names[event.target] || event.target}` : '';
    const amount = event.damage !== undefined ? event.hit === false ? '未命中' : `造成 ${event.damage} 伤害${event.critical ? '（暴击）' : ''}`
        : event.healing !== undefined ? `恢复 ${event.healing} 生命` : event.restored !== undefined ? `恢复 ${event.restored} 法力` : '';
    return `${names[event.actor] || event.actor}${target} · ${event.action}${amount ? ` · ${amount}` : ''}`;
}

export function TournamentReport({match, error, onClose}: {match: TournamentMatchDetail | null; error: string; onClose: () => void}) {
    const names = Object.fromEntries((match?.report.participants || []).map(p => [p.actorId, p.name]));
    return <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm" aria-label="比赛战报">
        <div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-slate-900">比赛战报</h3><button type="button" onClick={onClose} aria-label="关闭战报" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button></div>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : !match ? <p className="text-sm text-slate-400">正在读取战报…</p> : <>
            <p className="mb-4 text-sm text-orange-700">{reasonLabel[match.result.reason || ''] || '比赛尚未开始'}</p>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">{match.report.participants?.map(p => <div key={p.actorId} className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{p.name} <span className="font-normal text-slate-500">Lv.{p.level} · {p.profession}</span></p>
                <p className="mt-1 text-xs leading-5 text-slate-500">生命 {p.stats.hpMax} · 法力 {p.stats.mpMax} · 物攻 {p.stats.physicalAttack} · 魔攻 {p.stats.magicAttack}<br/>物防 {p.stats.physicalDefense} · 魔防 {p.stats.magicDefense} · 已学技能 {Object.keys(p.skills).length}</p>
            </div>)}</div>
            <div className="max-h-80 space-y-3 overflow-y-auto scrollbar-hide">{match.report.rounds?.map(round => <div key={round.number} className="border-t border-slate-100 pt-3">
                <p className="mb-1 text-xs font-semibold text-slate-500">第 {round.number} 回合{round.overtime ? ' · 禁止生命恢复加赛' : ''}</p>
                {round.events.map((event, i) => <p key={i} className="py-0.5 text-xs leading-5 text-slate-700">{eventText(event, names)}</p>)}
                <p className="mt-1 text-xs text-slate-400">{round.resources.map(r => `${names[r.actorId] || r.actorId}：HP ${r.hp} / MP ${r.mp}`).join('　·　')}</p>
            </div>)}</div>
            {!match.report.rounds?.length && <p className="text-sm text-slate-500">轮空或弃权，无交战记录。</p>}
        </>}
    </section>;
}
