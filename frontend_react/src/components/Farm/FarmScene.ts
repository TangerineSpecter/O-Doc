import {Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture} from 'pixi.js';
import type {FarmAnimal, FarmSelection, FarmState} from '../../types/api/farm';
import {findPath, plotCell, type Cell} from './pathfinding';
import {farmAtlasUrl, farmFramesUrl} from './assets';
import {HEIGHT, WIDTH, TILE, obstacles, terrain} from './terrain';
interface Frame {x:number; y:number; width:number; height:number}
interface MovingAnimal {sprite: Sprite; animal: FarmAnimal; target: {x:number;y:number}; next: number; mode: string}
let users = 0;
export class FarmScene {
    readonly app = new Application();
    private textures = new Map<string,Texture>();
    private objects = new Container();
    private creatures = new Container();
    private lighting = new Graphics();
    private rain = new Graphics();
    private actor = new Sprite();
    private animals: MovingAnimal[] = [];
    private data: FarmState | null = null;
    private lastOperation = '';
    private path: Cell[] = [];
    private direction = 'down';
    private work = '';
    private workUntil = 0;
    private time = 0;
    private disposed = false;
    private initialized = false;
    private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    private label = new Text({text: '', style: {fontFamily:'sans-serif', fontSize:12, fill:0x5c6349}});
    private blocked = obstacles();
    constructor(private host: HTMLElement, private onSelect: (selection: FarmSelection) => void) {}
    async init() {
        users++;
        try {
            const [atlas, frames] = await Promise.all([Assets.load<Texture>(farmAtlasUrl), fetch(farmFramesUrl).then(r => {if(!r.ok) throw new Error('素材加载失败');return r.json() as Promise<Record<string,Frame>>;})]);
            if (this.disposed) return;
            await this.app.init({width:WIDTH,height:HEIGHT,background:0xabc17b,antialias:false,resolution:1,autoDensity:false,autoStart:false});
            this.initialized = true;
            if(this.disposed) {this.app.destroy(true); return;}
            atlas.source.scaleMode = 'nearest';
            for(const [name,frame] of Object.entries(frames)) this.textures.set(name,new Texture({source:atlas.source,frame:new Rectangle(frame.x,frame.y,frame.width,frame.height)}));
            this.host.appendChild(this.app.canvas); this.app.canvas.style.width='100%';this.app.canvas.style.height='100%';this.app.canvas.style.display='block';this.app.canvas.style.imageRendering='pixelated';
            this.app.canvas.setAttribute('aria-label','像素农场地图；地块与动物详情也可通过下方列表查看');
            this.app.stage.addChild(terrain(),this.objects,this.creatures,this.lighting,this.rain,this.label);
            this.label.position.set(28,43);
            this.actor.position.set(12*TILE,12*TILE);this.creatures.addChild(this.actor);
            this.app.ticker.add(t => this.animate(Math.min(t.deltaMS,50)/1000));
            document.addEventListener('visibilitychange',this.visibility);
            this.reduced.addEventListener('change',this.visibility);
            this.visibility();
        } catch(error) {this.dispose();throw error;}
    }
    private visibility = () => {
        if(!this.initialized || this.disposed) return;
        if(document.hidden || this.reduced.matches) this.app.stop(); else this.app.start();
    };
    private sprite(name:string,x:number,y:number,parent=this.objects) {
        const s=new Sprite(this.textures.get(name));s.position.set(x,y);parent.addChild(s);return s;
    }
    update(data: FarmState) {
        if(this.disposed || !this.initialized) return;
        const first=this.data===null;
        this.data=data;
        this.objects.removeChildren().forEach(c => c.destroy());
        const positions=new Map(this.animals.map(a=>[a.animal.id,{x:a.sprite.x,y:a.sprite.y,target:a.target,next:a.next,mode:a.mode}]));
        this.animals.forEach(a => a.sprite.destroy());this.animals=[];
        for(const [x,y] of [[25,52],[660,40],[28,344],[680,335],[75,32]]) this.sprite('tree',x,y);
        for(let i=0;i<16;i++) {
            const p=data.state.plots.find(v=>v.id===String(i));const cell=plotCell(String(i));
            const x=cell.x*TILE,y=cell.y*TILE;
            const tile=new Graphics();tile.rect(x-2,y-2,36,36).fill(p?0xb39466:0xa0b47b);
            if(p) {tile.rect(x,y,32,32).fill((p.wet ?? (p.wateredUntil>Date.parse(data.serverTime)/1000 || data.weather==='rain'))?0x9b7b59:0xaa875e);
                for(let row=0;row<4;row++) tile.rect(x+2,y+3+row*8,28,2).fill(0x806c4e);
                tile.eventMode='static';tile.cursor='pointer';tile.on('pointertap',()=>this.onSelect({kind:'plot',id:p.id}));
                this.objects.addChild(tile);
                if(p.crop) {const phase=p.crop.grown>=p.crop.rules.growthSeconds?2:p.crop.grown>=p.crop.rules.growthSeconds*.35?1:0;const s=this.sprite(`${p.crop.kind}-${phase}`,x,y-5);s.eventMode='static';s.cursor='pointer';s.on('pointertap',()=>this.onSelect({kind:'plot',id:p.id}));}
            } else {tile.rect(x+12,y+14,8,2).fill(0x778962);tile.rect(x+15,y+11,2,8).fill(0x778962);this.objects.addChild(tile);}
        }
        for(const kind of ['coop','barn'] as const) {
            const building=data.state.buildings[kind]; const x=kind==='coop'?16*TILE:17*TILE,y=kind==='coop'?9*TILE:4*TILE;
            if(building) {const s=this.sprite(`${kind}-${building.level}`,x,y);s.eventMode='static';s.cursor='pointer';s.on('pointertap',()=>this.onSelect({kind:'building',id:kind}));}
            else {const g=new Graphics().rect(x,y+28,64,32).fill({color:0xd7c994,alpha:.6});g.eventMode='static';g.cursor='pointer';g.on('pointertap',()=>this.onSelect({kind:'building',id:kind}));this.objects.addChild(g);}
        }
        for(const [i,animal] of data.state.animals.entries()) {
            const x=(16+(i%6))*TILE,y=(animal.building==='coop'?11.4:7.4)*TILE;
            const s=this.sprite(`${animal.kind}-idle-0`,x,y,this.creatures);s.eventMode='static';s.cursor='pointer';s.on('pointertap',()=>this.onSelect({kind:'animal',id:animal.id}));
            const previous=positions.get(animal.id);if(previous)s.position.set(previous.x,previous.y);
            this.animals.push({sprite:s,animal,target:previous?.target||{x,y},next:previous?.next??this.time+i*.4,mode:previous?.mode||'idle'});
        }
        this.label.text=`${data.actorName}的农场 · ${data.weather==='rain'?'雨水滋润大地':'阳光正好'}`;
        this.lighting.clear();
        if(data.hour<6 || data.hour>=19) this.lighting.rect(0,0,WIDTH,HEIGHT).fill({color:0x29394e,alpha:.28});
        else {this.lighting.poly([520,0,630,0,260,512,110,512]).fill({color:0xffe6a5,alpha:.07});this.lighting.circle(680,62,32).fill({color:0xffe4a1,alpha:.18});}
        const last=data.state.lastOperation;
        if(first) this.lastOperation=last?.id || '';
        if(last && last.id!==this.lastOperation) {
            this.lastOperation=last.id;
            const op=last.operation;
            let destination: Cell={x:12,y:12};
            if(op.targets?.length && ['plant','water','harvest','fertilize'].includes(op.kind)) {const p=plotCell(op.targets[0]);destination={x:p.x+1,y:p.y};}
            else if(op.targets?.length) {const a=data.state.animals.find(v=>v.id===op.targets![0]);destination={x:14,y:a?.building==='coop'?12:8};}
            else if(op.building) destination={x:15,y:op.building==='coop'?10:5};
            this.path=findPath({x:Math.round(this.actor.x/TILE),y:Math.round(this.actor.y/TILE)},destination,this.blocked);
            this.work=['plant','water','harvest','feed'].includes(op.kind)?op.kind:'plant';this.workUntil=0;
        }
        this.animate(0);
        this.app.render();
    }
    private animate(dt:number) {
        if(!this.data) return;
        this.time+=dt;
        const still=this.reduced.matches;
        let mode=this.direction;
        if(this.path.length && !still) {
            const dest=this.path[0],dx=dest.x*TILE-this.actor.x,dy=dest.y*TILE-this.actor.y;
            this.direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';mode=this.direction;
            const distance=Math.hypot(dx,dy),step=55*dt;
            if(distance<=step) {this.actor.position.set(dest.x*TILE,dest.y*TILE);this.path.shift();if(!this.path.length)this.workUntil=this.time+2;}
            else {this.actor.x+=dx/distance*step;this.actor.y+=dy/distance*step;}
        } else if(this.work && !still) {
            if(!this.workUntil)this.workUntil=this.time+2;
            if(this.time<this.workUntil) mode=this.work;else this.work='';
        }
        const frame=still || (!this.path.length && !this.work)?0:Math.floor(this.time*7)%4;
        const {style,palette}=this.data.appearance;
        this.actor.texture=this.textures.get(`person-${style}-${palette}-${mode}-${frame}`)!;
        for(const a of this.animals) {
            if(!still && this.time>=a.next) {
                const n=Math.floor(this.time)+a.animal.id.charCodeAt(0);
                a.mode=n%3===0?'eat':n%3===1?'idle':'walk';a.next=this.time+3+n%4;
                a.target={x:(15.5+(n*13%65)/10)*TILE,y:(a.animal.building==='coop'?11.2:7.2)*TILE+(n%12)};
            }
            if(a.mode==='walk' && !still) {
                const dx=a.target.x-a.sprite.x,dy=a.target.y-a.sprite.y,d=Math.hypot(dx,dy);
                if(d>1){a.sprite.x+=dx/d*Math.min(d,dt*12);a.sprite.y+=dy/d*Math.min(d,dt*12);}else a.mode='idle';
                a.sprite.scale.x=dx<0?-1:1;a.sprite.pivot.x=dx<0?32:0;
            }
            a.sprite.texture=this.textures.get(`${a.animal.kind}-${still?'idle':a.mode}-${still?0:Math.floor(this.time*4)%4}`)!;
        }
        this.rain.clear();
        if(this.data.weather==='rain') for(let i=0;i<(still?20:90);i++) {
            const x=(i*137+this.time*(still?0:12))%WIDTH,y=(i*73+this.time*(still?0:150))%HEIGHT;
            this.rain.rect(Math.floor(x),Math.floor(y),1,6).fill({color:0xdceae7,alpha:.65});
            if(i%8===0)this.rain.rect(Math.floor(x)-2,Math.floor(y)+9,5,1).fill({color:0xe5eee3,alpha:.45});
        }
    }
    dispose() {
        if(this.disposed)return;this.disposed=true;
        document.removeEventListener('visibilitychange',this.visibility);this.reduced.removeEventListener('change',this.visibility);
        if(this.initialized)this.app.destroy(true,{children:true,texture:false,textureSource:false});
        this.textures.forEach(t=>t.destroy());this.textures.clear();
        users=Math.max(0,users-1);
        queueMicrotask(()=>{if(!users && Assets.cache.has(farmAtlasUrl)) void Assets.unload(farmAtlasUrl).catch(()=>undefined);});
    }
}
