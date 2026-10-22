import type {FurnitureTemplate, Placement, RoomId, StudioDocument, TemplateId} from './types';

export const TILE = 32;
export const COLS = 40;
export const GROUND = 384;
export const STAGE_WIDTH = COLS * TILE;
export const STAGE_HEIGHT = 480;
export const templates: FurnitureTemplate[] = [
    {id:'lamp',name:'萤火路灯',category:'照明',width:2,height:4,solid:true,foot:{x:24,width:16,height:14},action:'点亮路灯',pose:'wave',description:'暖色灯光会随开关变化。只有底座阻挡行走，灯罩和光晕不占碰撞空间。'},
    {id:'bench',name:'原木长椅',category:'家具',width:4,height:2,solid:false,foot:{x:8,width:112,height:16},action:'坐下歇一会',pose:'sit',description:'放在步行线后方的长椅。Agent 走到座位旁，再播放坐下动作。'},
    {id:'picnic',name:'午后茶桌',category:'家具',width:3,height:2,solid:false,foot:{x:4,width:88,height:20},action:'来杯热可可',pose:'happy',description:'桌面和杯子作为一个摆件模板；互动位置与图片分别配置。'},
    {id:'cabin',name:'三叶小屋',category:'建筑',width:7,height:7,solid:false,foot:{x:8,width:208,height:16},action:'敲敲门',pose:'wave',description:'横版正立面小屋。切换“小屋内景”可查看独立的室内坐标空间。'},
    {id:'tree',name:'许愿橡树',category:'自然',width:6,height:7,solid:false,foot:{x:70,width:52,height:20},action:'向树许个愿',pose:'happy',description:'树冠可以覆盖其他物体上方，碰撞只根据树干底部的配置判断。'},
    {id:'fire',name:'篝火堆',category:'自然',width:2,height:1,solid:true,foot:{x:4,width:56,height:18},action:'烤棉花糖',pose:'roast',description:'静态底座叠加独立的火焰动画。开启碰撞后 Agent 会停在火堆前。'},
    {id:'rock',name:'苔藓石',category:'自然',width:2,height:1,solid:true,foot:{x:4,width:56,height:26},action:'发现小石头',pose:'happy',description:'这个模板默认阻挡。可用它检查新布局里的行走边界。'},
];
export function getTemplate(id: TemplateId): FurnitureTemplate {return templates.find(t=>t.id===id)!;}
export function makePlacement(templateId:TemplateId,col:number,id:string):Placement {
    const t=getTemplate(templateId);
    return {id,templateId,col,name:t.name,solid:t.solid,flipped:false,lit:true};
}
export function initialDocument(): StudioDocument {
    const scene=(items:[TemplateId,number][],prefix:string)=>items.map(([id,col],index)=>makePlacement(id,col,`${prefix}-${index}`));
    return {version:1,scenes:{
        camp:scene([['cabin',2],['picnic',10],['bench',15],['fire',22],['lamp',28],['tree',32]],'camp'),
        room:scene([['picnic',8],['bench',21],['lamp',32]],'room'),
    }};
}
export const roomNames: Record<RoomId,string> = {camp:'三叶营地',room:'小屋内景'};
