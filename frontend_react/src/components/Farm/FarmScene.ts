import {Application, Assets, Container, Graphics, Rectangle, Sprite, Texture} from 'pixi.js';
import type {FarmAnimal, FarmPlot, FarmSelection, FarmState} from '../../types/api/farm';
import {findPath, plotCell, type Cell} from './pathfinding';
import {farmAtlasUrl, farmFramesUrl} from './assets';
import {terrain} from './terrain';
import {props} from './props';
import {BUILDINGS, HEIGHT, POND, START, TILE, TREES, WIDTH, obstacles, type Rect} from './layout';
interface Frame {x:number; y:number; width:number; height:number}
interface MovingAnimal {sprite: Sprite; animal: FarmAnimal; target: {x:number;y:number}; next: number; mode: string}
type Focus = () => Rect;
let users = 0;
export class FarmScene {
    readonly app = new Application();
    private textures = new Map<string,Texture>();
    private objects = new Container();
    private creatures = new Container();
    private canopy = new Container();
    private shimmer = new Graphics();
    private sparkles = new Graphics();
    private lighting = new Graphics();
    private rain = new Graphics();
    private focusBox = new Graphics();
    private actor = new Sprite();
    private animals: MovingAnimal[] = [];
    private ready: Rect[] = [];
    private data: FarmState | null = null;
    private focus: Focus | null = null;
    private lastOperation = '';
    private path: Cell[] = [];
    private direction = 'down';
    private work = '';
    private workUntil = 0;
    private time = 0;
    private disposed = false;
    private initialized = false;
    private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    private blocked = obstacles();
    constructor(private host: HTMLElement, private onSelect: (selection: FarmSelection) => void) {}
    async init() {
        users++;
        try {
            const [atlas, frames] = await Promise.all([Assets.load<Texture>(farmAtlasUrl), fetch(farmFramesUrl).then(r => {if(!r.ok) throw new Error('素材加载失败');return r.json() as Promise<Record<string,Frame>>;})]);
            if (this.disposed) return;
            await this.app.init({width:WIDTH,height:HEIGHT,background:0x9cc46a,antialias:false,resolution:1,autoDensity:false,autoStart:false});
            this.initialized = true;
            if(this.disposed) {this.app.destroy(true); return;}
            atlas.source.scaleMode = 'nearest';
            for(const [name,frame] of Object.entries(frames)) this.textures.set(name,new Texture({source:atlas.source,frame:new Rectangle(frame.x,frame.y,frame.width,frame.height)}));
            this.host.appendChild(this.app.canvas); this.app.canvas.style.width='100%';this.app.canvas.style.height='100%';this.app.canvas.style.display='block';this.app.canvas.style.imageRendering='pixelated';
            this.app.canvas.setAttribute('aria-label','像素农场地图；地块与动物详情也可通过下方列表查看');
            this.creatures.sortableChildren = true;
            this.app.stage.addChild(terrain(),this.shimmer,props(),this.objects,this.creatures,this.canopy,this.sparkles,this.lighting,this.rain,this.focusBox);
            this.plantTrees();
            this.actor.position.set(START.x*TILE,START.y*TILE);this.creatures.addChild(this.actor);
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
    private sprite(name:string,x:number,y:number,parent:Container=this.objects) {
        const s=new Sprite(this.textures.get(name));s.position.set(x,y);parent.addChild(s);return s;
    }
    /** 统一绑定点击与悬停高亮，focus 返回当前需要描边的范围。 */
    private bind(target: Container, selection: FarmSelection, focus: Focus) {
        target.eventMode='static';target.cursor='pointer';
        target.on('pointertap',()=>this.onSelect(selection));
        target.on('pointerover',()=>{this.focus=focus;this.refresh();});
        target.on('pointerout',()=>{if(this.focus===focus){this.focus=null;this.refresh();}});
    }
    private refresh() {
        this.drawFocus();
        if(!this.app.ticker.started) this.app.render();
    }
    private plantTrees() {
        // 按纵坐标排序，靠下的树压住靠上的树。
        for(const [x,y] of [...TREES].sort((a,b)=>a[1]-b[1])) {
            this.canopy.addChild(new Graphics().rect(x+14,y+58,36,5).fill({color:0x000000,alpha:.14}));
            this.sprite('tree',x,y,this.canopy);
        }
    }
    update(data: FarmState) {
        if(this.disposed || !this.initialized) return;
        const first=this.data===null;
        this.data=data;
        this.focus=null;
        this.objects.removeChildren().forEach(c => c.destroy());
        const positions=new Map(this.animals.map(a=>[a.animal.id,{x:a.sprite.x,y:a.sprite.y,target:a.target,next:a.next,mode:a.mode}]));
        this.animals.forEach(a => a.sprite.destroy());this.animals=[];
        this.ready=[];
        const now=Date.parse(data.serverTime)/1000;
        for(let i=0;i<16;i++) this.drawPlot(data.state.plots.find(v=>v.id===String(i)),String(i),data.weather==='rain',now);
        for(const kind of ['barn','coop'] as const) {
            const building=data.state.buildings[kind], {lot}=BUILDINGS[kind];
            const selection: FarmSelection={kind:'building',id:kind}, focus=()=>lot;
            if(building) {
                this.objects.addChild(new Graphics().rect(lot.x+4,lot.y+lot.h-4,lot.w-8,5).fill({color:0x000000,alpha:.16}));
                this.bind(this.sprite(`${kind}-${building.level}`,lot.x,lot.y),selection,focus);
            } else this.bind(this.objects.addChild(constructionLot(lot)),selection,focus);
        }
        for(const [i,animal] of data.state.animals.entries()) {
            const spot=BUILDINGS[animal.building];
            const x=spot.pen.x+14+(i%6)*30,y=spot.animalTop+(Math.floor(i/6)%2)*30;
            const s=this.sprite(`${animal.kind}-idle-0`,x,y,this.creatures);
            this.bind(s,{kind:'animal',id:animal.id},()=>({x:s.x,y:s.y+4,w:32,h:26}));
            const previous=positions.get(animal.id);if(previous)s.position.set(previous.x,previous.y);
            this.animals.push({sprite:s,animal,target:previous?.target||{x,y},next:previous?.next??this.time+i*.4,mode:previous?.mode||'idle'});
        }
        this.drawLighting(data);
        const last=data.state.lastOperation;
        if(first) this.lastOperation=last?.id || '';
        if(last && last.id!==this.lastOperation) {
            this.lastOperation=last.id;
            const op=last.operation;
            let destination: Cell=START;
            if(op.targets?.length && ['plant','water','harvest','fertilize'].includes(op.kind)) {const p=plotCell(op.targets[0]);destination={x:p.x+1,y:p.y};}
            else if(op.targets?.length) {const a=data.state.animals.find(v=>v.id===op.targets![0]);destination=BUILDINGS[a?.building ?? 'barn'].front;}
            else if(op.building) destination=BUILDINGS[op.building].front;
            this.path=findPath({x:Math.round(this.actor.x/TILE),y:Math.round(this.actor.y/TILE)},destination,this.blocked);
            this.work=['plant','water','harvest','feed'].includes(op.kind)?op.kind:'plant';this.workUntil=0;
        }
        this.animate(0);
        this.app.render();
    }
    private drawPlot(p: FarmPlot | undefined, id: string, raining: boolean, now: number) {
        const cell=plotCell(id), x=cell.x*TILE, y=cell.y*TILE;
        const tile=new Graphics();
        const focus=()=>({x:x-3,y:y-3,w:38,h:38});
        if(!p) {
            // 未开垦：浅色虚线框和十字，提示可扩建。
            tile.rect(x,y,32,32).fill({color:0xffffff,alpha:.08});
            for(let d=0;d<32;d+=6) {
                tile.rect(x+d,y,3,1).fill({color:0xffffff,alpha:.55});tile.rect(x+d,y+31,3,1).fill({color:0xffffff,alpha:.55});
                tile.rect(x,y+d,1,3).fill({color:0xffffff,alpha:.55});tile.rect(x+31,y+d,1,3).fill({color:0xffffff,alpha:.55});
            }
            tile.rect(x+12,y+15,8,2).fill({color:0xffffff,alpha:.7});tile.rect(x+15,y+12,2,8).fill({color:0xffffff,alpha:.7});
            this.objects.addChild(tile);
            return;
        }
        const wet=p.wet ?? (p.wateredUntil>now || raining);
        tile.rect(x-2,y+30,36,4).fill({color:0x000000,alpha:.15});
        tile.rect(x-2,y-2,36,34).fill(0x6e4a2f);
        tile.rect(x,y,32,30).fill(wet?0x6f4b32:0x9a6b45);
        for(let row=0;row<4;row++) {
            tile.rect(x+2,y+4+row*7,28,2).fill(wet?0x553823:0x7c5435);
            tile.rect(x+2,y+3+row*7,28,1).fill(wet?0x80593d:0xb3825a);
        }
        if(wet) for(const [dx,dy] of [[6,9],[20,16],[12,23],[25,5]]) tile.rect(x+dx,y+dy,2,1).fill({color:0xbfe3ef,alpha:.8});
        this.objects.addChild(tile);
        this.bind(tile,{kind:'plot',id:p.id},focus);
        if(p.crop) {
            const phase=p.crop.grown>=p.crop.rules.growthSeconds?2:p.crop.grown>=p.crop.rules.growthSeconds*.35?1:0;
            this.bind(this.sprite(`${p.crop.kind}-${phase}`,x,y-6),{kind:'plot',id:p.id},focus);
            if(phase===2) this.ready.push({x,y,w:32,h:32});
        }
    }
    private drawLighting(data: FarmState) {
        const g=this.lighting;g.clear();
        const h=data.hour, night=h<5 || h>=20, dusk=h>=17 && h<20, dawn=h>=5 && h<7;
        if(night) {
            g.rect(0,0,WIDTH,HEIGHT).fill({color:0x1b2747,alpha:.42});
            // 夜间屋内灯光。
            for(const kind of ['barn','coop'] as const) if(data.state.buildings[kind]) {
                const {lot}=BUILDINGS[kind];
                g.circle(lot.x+32,lot.y+40,30).fill({color:0xffd27a,alpha:.12});
                g.circle(lot.x+32,lot.y+40,16).fill({color:0xffd27a,alpha:.12});
            }
        } else if(dusk) g.rect(0,0,WIDTH,HEIGHT).fill({color:0xff8a4c,alpha:.14});
        else if(dawn) g.rect(0,0,WIDTH,HEIGHT).fill({color:0xffc08a,alpha:.12});
        else if(data.weather!=='rain') {
            g.poly([500,0,600,0,300,HEIGHT,180,HEIGHT]).fill({color:0xfff2c4,alpha:.06});
            g.poly([620,0,660,0,420,HEIGHT,370,HEIGHT]).fill({color:0xfff2c4,alpha:.05});
        }
        if(data.weather==='rain') g.rect(0,0,WIDTH,HEIGHT).fill({color:0x3f5266,alpha:.2});
    }
    private drawFocus() {
        const g=this.focusBox;g.clear();
        if(!this.focus) return;
        const {x,y,w,h}=this.focus(), c=0xfff7d6, l=7;
        // 像素风四角括号描边。
        for(const [cx,cy,sx,sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]) {
            g.rect(sx>0?cx:cx-l,sy>0?cy:cy-2,l,2).fill(c);
            g.rect(sx>0?cx:cx-2,sy>0?cy:cy-l,2,l).fill(c);
        }
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
        this.actor.zIndex=this.actor.y;
        for(const a of this.animals) {
            const spot=BUILDINGS[a.animal.building];
            if(!still && this.time>=a.next) {
                const n=Math.floor(this.time)+a.animal.id.charCodeAt(0);
                a.mode=n%3===0?'eat':n%3===1?'idle':'walk';a.next=this.time+3+n%4;
                a.target={x:spot.pen.x+12+(n*37%(spot.pen.w-56)),y:spot.animalTop+(n*13%(spot.animalBottom-spot.animalTop))};
            }
            if(a.mode==='walk' && !still) {
                const dx=a.target.x-a.sprite.x,dy=a.target.y-a.sprite.y,d=Math.hypot(dx,dy);
                if(d>1){a.sprite.x+=dx/d*Math.min(d,dt*12);a.sprite.y+=dy/d*Math.min(d,dt*12);}else a.mode='idle';
                a.sprite.scale.x=dx<0?-1:1;a.sprite.pivot.x=dx<0?32:0;
            }
            a.sprite.zIndex=a.sprite.y;
            a.sprite.texture=this.textures.get(`${a.animal.kind}-${still?'idle':a.mode}-${still?0:Math.floor(this.time*4)%4}`)!;
        }
        this.drawShimmer(still);
        this.drawSparkles(still);
        this.drawFocus();
        this.rain.clear();
        if(this.data.weather==='rain') for(let i=0;i<(still?20:90);i++) {
            const x=(i*137+this.time*(still?0:12))%WIDTH,y=(i*73+this.time*(still?0:150))%HEIGHT;
            this.rain.rect(Math.floor(x),Math.floor(y),1,6).fill({color:0xdceae7,alpha:.65});
            if(i%8===0)this.rain.rect(Math.floor(x)-2,Math.floor(y)+9,5,1).fill({color:0xe5eee3,alpha:.45});
        }
    }
    /** 池面波光缓慢流动。 */
    private drawShimmer(still: boolean) {
        const g=this.shimmer;g.clear();
        for(let i=0;i<6;i++) {
            const phase=still?0:this.time*.6+i*1.7, alpha=.25+.25*Math.sin(phase);
            const x=POND.x+30+((i*53+Math.floor(phase*4))%(POND.w-70)), y=POND.y+18+(i*29)%(POND.h-36);
            g.rect(x,y,8,1).fill({color:0xe4f6fb,alpha});g.rect(x+3,y-1,3,1).fill({color:0xe4f6fb,alpha:alpha*.6});
        }
    }
    /** 可收获作物上方闪烁的小星星。 */
    private drawSparkles(still: boolean) {
        const g=this.sparkles;g.clear();
        for(const [i,r] of this.ready.entries()) {
            const t=still?0:this.time*3+i, bob=Math.round(Math.sin(t)*2), x=r.x+r.w-6, y=r.y-10+bob;
            g.rect(x,y-3,1,7).fill(0xfff1a8);g.rect(x-3,y,7,1).fill(0xfff1a8);g.rect(x-1,y-1,3,3).fill(0xffffff);
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

/** 未建造建筑的空地：平整土台、木桩和绳子。 */
function constructionLot(lot: Rect) {
    const g=new Graphics(), x=lot.x+4, y=lot.y+20, w=lot.w-8, h=lot.h-24;
    g.rect(x,y,w,h).fill({color:0xc9a774,alpha:.85});
    g.rect(x,y,w,2).fill({color:0xe2c99a,alpha:.9});
    for(const [px,py] of [[x,y],[x+w-3,y],[x,y+h-8],[x+w-3,y+h-8]]) {g.rect(px,py-6,3,12).fill(0x7a5536);g.rect(px,py-6,3,2).fill(0xc0915e);}
    g.rect(x+2,y-3,w-4,1).fill(0xf2e6c4);g.rect(x+2,y+h-5,w-4,1).fill(0xf2e6c4);
    g.rect(x+20,y+8,16,10).fill(0x7a5536);g.rect(x+21,y+9,14,8).fill(0xe0b67f);g.rect(x+27,y+18,2,6).fill(0x7a5536);
    g.rect(x+24,y+12,8,1).fill(0x7a5536);g.rect(x+27,y+10,2,5).fill(0x7a5536);
    return g;
}
