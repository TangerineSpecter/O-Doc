import {useEffect, useEffectEvent, useRef, useState} from 'react';
import type {RefObject} from 'react';
import {placementProblem} from './placement';
import {loadStudioArt} from './studioArt';
import {StudioStage} from './StudioStage';
import {getTemplate, initialDocument, makePlacement} from './templates';
import type {Placement, RoomId, StudioArt, StudioDocument, TemplateId} from './types';

export function useStudio(host:RefObject<HTMLDivElement|null>) {
    const [art,setArt]=useState<StudioArt|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
    const [history,setHistory]=useState<StudioDocument[]>(()=>[initialDocument()]),[index,setIndex]=useState(0);
    const [room,setRoom]=useState<RoomId>('camp'),[selected,setSelected]=useState<string|null>('camp-4'),[brush,setBrush]=useState<TemplateId|null>(null);
    const [grid,setGrid]=useState(true),[collisions,setCollisions]=useState(true),[running,setRunning]=useState(true),[notice,setNotice]=useState('');
    const [tab,setTab]=useState<'scene'|'sprite'>('scene');
    const stage=useRef<StudioStage|null>(null),serial=useRef(1);
    const document=history[index],items=document.scenes[room],item=items.find(i=>i.id===selected)??null;
    const options={room,placements:items,selected,brush,grid,collisions,running};
    const commit=(next:StudioDocument)=>{setHistory([...history.slice(0,index+1),next].slice(-80));setIndex(Math.min(index+1,79));};
    const updateItems=(next:Placement[])=>commit({...document,scenes:{...document.scenes,[room]:next}});
    const change=(id:string,patch:Partial<Placement>)=>{
        const original=items.find(i=>i.id===id);if(!original)return;
        const next={...original,...patch},problem=placementProblem(next,items);
        if(problem){setNotice(problem);return;}
        updateItems(items.map(i=>i.id===id?next:i));
    };
    const place=(templateId:TemplateId,col:number)=>{
        const next=makePlacement(templateId,col,`placed-${Date.now()}-${serial.current++}`),problem=placementProblem(next,items);
        if(problem){setNotice(problem);return;}
        updateItems([...items,next]);setSelected(next.id);setBrush(null);setNotice(`已放置${next.name} · 占 ${getTemplate(templateId).width} × ${getTemplate(templateId).height} 格`);
    };
    const remove=()=>{if(item){updateItems(items.filter(i=>i.id!==item.id));setSelected(null);setNotice(`已移除${item.name}，可撤销`);}};
    const duplicate=()=>{
        if(!item)return;
        for(let col=item.col+getTemplate(item.templateId).width;col<40;col++){
            const candidate={...item,id:`copy-${Date.now()}-${serial.current++}`,col};
            if(!placementProblem(candidate,items)){updateItems([...items,candidate]);setSelected(candidate.id);setNotice('已复制到最近的空位');return;}
        }
        setNotice('右侧没有足够空位，请先移动摆件');
    };
    const undo=()=>{setIndex(i=>Math.max(0,i-1));setBrush(null);};
    const redo=()=>{setIndex(i=>Math.min(history.length-1,i+1));setBrush(null);};
    const onPlace=useEffectEvent((id:TemplateId,col:number)=>place(id,col));
    const onMove=useEffectEvent((id:string,col:number)=>change(id,{col}));
    const onActivate=useEffectEvent((id:string)=>{change(id,{lit:true});setNotice('Agent 点亮了路灯');});
    useEffect(()=>{
        let alive=true;
        loadStudioArt().then(value=>{if(alive)setArt(value);}).catch((e:Error)=>{if(alive)setError(e.message);});
        return()=>{alive=false;};
    },[attempt]);
    useEffect(()=>{
        if(!art||!host.current||tab!=='scene')return;
        const instance=new StudioStage(host.current,art,{room:'camp',placements:[],selected:null,brush:null,grid:true,collisions:true,running:true},{
            select:setSelected,place:onPlace,move:onMove,activate:onActivate,
        });
        stage.current=instance;return()=>{instance.dispose();stage.current=null;};
    },[art,tab,host]);
    useEffect(()=>{stage.current?.update(options);});
    useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),3400);return()=>clearTimeout(id);},[notice]);
    useEffect(()=>{
        const key=(e:KeyboardEvent)=>{
            const target=e.target as HTMLElement;if(target.closest('input,textarea,[contenteditable="true"]'))return;
            if(e.key==='Escape')setBrush(null);
            if(tab!=='scene')return;
            if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}
            if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
        };
        window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
    });
    const switchRoom=(next:RoomId)=>{setRoom(next);setSelected(document.scenes[next].find(i=>i.templateId==='lamp')?.id??null);setBrush(null);};
    return {art,error,retry:()=>{setError('');setAttempt(i=>i+1);},tab,setTab,document,items,item,room,switchRoom,selected,setSelected,brush,setBrush,grid,setGrid,collisions,setCollisions,running,setRunning,notice,setNotice,change,place,remove,duplicate,undo,redo,canUndo:index>0,canRedo:index<history.length-1,
        interact:()=>{if(item){setRunning(true);stage.current?.interact(item.id);}},
        importDocument:(next:StudioDocument)=>{commit(next);setSelected(null);setBrush(null);setNotice('布局已导入');},
    };
}
export type StudioController=ReturnType<typeof useStudio>;
