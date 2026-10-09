import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {FarmSelection, FarmState} from '../../types/api/farm';
import {FarmScene} from './FarmScene';
export function FarmCanvas({farm,onSelect}:{farm:FarmState;onSelect:(value:FarmSelection)=>void}) {
    const host=useRef<HTMLDivElement>(null), scene=useRef<FarmScene|null>(null);
    const latest=useRef(farm), select=useRef(onSelect);useLayoutEffect(()=>{latest.current=farm;select.current=onSelect;},[farm,onSelect]);
    const [error,setError]=useState(false),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
    useEffect(()=>{
        if(!host.current)return;
        let alive=true;setError(false);setReady(false);
        const controller=new FarmScene(host.current,value=>select.current(value));scene.current=controller;
        void controller.init().then(()=>{if(alive){controller.update(latest.current);setReady(true);}}).catch(()=>{if(alive)setError(true);});
        return ()=>{alive=false;controller.dispose();scene.current=null;};
    },[retry]);
    useEffect(()=>{
        if(ready && scene.current) {
            scene.current.update(farm);
        }
    },[farm, ready]);
    return <div className="relative w-full max-w-full max-h-full aspect-[3/2] lg:w-auto lg:h-full overflow-hidden rounded-2xl border border-lime-200 bg-[#abc17b]" style={{aspectRatio:'3 / 2'}}>
        <div ref={host} className="w-full h-full flex items-center justify-center"/>
        {!ready && <div className="absolute inset-0 flex items-center justify-center bg-lime-50/95 text-sm text-lime-800">{error?<div className="text-center">像素场景加载失败，仍可查看下方农场状态。<br/><button className="mt-3 rounded-lg bg-white px-4 py-2" onClick={()=>setRetry(v=>v+1)}>重新加载场景</button></div>:'正在铺开农场地图…'}</div>}
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/85 px-3 py-1 text-[11px] text-slate-600">点击地块、动物与建筑查看详情</span>
    </div>;
}
