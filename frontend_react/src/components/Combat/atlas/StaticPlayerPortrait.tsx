import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import {loadPlayerStill} from '../art/playerStillArt';

export function StaticPlayerPortrait({jobId,fallback}:{jobId:string;fallback:ReactNode}) {
    const [source,setSource]=useState('');
    useEffect(()=>{
        let alive=true;
        void loadPlayerStill(jobId).then(url=>{if(alive)setSource(url);}).catch(()=>{});
        return()=>{alive=false;};
    },[jobId]);
    return source?<img src={source} alt="" draggable={false} className="h-full w-full object-contain" style={{imageRendering:'pixelated'}}/>:fallback;
}
