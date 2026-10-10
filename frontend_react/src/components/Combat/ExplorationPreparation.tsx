import {useState} from 'react';
import {Select} from '../common/Select';
import type {CombatCatalog, CombatProfile} from '../../types/api/combat';
export default function ExplorationPreparation({catalog, profile, busy, onStart}: {catalog: CombatCatalog; profile: CombatProfile; busy: boolean; onStart: (constraints: Record<string, string | number>) => void}) {
    const recommended = [...catalog.tables.dungeons.filter(row => row.enabled === '1')].reverse().find(d => Number(d.recommendedLevelMin) <= profile.progression.level)?.id || catalog.tables.dungeons[0].id;
    const [dungeon, setDungeon] = useState(recommended);
    const [duration, setDuration] = useState('1800');
    const [style, setStyle] = useState('style.balanced');
    const selected = catalog.tables.styles.find(row => row.id === style);
    return <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
        <h3 className="font-semibold text-slate-800">准备一场探索</h3><p className="mt-1 text-xs text-slate-500">你指定目的地、时长和风格，居民决定换装、采购与携带药剂。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><Select menuPortal value={dungeon} onChange={setDungeon} options={catalog.tables.dungeons.filter(row => row.enabled === '1').map(row => ({value:row.id,label:`${row.name} · Lv.${row.recommendedLevelMin}–${row.recommendedLevelMax}`}))}/><Select menuPortal value={duration} onChange={setDuration} options={[{value:'1800',label:'30 分钟'},{value:'3600',label:'1 小时'},{value:'7200',label:'2 小时'}]}/><Select menuPortal value={style} onChange={setStyle} options={catalog.tables.styles.filter(row => row.enabled === '1').map(row => ({value:row.id,label:row.name || row.id}))}/></div>
        <p className="mt-3 text-xs text-slate-600">探索预计消耗 {10 + 2 * Math.ceil(Number(duration)/300)} 体力；若需补给，市场入场另消耗 5 体力。</p>
        {selected && <p className="mt-2 text-xs text-slate-500">普攻倾向 {selected.attackWeight} · 技能倾向 {selected.skillWeight} · 血量低于 {Math.round(Number(selected.healThreshold)*100)}% 时提高药剂使用概率</p>}
        {profile.restUntil && <p className="mt-2 text-xs text-amber-700">倒地休息至 {new Date(profile.restUntil).toLocaleTimeString('zh-CN')}</p>}
        <button disabled={busy || Boolean(profile.activeExplorationId)} onClick={() => onStart({dungeonId:dungeon, durationSeconds:Number(duration), styleId:style})} className="mt-4 rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">让居民准备出发</button>
    </section>;
}
