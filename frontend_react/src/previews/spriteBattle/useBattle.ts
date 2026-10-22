import {useCallback,useEffect,useRef,useState} from 'react';
import type {RefObject} from 'react';
import {loadBattleArt} from './art';
import {BattleScene} from './BattleScene';
import {BattleSimulation} from './BattleSimulation';
import type {BattleArt,BattleCommand} from './types';

export function useBattle(host:RefObject<HTMLDivElement|null>){
    const [art,setArt]=useState<BattleArt|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
    const [snapshot,setSnapshot]=useState(()=>new BattleSimulation().snapshot());const scene=useRef<BattleScene|null>(null);
    useEffect(()=>{let alive=true;loadBattleArt().then(value=>{if(alive)setArt(value);}).catch((e:Error)=>{if(alive)setError(e.message);});return()=>{alive=false;};},[attempt]);
    useEffect(()=>{if(!art||!host.current)return;const instance=new BattleScene(host.current,art,setSnapshot);scene.current=instance;return()=>{instance.dispose();scene.current=null;};},[art,host]);
    const command=useCallback((value:BattleCommand)=>scene.current?.command(value),[]);
    return {art,error,snapshot,command,retry:()=>{setError('');setAttempt(i=>i+1);}};
}
