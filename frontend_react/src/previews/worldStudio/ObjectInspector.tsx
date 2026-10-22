import {Copy, FlipHorizontal2, Footprints, Lightbulb, MapPin, MoveHorizontal, MousePointer2, Trash2} from 'lucide-react';
import {PixelPreview} from './AssetLibrary';
import {getTemplate, TILE} from './templates';
import type {StudioController} from './useStudio';

export function Switch({checked,onChange,label}:{checked:boolean;onChange:()=>void;label:string}) {
    return <button type="button" className={`studio-switch${checked?' on':''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span/></button>;
}

export function ObjectInspector({studio}:{studio:StudioController}) {
    const item=studio.item;
    if(!item||!studio.art)return <aside className="studio-inspector studio-card"><div className="studio-panel-heading"><span><MousePointer2 size={15}/>摆件属性</span></div><div className="studio-inspector-empty"><MousePointer2 size={28}/><h3>选中一件小物品</h3><p>点击场景里的摆件，查看位置、占格和互动方式。</p></div></aside>;
    const t=getTemplate(item.templateId),change=(patch:Parameters<typeof studio.change>[1])=>studio.change(item.id,patch);
    return <aside className="studio-inspector studio-card">
        <div className="studio-panel-heading"><span>摆件属性</span><span className="studio-small-badge">已放置</span></div>
        <div className="studio-object-summary"><div className="studio-object-thumb"><PixelPreview source={studio.art.objects[t.id]}/></div><div><h2>{item.name}</h2><span>{t.category}模板</span><small>{t.width*TILE} × {t.height*TILE} px</small></div></div>
        <div className="studio-inspector-section">
            <label className="studio-field-label" htmlFor="object-name">摆件名称</label><input id="object-name" className="studio-input" value={item.name} maxLength={30} onChange={e=>change({name:e.target.value})}/>
            <div className="studio-field-heading"><span><MapPin size={12}/>地面坐标</span><small>单位：格</small></div>
            <div className="studio-coordinates"><label><span>X</span><input aria-label="摆件 X 坐标" type="number" min={0} max={40-t.width} value={item.col} onChange={e=>{if(e.target.value!=='')change({col:Number(e.target.value)});}}/></label><label><span>Y</span><input aria-label="摆件 Y 坐标" value="0" readOnly/><small>地面</small></label></div>
            <div className="studio-occupancy"><span>显示占格</span><strong>{t.width}<i>×</i>{t.height}</strong><span>宽 × 高</span></div>
            <div className="studio-setting-row"><span><FlipHorizontal2 size={14}/>水平翻转</span><Switch checked={item.flipped} label="水平翻转" onChange={()=>change({flipped:!item.flipped})}/></div>
        </div>
        <div className="studio-inspector-section">
            <div className="studio-setting-row"><span><MoveHorizontal size={14}/>底座碰撞</span><Switch checked={item.solid} label="底座碰撞" onChange={()=>change({solid:!item.solid})}/></div>
            <p className="studio-field-note">{item.solid?`仅底部 ${t.foot.width} × ${t.foot.height} px 阻挡行走`:'位于步行线后方，角色可以经过'}</p>
            {t.id==='lamp'&&<div className="studio-setting-row"><span><Lightbulb size={14}/>暖光照明</span><Switch checked={item.lit} label="暖光照明" onChange={()=>change({lit:!item.lit})}/></div>}
            <div className="studio-interaction"><span><i/>互动动作</span><strong>{t.action}</strong><small>{t.description}</small></div>
            <button type="button" className="studio-test-interaction" onClick={studio.interact}><Footprints size={14}/>让 Agent 试一试</button>
        </div>
        <div className="studio-inspector-actions"><button type="button" onClick={studio.duplicate}><Copy size={13}/>复制</button><button type="button" className="danger" onClick={studio.remove}><Trash2 size={13}/>移除</button></div>
    </aside>;
}
