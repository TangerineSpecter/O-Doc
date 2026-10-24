import {useCallback,useEffect,useState} from 'react';
import {getAdventureOptions} from '../api/combat';
import type {AdventureOption} from '../types/api/combat';

export function useAdventureOptions(actor:string) {
    const [parties,setParties]=useState<AdventureOption[]>([]);
    const [loaded,setLoaded]=useState('');
    const [error,setError]=useState('');
    const [revision,setRevision]=useState(0);
    const [selection,setSelection]=useState<{actor:string;party:AdventureOption}|null>(null);
    const select=useCallback((party:AdventureOption|null)=>setSelection(party?{actor,party}:null),[actor]);
    const reload=useCallback(()=>setRevision(value=>value+1),[]);
    useEffect(()=>{
        const controller=new AbortController();
        void getAdventureOptions(actor,controller.signal).then(value=>{if(!controller.signal.aborted){
            setParties(value.parties);setError('');
            setSelection(previous=>{
                if(!previous||previous.actor!==actor)return null;
                const party=value.parties.find(row=>row.id===previous.party.id);
                return party?{actor,party}:null;
            });
        }})
            .catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'队伍加载失败');})
            .finally(()=>{if(!controller.signal.aborted)setLoaded(`${actor}:${revision}`);});
        return ()=>controller.abort();
    },[actor,revision]);
    const loading=loaded!==`${actor}:${revision}`;
    return {parties:loading?[]:parties,loading,error:loading?'':error,reload,
        selected:selection?.actor===actor?selection.party:null,select};
}
