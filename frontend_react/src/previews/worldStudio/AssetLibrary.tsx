import {useEffect, useRef, useState} from 'react';
import {Check, LampDesk, MousePointer2, Plus, Search, Shapes} from 'lucide-react';
import {getTemplate, templates} from './templates';
import type {StudioArt} from './types';
import type {StudioController} from './useStudio';

export function PixelPreview({source,className=''}:{source?:HTMLCanvasElement;className?:string}) {
    const ref=useRef<HTMLCanvasElement>(null);
    useEffect(()=>{const canvas=ref.current;if(!source||!canvas)return;canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d')!.drawImage(source,0,0);},[source]);
    return <canvas ref={ref} className={`studio-pixel-preview ${className}`} aria-hidden="true"/>;
}

export function AssetLibrary({studio,art}:{studio:StudioController;art:StudioArt}) {
    const [category,setCategory]=useState('全部'),[query,setQuery]=useState('');
    const choices=templates.filter(t=>(category==='全部'||t.category===category)&&t.name.includes(query)&&(studio.room==='camp'||!['tree','cabin','fire','rock'].includes(t.id)));
    return <aside className="studio-library studio-card">
        <div className="studio-panel-heading"><span><Shapes size={16}/>摆件模板</span><small>{templates.length} 个</small></div>
        <label className="studio-search"><Search size={14}/><input aria-label="搜索摆件" placeholder="找个喜欢的小物件" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <div className="studio-categories" aria-label="模板分类">{['全部','家具','照明','自然','建筑'].map(c=><button key={c} type="button" className={category===c?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        <div className="studio-template-grid">{choices.map(t=><button type="button" key={t.id} className={`studio-template${studio.brush===t.id?' active':''}`} onClick={()=>studio.setBrush(studio.brush===t.id?null:t.id)} aria-label={`放置${t.name}`} aria-pressed={studio.brush===t.id}>
            <span className="studio-template-art"><PixelPreview source={art.objects[t.id]}/><span className="studio-template-add">{studio.brush===t.id?<Check size={11}/>:<Plus size={11}/>}</span></span>
            <strong>{t.name}</strong><small>{t.width} × {t.height} 格<span>{t.category}</span></small>
        </button>)}</div>
        {!choices.length&&<p className="studio-empty">没有找到这个摆件</p>}
        <div className="studio-library-tip"><LampDesk size={17}/><strong>从一个模板，到一个世界</strong><p>选一个摆件，再点画布里的空位。摆件会自动吸附到地面的方格。</p></div>
        <button type="button" className="studio-pointer-tool" aria-pressed={!studio.brush} onClick={()=>studio.setBrush(null)}><MousePointer2 size={14}/>{studio.brush?`正在放置：${getTemplate(studio.brush).name}`:'选择 / 移动摆件'}<kbd>Esc</kbd></button>
    </aside>;
}
