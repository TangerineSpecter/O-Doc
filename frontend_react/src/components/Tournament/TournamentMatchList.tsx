import {ChevronRight, Crown} from 'lucide-react';
import type {TournamentRound} from '../../types/api/tournament';
import {dateLabel, reasonLabel} from './tournamentLabels';
import './tournamentTree.css';

export function TournamentMatchList({round, names, onMatch}: {round: TournamentRound; names: Record<string, string>; onMatch: (id: string) => void}) {
    const title = round.phase === 'preliminary' ? '资格附加赛' : round.phase === 'final' ? '决赛' : `${round.entrantCount} 强赛`;
    return <section className="tournament-list" aria-label={`${title}对阵`}>
        <header className="tournament-list-header"><div><h3>{title}</h3><p>{dateLabel(round.scheduledAt)} · {round.status === 'done' ? '已完成' : '等待开赛'}</p></div><span className="tournament-list-count">{round.matches.length} 场对阵</span></header>
        <div className="tournament-match-rows scrollbar-hide">
            {round.matches.map(match => <button key={match.id} type="button" disabled={match.status !== 'done' || !match.rightId} onClick={() => onMatch(match.id)} aria-label={`${names[match.leftId] || match.leftId} 对 ${names[match.rightId] || '轮空'}${match.status === 'done' && match.rightId ? '，查看战报' : ''}`} className="tournament-match-row">
                <span className="tournament-match-number">{match.number}</span>
                <span className="min-w-0"><span className="tournament-match-pair">
                    {[match.leftId, match.rightId].map((id, index) => <span key={index} className="contents">{index === 1 && <span className="tournament-match-versus">vs</span>}<span className={`tournament-match-person ${id && match.result?.winnerId === id ? 'is-winner' : ''}`}><span>{id ? names[id] || id : '轮空'}</span>{id && match.result?.winnerId === id && <Crown size={12}/>}</span></span>)}
                </span><span className="tournament-match-result">{match.kind === 'bronze' ? '季军赛 · ' : ''}{match.status === 'done' ? reasonLabel[match.result?.reason || ''] || '已完赛' : '等待开赛'}{match.status === 'done' && match.rightId ? ' · 查看战报' : ''}</span></span>
                {match.status === 'done' && match.rightId && <ChevronRight size={16}/>}
            </button>)}
            {!round.matches.length && <p className="p-8 text-center text-sm text-slate-500">对阵尚未公布</p>}
        </div>
    </section>;
}
