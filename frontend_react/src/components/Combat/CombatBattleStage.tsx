import {useEffect,useMemo,useRef,useState} from 'react';
import {Pause,Play} from 'lucide-react';
import type {CombatSnapshot} from '../../types/api/combat';
import {battleBackgroundArt} from './art/battleBackgroundArt';
import {professionConcepts} from './art/professionConcepts';
import CombatFighterStatus from './CombatFighterStatus';
import type {BattleBackgroundId} from './art/battleBackgroundArt';
import {observationVisual} from './animation/observation/observationPresentation';
import type {ObservationBattleScene} from './animation/observation/ObservationBattleScene';

/** React owns mounting and controls; Pixi owns choreography, never combat state. */
export default function CombatBattleStage({snapshot,disconnected=false,fit=false}:{snapshot:CombatSnapshot;disconnected?:boolean;fit?:boolean}) {
    const host=useRef<HTMLDivElement>(null),scene=useRef<ObservationBattleScene|null>(null);
    const visual=useMemo(()=>observationVisual(snapshot,disconnected),[snapshot,disconnected]);
    const latest=useRef(visual);
    const [phase,setPhase]=useState('加载场景'),[ready,setReady]=useState(false),[error,setError]=useState('');
    const [paused,setPaused]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
    const pauseRef=useRef(paused);
    useEffect(()=>{latest.current=visual;scene.current?.update(visual);},[visual]);
    useEffect(()=>{
        let active=true;
        void import('./animation/observation/ObservationBattleScene').then(async ({ObservationBattleScene})=>{
            if(!active||!host.current)return;
            const instance=new ObservationBattleScene(host.current,latest.current,setPhase,setError);scene.current=instance;
            await instance.init();if(active){instance.setPaused(pauseRef.current);setReady(true);}
        }).catch(error=>{if(active)setError(error instanceof Error?error.message:'战斗画面加载失败');});
        return ()=>{active=false;scene.current?.dispose();scene.current=null;};
    },[]);
    useEffect(()=>{pauseRef.current=paused;scene.current?.setPaused(paused);},[paused]);
    useEffect(()=>{
        const preference=matchMedia('(prefers-reduced-motion: reduce)');
        const change=()=>{if(preference.matches)setPaused(true);};
        preference.addEventListener('change',change);return ()=>preference.removeEventListener('change',change);
    },[]);
    const map=battleBackgroundArt[visual.dungeonId as BattleBackgroundId];
    const profession=professionConcepts.find(item=>item.id===visual.jobId)?.name||'居民';
    const rank=({normal:'普通',elite:'精英',boss:'首领'} as Record<string,string>)[snapshot.enemy?.rank||'']||'怪物';
    const hud=<><CombatFighterStatus entity={snapshot.player} label={profession}/><CombatFighterStatus entity={snapshot.enemy} label={rank} enemy/></>;
    return <section className={`relative w-full shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-[#304642] ${fit?'lg:w-[min(100cqw,170.212766cqh)]':''}`} aria-label="探索战斗画面">
        <div className="relative aspect-[720/423]">
            <div ref={host} className="h-full w-full"/>
            <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2 sm:inset-x-4 sm:top-4">
            <span className="rounded-lg border border-white/10 bg-slate-950/50 px-2.5 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur-sm">{map?.name??'探索场景'}</span>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 py-1 pl-3 pr-1 text-white/80 backdrop-blur-sm"><span className="text-[10px]">{paused?'画面已暂停':phase}</span>
                <button type="button" aria-label={paused?'继续战斗画面':'暂停战斗画面'} aria-pressed={paused}
                    onClick={()=>setPaused(value=>!value)} className="rounded-full bg-white/15 p-1.5 hover:bg-white/25">
                    {paused?<Play className="h-3.5 w-3.5"/>:<Pause className="h-3.5 w-3.5"/>}</button></div>
            </div>
            {!ready&&!error&&<p role="status" className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">加载战斗画面…</p>}
            {error&&<p role="status" className="absolute inset-x-4 top-1/2 rounded-xl bg-white/90 px-3 py-2 text-xs text-slate-600">画面暂未加载，仍可查看数值和战报。</p>}
            {!visual.hasEnemy&&ready&&!phase.startsWith('击败 ·')&&<span className="pointer-events-none absolute right-[15%] top-[45%] rounded-full bg-white/75 px-3 py-1.5 text-xs text-slate-500">{snapshot.status==='active'?'等待遭遇':'探索已停止'}</span>}
            <div className="absolute inset-x-3 bottom-3 hidden grid-cols-2 gap-[12%] sm:grid sm:inset-x-4">{hud}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-2 sm:hidden">{hud}</div>
    </section>;
}
