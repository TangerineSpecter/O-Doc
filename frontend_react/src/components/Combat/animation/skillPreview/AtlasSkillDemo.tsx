import {useEffect,useRef,useState} from 'react';
import {Pause,Play,RotateCcw} from 'lucide-react';
import {AtlasSkillScene} from './AtlasSkillScene';
import type {SkillPlayback} from './AtlasSkillScene';
import type {AtlasSkillProfile} from './atlasSkillProfiles';
import {independentWeapons} from '../playerAppearance/layeredPlayerArt';
import {PlayerPortrait} from '../../atlas/PlayerPortrait';

export default function AtlasSkillDemo({jobId,jobName,skill}:{jobId:string;jobName:string;skill:AtlasSkillProfile}) {
    const host=useRef<HTMLDivElement>(null),scene=useRef<AtlasSkillScene|null>(null);
    const [ready,setReady]=useState(false),[failed,setFailed]=useState(false);
    const [weapon,setWeapon]=useState(skill.weapon);
    const [playback,setPlayback]=useState<SkillPlayback>({time:0,duration:skill.duration,status:'playing'});
    useEffect(()=>{
        if(!host.current)return;
        let alive=true;
        const renderer=new AtlasSkillScene(host.current,jobId,skill,state=>{if(alive)setPlayback(state);});scene.current=renderer;
        void renderer.init().then(()=>{if(alive)setReady(true);}).catch(()=>{renderer.dispose();if(alive)setFailed(true);});
        return()=>{alive=false;scene.current=null;renderer.dispose();};
    },[jobId,skill]);
    return <div className="space-y-3" data-skill-preview-id={skill.id} data-playback-status={failed?'error':ready?playback.status:'loading'}>
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[#eef5ef]" style={{aspectRatio:'640/420'}}>
            <div ref={host} className={`absolute inset-0 ${ready?'':'invisible'}`}/>
            {!ready&&<div className="absolute inset-0 flex flex-col items-center justify-center">
                <PlayerPortrait jobId={jobId} name={jobName} className="h-44 w-44"/>
                <p className="text-xs text-slate-500" role="status">{failed?'动画加载失败，保留静态形象':'正在加载技能预览…'}</p>
            </div>}
            <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px] text-slate-600">苔石洞窟 · 技能演示</span>
            <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-semibold text-slate-600" aria-live="polite">
                {playback.status==='finished'?'演示结束':playback.status==='paused'?'已暂停':'释放中'}
            </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!ready||failed} onClick={()=>scene.current?.replay()}
                className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 disabled:opacity-40">
                <RotateCcw className="h-3.5 w-3.5"/>重播技能
            </button>
            <button type="button" disabled={!ready||failed||playback.status==='finished'} onClick={()=>scene.current?.togglePause()}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-600 disabled:opacity-40">
                {playback.status==='paused'?<Play className="h-3.5 w-3.5"/>:<Pause className="h-3.5 w-3.5"/>}{playback.status==='paused'?'继续':'暂停'}
            </button>
            <label className="flex min-w-[150px] flex-1 items-center gap-2 text-[10px] text-slate-500">
                <span>进度</span><input aria-label="技能进度" type="range" min="0" max={skill.duration} step="0.01" value={playback.time}
                    disabled={!ready||failed} onChange={e=>scene.current?.seek(Number(e.target.value))} className="min-w-0 flex-1 accent-orange-500"/>
                <span className="w-16 text-right tabular-nums">{playback.time.toFixed(1)} / {skill.duration.toFixed(1)}s</span>
            </label>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-[10px] font-medium text-slate-500">演示装备</p>
            <div className="flex flex-wrap gap-1.5" aria-label="技能演示武器">
                {[{id:'none',name:'空手'},...independentWeapons].map(item=><button key={item.id} type="button" aria-pressed={weapon===item.id}
                    onClick={()=>{setWeapon(item.id);scene.current?.setWeapon(item.id);}}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${weapon===item.id?'border-orange-200 bg-orange-50 font-semibold text-orange-700':'border-slate-200 bg-white text-slate-600'}`}>{item.name}</button>)}
            </div>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-400">技能视觉演示；可替换演示武器，实际技能和装备沿用角色已学技能与穿戴规则。</p>
    </div>;
}
