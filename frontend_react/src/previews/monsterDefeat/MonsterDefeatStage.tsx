import {useEffect,useRef,useState} from 'react';
import {MonsterDefeatScene} from './MonsterDefeatScene';
import type {DefeatPlayback} from './MonsterDefeatScene';
import type {DefeatPreviewMonster} from './defeatPreviewArt';
import {battleBackgroundArt} from '../../components/Combat/art/battleBackgroundArt';
import type {BattleBackdrop} from '../../components/Combat/art/battleBackgroundArt';
interface StageProps {monster:DefeatPreviewMonster;backdrop:BattleBackdrop;onBackdropChange:(value:BattleBackdrop)=>void}
export default function MonsterDefeatStage({monster,backdrop,onBackdropChange}:StageProps) {
    const host=useRef<HTMLDivElement>(null),scene=useRef<MonsterDefeatScene|null>(null);
    const [playback,setPlayback]=useState<DefeatPlayback>({time:0,duration:3.5,paused:false,phase:'加载形象',finished:false});
    const [loop,setLoop]=useState(false),[slow,setSlow]=useState(false),[error,setError]=useState('');
    useEffect(()=>{
        let active=true;
        const instance=new MonsterDefeatScene(host.current!,monster,setPlayback);scene.current=instance;
        instance.init().then(()=>{if(active)instance.seek(.5);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'预览加载失败');});
        return ()=>{active=false;scene.current=null;instance.dispose();};
    },[monster]);
    useEffect(()=>{scene.current?.setBackdrop(backdrop);},[backdrop,monster]);
    return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 px-5 py-4 text-sm"><span className="font-semibold text-slate-700">法师 <span className="mx-2 text-slate-300">→</span> {monster.name}</span>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700" aria-live="polite">{playback.phase}</span></div>
        <div ref={host} className="aspect-[720/423] w-full bg-[#e8efed]" />
        {error&&<p role="alert" className="p-4 text-sm text-red-700">{error}</p>}
        <div className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
                <span className="text-xs font-semibold text-slate-500">场景对照</span>
                <div aria-label="选择地图背景" className="flex flex-wrap gap-2">
                    {Object.values(battleBackgroundArt).map(item=><button key={item.id} aria-pressed={backdrop===item.id}
                        onClick={()=>onBackdropChange(item.id)} className={`rounded-full border px-3 py-2 text-xs ${backdrop===item.id?'border-teal-200 bg-teal-50 font-semibold text-teal-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{item.name}</button>)}
                    <button aria-pressed={backdrop==='plain'} onClick={()=>onBackdropChange('plain')}
                        className={`rounded-full border px-3 py-2 text-xs ${backdrop==='plain'?'border-teal-200 bg-teal-50 font-semibold text-teal-700':'border-slate-200 text-slate-500'}`}>简洁舞台</button>
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2"><button onClick={()=>scene.current?.replay()} className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600">重播击败</button>
                    <button onClick={()=>scene.current?.togglePause()} className="rounded-full border border-slate-200 px-5 py-3 text-sm text-slate-600">{playback.paused?'继续':'暂停'}</button>
                    <button onClick={()=>scene.current?.seek(.5)} className="rounded-full border border-slate-200 px-4 py-3 text-sm text-slate-600">站位对照</button></div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={slow} className="accent-orange-500" onChange={e=>{setSlow(e.target.checked);scene.current?.setRate(e.target.checked?.35:1);}}/>慢放</label>
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={loop} className="accent-orange-500" onChange={e=>{setLoop(e.target.checked);scene.current?.setLoop(e.target.checked);}}/>循环演示</label>
                </div>
            </div>
            <div className="mt-5 flex items-center gap-4"><input aria-label="动画进度" type="range" min="0" max={playback.duration} step="0.01" value={playback.time}
                onChange={e=>scene.current?.seek(Number(e.target.value))} className="min-w-0 flex-1 accent-orange-500"/><span className="w-20 text-right font-mono text-xs text-slate-400">{playback.time.toFixed(2)} s</span></div>
            <p className="mt-4 text-xs leading-5 text-slate-400">伤害数字为演示值。消散结束后保持空场；重播或开启循环才会恢复怪物。</p>
        </div>
    </section>;
}
