import {useState} from 'react';
import {ProfessionAtlasView} from '../components/Combat/atlas/ProfessionAtlasView';
import {EquipmentAtlasView} from '../components/Combat/atlas/EquipmentAtlasView';
import {MaterialAtlasView} from '../components/Combat/atlas/MaterialAtlasView';
import {MonsterAtlasView} from '../components/Combat/atlas/MonsterAtlasView';
import {PlayerPortrait} from '../components/Combat/atlas/PlayerPortrait';
import {auraNames,getProfessionAura} from '../components/Combat/art/professionAuras';
import {SkillPreviewDialog} from '../components/Combat/atlas/SkillPreviewDialog';
import {atlasSkillProfiles} from '../components/Combat/animation/skillPreview/atlasSkillProfiles';
import type {AtlasSkillProfile} from '../components/Combat/animation/skillPreview/atlasSkillProfiles';
import type {CombatCatalog} from '../types/api/combat';
import fixture from './combatAtlasFixture.json';
const catalog:CombatCatalog=fixture;
export default function CombatAtlasPreviewApp() {
    const [tab,setTab]=useState(()=>new URLSearchParams(location.search).get('tab')==='monsters'?'monsters':'professions'),[preview,setPreview]=useState<AtlasSkillProfile|null>(null);
    const skills=catalog.tables.skills;
    const skillJob=preview?.id==='preview.novice.strike'?'job.novice':skills.find(s=>s.id===preview?.id)?.professionId||'job.novice';
    return <main className="flex h-dvh flex-col bg-slate-50 p-3 text-slate-800 sm:p-6">
        <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold tracking-widest text-slate-400">ADVENTURE ATLAS / ART PREVIEW</p><h1 className="mt-1 text-xl font-bold">冒险图鉴</h1></div>
            <nav className="flex flex-wrap gap-1 rounded-full border border-slate-200 bg-white p-1" aria-label="图鉴预览分类">
                {[['professions','职业 · 29'],['monsters','怪物 · 24'],['equipment','装备'],['materials','材料 · 24'],['overview','形象总览'],['skills','技能总览']].map(([id,name])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tab===id?'bg-orange-50 text-orange-700':'text-slate-500'}`}>{name}</button>)}
            </nav>
        </header>
        <div className="min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            {tab==='professions'?<ProfessionAtlasView catalog={catalog}/>:tab==='monsters'?<MonsterAtlasView catalog={catalog} initialMonsterId={new URLSearchParams(location.search).get('monster')||'monster.mine_rat'}/>:tab==='equipment'?<EquipmentAtlasView catalog={catalog}/>:tab==='materials'?<MaterialAtlasView catalog={catalog}/>:tab==='overview'?
                <div className="scrollbar-hide grid h-full grid-cols-2 gap-4 overflow-auto sm:grid-cols-4 lg:grid-cols-6">{catalog.tables.professions.map(job=><article key={job.id} className="rounded-2xl border border-slate-200 bg-slate-50/40 p-2 text-center">
                    <PlayerPortrait jobId={job.id} name={job.name} className="h-44 w-full"/><h2 className="text-xs font-bold">{job.name}</h2><p className="mt-1 text-[9px] text-slate-400">{auraNames[getProfessionAura(job.id)]}</p>
                </article>)}</div>:
                <div className="scrollbar-hide grid h-full grid-cols-2 content-start gap-3 overflow-auto sm:grid-cols-4 lg:grid-cols-6">{atlasSkillProfiles.map(skill=><button type="button" key={skill.id} onClick={()=>setPreview(skill)} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left">
                    <span className="text-[10px] text-slate-400">{skill.id==='preview.novice.strike'?'新手':catalog.tables.professions.find(job=>job.id===skills.find(s=>s.id===skill.id)?.professionId)?.name} · {skill.target==='self'?'自身':'目标'}</span>
                    <strong className="mt-1 block text-sm">{skill.name}</strong><span className="mt-2 block text-[10px] text-orange-600">播放技能 →</span>
                </button>)}</div>}
        </div>
        {preview&&<SkillPreviewDialog jobId={skillJob} jobName={catalog.tables.professions.find(job=>job.id===skillJob)?.name||'新手'} skill={preview} onClose={()=>setPreview(null)}/>}
    </main>;
}
