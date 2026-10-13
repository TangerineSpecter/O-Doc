import {useState} from 'react';
import {ArrowDown, ArrowUp, ChevronRight} from 'lucide-react';
import type {CombatAnalyticsResident} from '../../../types/api/residentAnalytics';
import {combatDuration, sortCombatResidents} from '../../../utils/combatAnalytics';
import type {CombatRankingColumn} from '../../../utils/combatAnalytics';
import AgentAvatar from '../AgentAvatar';
import ResidentCombatCard from './ResidentCombatCard';

const columns: {key: CombatRankingColumn; label: string}[] = [
    {key:'kills',label:'击败魔物'}, {key:'bossKills',label:'首领'}, {key:'explorations',label:'探索次数'},
    {key:'successRate',label:'成功率'}, {key:'elapsedSeconds',label:'探索时长'}, {key:'experience',label:'经验'},
];
export default function CombatResidentsRanking({rows,startDate,endDate}: {rows:CombatAnalyticsResident[];startDate:string;endDate:string}) {
    const [column,setColumn]=useState<CombatRankingColumn>('kills');
    const [descending,setDescending]=useState(true);
    const [selectedId,setSelectedId]=useState('');
    const selected=rows.find(row=>row.id===selectedId);
    const ranked=sortCombatResidents(rows,column,descending);
    return <>
        <div className="scrollbar-hide max-h-[440px] overflow-auto rounded-xl">
            <table className="w-full min-w-[740px] text-xs"><thead className="sticky top-0 z-10 bg-slate-50 text-slate-500"><tr><th className="px-3 py-3 text-left">排名</th><th className="sticky left-0 z-20 min-w-36 bg-slate-50 px-3 py-3 text-left">居民</th>{columns.map(item=><th key={item.key} aria-sort={column===item.key?(descending?'descending':'ascending'):'none'} className="px-3 py-3 text-right"><button type="button" onClick={()=>{setColumn(item.key);setDescending(column===item.key?!descending:true);}} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${column===item.key?'bg-orange-100 text-orange-700':'hover:bg-slate-200'}`}>{item.label}{column===item.key&&(descending?<ArrowDown className="h-3 w-3"/>:<ArrowUp className="h-3 w-3"/>)}</button></th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{ranked.map((row,index)=><tr key={row.id} className="hover:bg-orange-50/30"><td className="px-3 py-3"><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold ${index<3?'bg-orange-100 text-orange-700':'text-slate-400'}`}>{index+1}</span></td><td className="sticky left-0 z-10 bg-white px-3 py-3"><button type="button" aria-label={`查看${row.name}的战斗经历`} onClick={()=>setSelectedId(row.id)} className="flex items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-300"><AgentAvatar name={row.name} avatar={row.avatar} size="xs"/><div><p className="font-semibold text-slate-800">{row.name}</p><p className="mt-1 text-[10px] text-slate-400">{row.departed?(row.archived?'已归档':'历史居民'):row.explorations?`${row.ongoing} 次未结算`:'暂无探索'}</p></div><ChevronRight className="h-3 w-3 text-slate-400"/></button></td>{columns.map(item=><td key={item.key} className="px-3 py-3 text-right tabular-nums text-slate-700">{item.key==='elapsedSeconds'?combatDuration(row.elapsedSeconds):item.key==='successRate'?(row.successRate===null?'—':`${row.successRate}%`):row[item.key]}</td>)}</tr>)}</tbody>
            </table>
            {!rows.length&&<p className="py-10 text-center text-xs text-slate-400">暂无可统计的居民</p>}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-400">默认按击败魔物、首领、经验依次排序。仅统计区间内实际出发的探索及其最新成果；未结算不进入成功率分母。点击居民查看完整战斗经历。</p>
        {selected&&<ResidentCombatCard key={`${selected.id}:${startDate}:${endDate}`} resident={selected} startDate={startDate} endDate={endDate} onClose={()=>setSelectedId('')}/>}
    </>;
}
