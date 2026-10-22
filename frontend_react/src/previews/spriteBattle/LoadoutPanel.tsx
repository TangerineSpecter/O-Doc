import {useEffect,useRef} from 'react';
import {Check,Layers3,Shirt,Sparkles,WandSparkles} from 'lucide-react';
import {getOutfit,getProfession,getWeapon,outfits,weapons} from './catalog';
import {heroPose} from './pose';
import type {BattleArt,BattleCommand,BattleSnapshot} from './types';

export function BattleThumb({source,className=''}:{source?:CanvasImageSource;className?:string}){
    const ref=useRef<HTMLCanvasElement>(null);
    useEffect(()=>{const canvas=ref.current;if(!source||!canvas)return;const width=(source as HTMLCanvasElement).width,height=(source as HTMLCanvasElement).height;canvas.width=96;canvas.height=96;const g=canvas.getContext('2d')!;g.clearRect(0,0,96,96);g.imageSmoothingEnabled=false;const scale=Math.min(86/width,86/height);g.drawImage(source,(96-width*scale)/2,(96-height*scale)/2,width*scale,height*scale);},[source]);
    return <canvas ref={ref} className={`sb-thumb ${className}`} aria-hidden="true"/>;
}

export function LoadoutPanel({art,snapshot:s,command}:{art:BattleArt;snapshot:BattleSnapshot;command:(c:BattleCommand)=>void}){
    const outfit=getOutfit(s.loadout.outfit),weapon=getWeapon(s.loadout.weapon),profession=getProfession(s.loadout.profession),pose=heroPose(s);
    return <aside className="sb-loadout sb-card">
        <div className="sb-panel-heading"><span><Layers3 size={15}/>可莉的装备箱</span><small>自由搭配</small></div>
        <div className="sb-identity"><span className={`sb-avatar sb-avatar--${outfit.id}`}><BattleThumb source={art.frames[outfit.id][0].canvas}/></span><div><h2>可莉<span>Lv. 30</span></h2><p>花火骑士 · {profession.name}</p><small>同一角色，独立替换武器与服装</small></div></div>
        <section className="sb-loadout-section"><div className="sb-section-label"><span><WandSparkles size={13}/>武器</span><small>3 件可切换</small></div><div className="sb-weapon-options">{weapons.map(w=><button type="button" key={w.id} className={weapon.id===w.id?'active':''} onClick={()=>command({type:'weapon',id:w.id})} aria-pressed={weapon.id===w.id} aria-label={`装备${w.name}`}><span className="sb-weapon-thumb"><BattleThumb source={art.weapons[w.id]}/></span><span><strong>{w.name}</strong><small>{w.kind==='sword'?'突进斩击':'杖头发射'}<i/>独立武器精灵</small></span>{weapon.id===w.id&&<Check size={13}/>}</button>)}</div></section>
        <section className="sb-loadout-section"><div className="sb-section-label"><span><Shirt size={13}/>防具套装</span><small>实际服装变化</small></div><div className="sb-outfit-options">{outfits.map(o=><button type="button" key={o.id} className={outfit.id===o.id?'active':''} aria-label={`穿戴${o.name}`} aria-pressed={outfit.id===o.id} onClick={()=>command({type:'outfit',id:o.id})}><BattleThumb source={art.frames[o.id][0].canvas}/><span>{o.name}</span>{outfit.id===o.id&&<Check size={10}/>}</button>)}</div></section>
        <div className="sb-preset-buttons"><button type="button" onClick={()=>command({type:'preset',id:'pyromancer'})}><Sparkles size={12}/>默认搭配</button><button type="button" onClick={()=>command({type:'preset',id:'blademaster'})}>剑圣推荐搭配</button></div>
        <section className="sb-slices"><div className="sb-section-label"><span>当前套装 · 动作精灵</span><small>4 帧姿态</small></div><div>{art.frames[outfit.id].map((frame,i)=><div key={i} className={pose.frame===i?'active':''}><BattleThumb source={frame.canvas}/><span>{['待机','蓄力','施法','斩击'][i]}</span></div>)}</div></section>
        <p className="sb-loadout-note">换装保留职业与技能；武器跟随手部动作。</p>
    </aside>;
}
