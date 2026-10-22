import {COLS, getTemplate, TILE} from './templates';
import type {Placement, StudioDocument} from './types';

export function placementProblem(candidate:Placement,items:Placement[]):string|null {
    const t=getTemplate(candidate.templateId);
    if(!Number.isInteger(candidate.col)||candidate.col<0||candidate.col+t.width>COLS)return '已经超出场景边界';
    const occupied=items.find(item=>item.id!==candidate.id&&candidate.col<item.col+getTemplate(item.templateId).width&&candidate.col+t.width>item.col);
    return occupied?`这里已有${occupied.name}，请换一个位置`:null;
}
export function footBounds(item:Placement) {
    const {foot,width}=getTemplate(item.templateId);
    return {left:item.col*TILE+(item.flipped?width*TILE-foot.x-foot.width:foot.x),right:item.col*TILE+(item.flipped?width*TILE-foot.x:foot.x+foot.width),height:foot.height};
}
export function stopBeforeObstacle(from:number,to:number,items:Placement[],radius=9):number {
    let result=to;
    for(const item of items.filter(i=>i.solid)){
        const b=footBounds(item);
        if(to>from&&from<=b.left-radius&&result>b.left-radius)result=b.left-radius;
        if(to<from&&from>=b.right+radius&&result<b.right+radius)result=b.right+radius;
    }
    return Math.min(1260,Math.max(20,result));
}
// Preview exports are intentionally independent of AgentWorld persistence and WebDAV.
export function parseDocument(raw:string):StudioDocument {
    const data:unknown=JSON.parse(raw);
    if(!data||typeof data!=='object'||!('version' in data)||data.version!==1||!('scenes' in data))throw new Error('请选择世界工坊导出的 v1 布局文件');
    const scenes=data.scenes;
    if(!scenes||typeof scenes!=='object')throw new Error('布局内容不完整');
    const result:StudioDocument={version:1,scenes:{camp:[],room:[]}};
    for(const room of ['camp','room'] as const){
        const items=(scenes as Record<string,unknown>)[room];
        if(!Array.isArray(items)||items.length>40)throw new Error('场景摆件数量不正确');
        const ids=new Set<string>();
        for(const item of items){
            if(!item||typeof item!=='object'||typeof item.id!=='string'||item.id.length>100||ids.has(item.id)||typeof item.templateId!=='string'||!['lamp','bench','picnic','cabin','tree','fire','rock'].includes(item.templateId)||typeof item.name!=='string'||item.name.length>30||typeof item.col!=='number'||typeof item.solid!=='boolean'||typeof item.flipped!=='boolean'||typeof item.lit!=='boolean')throw new Error('摆件模板信息不正确');
            const candidate=item as Placement;
            const problem=placementProblem(candidate,result.scenes[room]);
            if(problem)throw new Error(problem);
            ids.add(item.id);result.scenes[room].push({...candidate});
        }
    }
    return result;
}
