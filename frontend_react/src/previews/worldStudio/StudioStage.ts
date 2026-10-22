import {placementProblem} from './placement';
import {drawActors, drawBackdrop, drawFurniture, drawGrid} from './stageDrawing';
import {StudioActors} from './StudioActors';
import {getTemplate, GROUND, makePlacement, STAGE_HEIGHT, STAGE_WIDTH, TILE} from './templates';
import type {Placement, StageOptions, StudioArt, TemplateId} from './types';

interface StageCallbacks {select:(id:string|null)=>void; place:(id:TemplateId,col:number)=>void; move:(id:string,col:number)=>void; activate:(id:string)=>void}
export class StudioStage {
    private canvas:HTMLCanvasElement;
    private g:CanvasRenderingContext2D;
    private request=0;
    private last=0;
    private snapshotAt=0;
    private engine=new StudioActors();
    private drag:{item:Placement;offset:number;col:number;start:number}|null=null;
    private ghost:Placement|null=null;
    constructor(private host:HTMLElement,private art:StudioArt,private options:StageOptions,private callbacks:StageCallbacks){
        this.canvas=document.createElement('canvas');this.canvas.width=STAGE_WIDTH;this.canvas.height=STAGE_HEIGHT;this.canvas.tabIndex=0;
        this.canvas.setAttribute('aria-label','横版场景画布，点击地面放置选中的模板，拖动摆件调整位置');this.canvas.setAttribute('role','img');
        this.g=this.canvas.getContext('2d')!;this.g.imageSmoothingEnabled=false;host.append(this.canvas);
        this.canvas.addEventListener('pointerdown',this.down);this.canvas.addEventListener('pointermove',this.move);this.canvas.addEventListener('pointerup',this.up);
        this.canvas.addEventListener('pointerleave',this.leave);this.canvas.addEventListener('pointercancel',this.cancel);
        this.engine.reset();this.request=requestAnimationFrame(this.loop);
    }
    update(options:StageOptions){if(options.room!==this.options.room){this.engine.reset();this.drag=null;this.ghost=null;}this.options=options;}
    interact(id:string){this.engine.interact(id,this.options.placements);}
    dispose(){cancelAnimationFrame(this.request);this.canvas.remove();}
    private point(event:PointerEvent){const r=this.canvas.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width*STAGE_WIDTH,y:(event.clientY-r.top)/r.height*STAGE_HEIGHT};}
    private down=(event:PointerEvent)=>{
        if(event.button!==0)return;const p=this.point(event);this.canvas.focus();
        if(this.options.brush){this.callbacks.place(this.options.brush,Math.floor(p.x/TILE));return;}
        const item=[...this.options.placements].reverse().find(item=>{const t=getTemplate(item.templateId);return p.x>=item.col*TILE&&p.x<(item.col+t.width)*TILE&&p.y>GROUND-t.height*TILE&&p.y<=GROUND;});
        this.callbacks.select(item?.id??null);
        if(item){this.drag={item:{...item},offset:p.x-item.col*TILE,col:item.col,start:p.x};this.canvas.setPointerCapture(event.pointerId);}
    };
    private move=(event:PointerEvent)=>{
        const p=this.point(event);
        if(this.drag){this.drag.col=Math.round((p.x-this.drag.offset)/TILE);this.ghost={...this.drag.item,col:this.drag.col};}
        else if(this.options.brush)this.ghost=makePlacement(this.options.brush,Math.floor(p.x/TILE),'ghost');
        else this.ghost=null;
    };
    private up=(event:PointerEvent)=>{
        if(this.drag&&this.drag.col!==this.drag.item.col)this.callbacks.move(this.drag.item.id,this.drag.col);
        this.drag=null;this.ghost=null;if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
    };
    private leave=()=>{if(!this.drag)this.ghost=null;};
    private cancel=()=>{this.drag=null;this.ghost=null;};
    private loop=(now:number)=>{
        const dt=this.last?Math.min((now-this.last)/1000,.08):0;this.last=now;
        if(this.options.running&&!document.hidden){
            const arrivals=this.engine.update(dt,this.options.placements);
            const lamp=arrivals.find(id=>this.options.placements.some(item=>item.id===id&&item.templateId==='lamp'&&!item.lit));
            if(lamp)this.callbacks.activate(lamp);
        }
        const g=this.g;g.clearRect(0,0,STAGE_WIDTH,STAGE_HEIGHT);drawBackdrop(g,this.art,this.options.room);
        for(const item of this.options.placements)drawFurniture(g,this.art,item,this.engine.time);
        drawActors(g,this.art,this.engine.actors,this.engine.time);
        if(this.ghost)drawFurniture(g,this.art,this.ghost,this.engine.time,true);
        drawGrid(g,this.options,this.ghost,!!this.ghost&&!!placementProblem(this.ghost,this.options.placements));
        if(now-this.snapshotAt>250){this.snapshotAt=now;this.host.dataset.studio=JSON.stringify({room:this.options.room,selected:this.options.selected,placements:this.options.placements,actors:this.engine.actors.map(({id,x,pose,target})=>({id,x,pose,target})),ground:GROUND});}
        this.request=requestAnimationFrame(this.loop);
    };
}
