import {useState} from 'react';
import {CalendarDays, GitBranch, Trophy} from 'lucide-react';
import type {TournamentDetail, TournamentRound} from '../../types/api/tournament';
import {TournamentTree} from './TournamentTree';
import {TournamentMatchList} from './TournamentMatchList';

function roundTitle(round: TournamentRound) {
    if (round.phase === 'preliminary') return `资格赛 · 第 ${round.number} 轮`;
    if (round.phase === 'final') return '决赛';
    if (round.entrantCount === 4) return '半决赛 · 4 强';
    return `${round.entrantCount} 强`;
}

export function TournamentBracket({
    event,
    onMatch,
    residents,
}: {
    event: TournamentDetail;
    onMatch: (id: string) => void;
    residents?: {id: string; name: string; avatar?: string}[];
}) {
    const [view, setView] = useState<'bracket' | 'list'>(() => window.matchMedia('(max-width: 1100px)').matches ? 'list' : 'bracket');
    const [roundId, setRoundId] = useState('');
    const selected = event.rounds.find(r => r.id === roundId) || event.rounds.find(r => r.phase !== 'preliminary') || event.rounds[0];
    const names = Object.fromEntries([
        ...(residents || []).map(r => [r.id, r.name] as const),
        ...event.roster.map(r => [r.id, r.name] as const),
    ]);
    return <div className="tournament-workspace">
        <div className="tournament-workspace-toolbar">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><GitBranch className="h-3.5 w-3.5 text-orange-500"/>赛程与对阵</span>
            <div className="tournament-view-toggle">{([{id:'bracket', label:'晋级图', Icon:Trophy}, {id:'list', label:'每日轮次表', Icon:CalendarDays}] as const).map(({id,label,Icon}) => <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id}><Icon size={13}/>{label}</button>)}</div>
        </div>
        {view === 'bracket' ? <>
            <TournamentTree event={event} onMatch={onMatch} residents={residents}/>
            {event.rounds.filter(r => r.phase === 'preliminary').map(r => <details key={r.id} className="tournament-preliminary"><summary className="cursor-pointer text-xs font-medium text-slate-600">{roundTitle(r)} <span className="ml-2 font-normal text-slate-500">{r.entrantCount} 人 · {r.matches.length} 场</span></summary><div className="mt-3"><TournamentMatchList round={r} names={names} onMatch={onMatch}/></div></details>)}
        </> : <div className="tournament-schedule">
            <nav className="tournament-round-nav scrollbar-hide" aria-label="比赛轮次"><h3>比赛轮次</h3>{event.rounds.map(r => <button key={r.id} type="button" onClick={() => setRoundId(r.id)} aria-pressed={selected?.id === r.id}>{roundTitle(r)}<span>{r.matches.length} 场</span></button>)}</nav>
            {selected ? <TournamentMatchList round={selected} names={names} onMatch={onMatch}/> : <p className="py-8 text-center text-sm text-slate-500">赛程尚未公布</p>}
        </div>}
    </div>;
}
