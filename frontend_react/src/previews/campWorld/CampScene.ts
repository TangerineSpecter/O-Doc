import {frameFor, loadCampArt} from './art';
import type {CampArt} from './art';
import {drawAtmosphere, drawBridge, drawFire, drawHeldProps, traceShape} from './effects';
import {contains} from './navigation';
import {CampSimulation} from './simulation';
import {findObject, FOOT_RADIUS, GROUND_Y, WORLD_HEIGHT, WORLD_WIDTH, worldObjects} from './worldMap';
import type {Point, Resident, ResidentId, WorldCommand, WorldSnapshot} from './types';

interface SceneCallbacks {onSnapshot:(snapshot:WorldSnapshot)=>void;onHover:(id:string|null)=>void}

/** One side-view canvas. There is one ground line; camera panning changes X, never the projection. */
export class CampScene {
    private readonly canvas=document.createElement('canvas');
    private readonly g:CanvasRenderingContext2D;
    private readonly resizeObserver=new ResizeObserver(()=>this.resize());
    private readonly visibilityObserver=new IntersectionObserver(entries=>{this.visible=entries.some(entry=>entry.isIntersecting);this.syncPlayback();});
    private simulation=new CampSimulation();
    private art?:CampArt;
    private disposed=false;
    private visible=true;
    private hovered:string|null=null;
    private frameId=0;
    private lastFrame=0;
    private lastSnapshot=-1;
    private dragging:{x:number;camera:number;moved:boolean}|null=null;
    private suppressClick=false;
    private actorPositions=new Map<ResidentId,number>();

    constructor(private readonly host:HTMLElement,private readonly callbacks:SceneCallbacks) {
        this.g=this.canvas.getContext('2d',{alpha:false})!;
    }

    async init() {
        this.art=await loadCampArt();
        if(this.disposed)return;
        this.canvas.className='camp-canvas';this.canvas.tabIndex=0;
        this.canvas.setAttribute('role','img');
        this.canvas.setAttribute('aria-label','横版林间营地。点击角色选择，点击地面左右移动，点击物体互动。左右方向键移动，空格暂停，D显示碰撞。可以左右拖动画面。');
        this.host.appendChild(this.canvas);
        this.canvas.addEventListener('pointermove',this.handleMove);this.canvas.addEventListener('pointerleave',this.handleLeave);
        this.canvas.addEventListener('pointerdown',this.handleDown);this.canvas.addEventListener('pointerup',this.handleUp);
        this.canvas.addEventListener('pointercancel',this.handleCancel);this.canvas.addEventListener('click',this.handleClick);
        this.canvas.addEventListener('keydown',this.handleKey);document.addEventListener('visibilitychange',this.syncPlayback);
        this.resizeObserver.observe(this.host);this.visibilityObserver.observe(this.host);
        if(matchMedia('(prefers-reduced-motion: reduce)').matches)this.simulation.paused=true;
        this.resize();this.publish();this.syncPlayback();
    }

    command(command:WorldCommand) {
        if(command.type==='reset'){const paused=this.simulation.paused,width=this.simulation.viewWidth;this.simulation=new CampSimulation();
            this.simulation.paused=paused;this.simulation.viewWidth=width;this.lastSnapshot=-1;}
        else this.simulation.command(command);
        this.draw();this.publish();this.syncPlayback();
    }

    private publish() {
        this.lastSnapshot=this.simulation.time;this.callbacks.onSnapshot(this.simulation.snapshot());
        this.canvas.dataset.world=JSON.stringify(this.simulation.diagnostics());
    }

    private drawActor(resident:Resident) {
        if(!this.art)return;
        const g=this.g,time=this.simulation.time,airborne=resident.y<GROUND_Y-2;
        const bounce=resident.pose==='walk'&&!airborne?Math.abs(Math.sin(resident.travel/6*Math.PI/2)):0;
        const breath=resident.pose!=='walk'&&resident.pose!=='sit'?Math.sin(time*2.6+(resident.id==='anya'?2:0))*.4:0;
        const y=Math.round(resident.y-(resident.pose==='sit'?8:0)-bounce-breath);
        this.actorPositions.set(resident.id,y);
        g.globalAlpha=Math.max(.09,.27-(GROUND_Y-resident.y)*.0015);g.fillStyle='#152e28';g.fillRect(Math.round(resident.x)-15,GROUND_Y,30,3);g.globalAlpha=1;
        if(resident.id===this.simulation.selected){g.fillStyle='#f9e7b0';g.fillRect(Math.round(resident.x)-18,GROUND_Y+3,36,1);
            g.fillRect(Math.round(resident.x)-18,GROUND_Y,2,4);g.fillRect(Math.round(resident.x)+16,GROUND_Y,2,4);}
        const frame=frameFor(this.art,resident,time);g.save();g.translate(Math.round(resident.x),y);g.scale(resident.facing,1);
        g.drawImage(frame.canvas,-44,-84);g.restore();drawHeldProps(g,resident,time);
    }

    private draw() {
        if(!this.art||this.disposed)return;
        const g=this.g,{time,cameraX,viewWidth,debug}=this.simulation;
        g.imageSmoothingEnabled=false;g.globalAlpha=1;g.clearRect(0,0,this.canvas.width,this.canvas.height);
        const tileWidth=Math.round(this.art.background.width/this.art.background.height*WORLD_HEIGHT);
        const offset=-Math.round(cameraX*.22)%tileWidth;
        for(let x=offset-tileWidth;x<viewWidth;x+=tileWidth)g.drawImage(this.art.background,x,0,tileWidth,WORLD_HEIGHT);
        g.save();g.translate(-Math.round(cameraX),0);
        drawBridge(g,time);
        for(const object of worldObjects)if(object.visual){const v=object.visual;g.drawImage(this.art.objects[v.art].canvas,v.x,GROUND_Y-v.height,v.width,v.height);}
        drawAtmosphere(g,time);drawFire(g,time);
        const hovered=findObject(this.hovered);
        if(hovered&&!debug){g.fillStyle='#f3df9b';for(const spot of hovered.spots)g.fillRect(spot.x-13,GROUND_Y+3,26,2);}
        for(const resident of this.simulation.residents)this.drawActor(resident);
        if(debug)this.drawDebug();
        g.restore();
    }

    private drawDebug() {
        const g=this.g;
        g.strokeStyle='#fff0b8';g.lineWidth=1;g.beginPath();g.moveTo(0,GROUND_Y);g.lineTo(WORLD_WIDTH,GROUND_Y);g.stroke();
        for(const object of worldObjects){traceShape(g,object.hit,'#a6ddff',false);if(object.collision)traceShape(g,object.collision,'#ff8e80');
            for(const spot of object.spots){g.fillStyle='#b4f3b9';g.fillRect(spot.x-3,spot.y-3,6,6);}}
        for(const resident of this.simulation.residents){g.strokeStyle='#ffe8a2';g.strokeRect(resident.x-FOOT_RADIUS,resident.y-FOOT_RADIUS,FOOT_RADIUS*2,FOOT_RADIUS*2);
            if(resident.path.length){g.beginPath();g.moveTo(resident.x,resident.y);for(const point of resident.path)g.lineTo(point.x,point.y);g.stroke();}}
    }

    private resize() {
        if(!this.art||this.disposed||!this.host.clientHeight)return;
        this.simulation.viewWidth=Math.min(WORLD_WIDTH,Math.round(this.host.clientWidth/this.host.clientHeight*WORLD_HEIGHT));
        this.simulation.cameraX=Math.max(0,Math.min(WORLD_WIDTH-this.simulation.viewWidth,this.simulation.cameraX));
        this.canvas.width=this.simulation.viewWidth;this.canvas.height=WORLD_HEIGHT;this.draw();this.publish();
    }

    private frame=(now:number)=>{
        this.frameId=0;
        if(this.disposed||document.hidden||!this.visible||this.simulation.paused)return;
        if(now-this.lastFrame>=1000/30){this.simulation.tick((now-this.lastFrame)/1000);this.lastFrame=now;this.draw();
            if(this.simulation.time-this.lastSnapshot>=.08)this.publish();}
        this.frameId=requestAnimationFrame(this.frame);
    };
    private syncPlayback=()=>{
        if(!this.art||this.disposed)return;
        if(document.hidden||!this.visible||this.simulation.paused){cancelAnimationFrame(this.frameId);this.frameId=0;}
        else if(!this.frameId){this.lastFrame=performance.now();this.frameId=requestAnimationFrame(this.frame);}
    };
    private at(event:MouseEvent):Point {const r=this.canvas.getBoundingClientRect();return{x:this.simulation.cameraX+(event.clientX-r.left)/r.width*this.simulation.viewWidth,y:(event.clientY-r.top)/r.height*WORLD_HEIGHT};}
    private actorAt(point:Point):Resident|undefined {
        if(!this.art)return;
        return [...this.simulation.residents].reverse().find(resident=>{
            const x=Math.floor(44+(point.x-resident.x)*resident.facing),y=Math.floor(84+point.y-(this.actorPositions.get(resident.id)??resident.y));
            return x>=0&&x<88&&y>=0&&y<88&&frameFor(this.art!,resident,this.simulation.time).alpha[(y*88+x)*4+3]>60;
        });
    }
    private objectAt(point:Point) {
        return [...worldObjects].reverse().find(object=>{
            if(!contains(object.hit,point))return false;
            if(!object.visual||!this.art)return true;
            if(object.id==='fire'&&point.y<GROUND_Y-25)return true;
            const v=object.visual,frame=this.art.objects[v.art],x=Math.floor(point.x-v.x),y=Math.floor(point.y-(GROUND_Y-v.height));
            return x>=0&&x<frame.canvas.width&&y>=0&&y<frame.canvas.height&&frame.alpha[(y*frame.canvas.width+x)*4+3]>60;
        });
    }
    private handleMove=(event:PointerEvent)=>{
        if(this.dragging){const moved=event.clientX-this.dragging.x;if(Math.abs(moved)>5)this.dragging.moved=true;
            if(this.dragging.moved){this.simulation.following=false;this.simulation.cameraX=Math.max(0,Math.min(WORLD_WIDTH-this.simulation.viewWidth,this.dragging.camera-moved/this.host.clientWidth*this.simulation.viewWidth));this.draw();this.publish();return;}}
        if(event.pointerType==='touch')return;
        const point=this.at(event),actor=this.actorAt(point),object=actor?undefined:this.objectAt(point);
        this.canvas.style.cursor=actor||object?'pointer':point.y>GROUND_Y-35?'crosshair':'grab';
        const id=object?.id??null;if(id!==this.hovered){this.hovered=id;this.callbacks.onHover(id);this.draw();}
    };
    private handleDown=(event:PointerEvent)=>{this.dragging={x:event.clientX,camera:this.simulation.cameraX,moved:false};this.canvas.setPointerCapture(event.pointerId);};
    private handleUp=(event:PointerEvent)=>{this.suppressClick=this.dragging?.moved??false;this.dragging=null;if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);};
    private handleCancel=()=>{this.dragging=null;this.suppressClick=true;};
    private handleLeave=()=>{this.hovered=null;this.callbacks.onHover(null);this.draw();};
    private handleClick=(event:MouseEvent)=>{
        if(this.suppressClick){this.suppressClick=false;return;}
        const point=this.at(event),actor=this.actorAt(point);
        if(actor){this.command({type:'select',id:actor.id});this.command({type:'greet'});return;}
        const object=this.objectAt(point);if(object)this.command({type:'interact',objectId:object.id});
        else if(point.y>=GROUND_Y-45)this.command({type:'move',point});
        this.canvas.focus({preventScroll:true});
    };
    private handleKey=(event:KeyboardEvent)=>{
        if(event.code==='Space'){event.preventDefault();this.command({type:'pause'});}
        else if(event.key.toLowerCase()==='d')this.command({type:'debug'});
        else if(event.key==='1'||event.key==='2')this.command({type:'select',id:event.key==='1'?'klee':'anya'});
        else if(event.key==='Escape')this.command({type:'closeInspector'});
        else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();
            const resident=this.simulation.residents.find(item=>item.id===this.simulation.selected)!;
            this.command({type:'move',point:{x:resident.x+(event.key==='ArrowRight'?145:-145),y:GROUND_Y}});}
    };

    dispose() {
        if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.frameId);this.resizeObserver.disconnect();this.visibilityObserver.disconnect();
        document.removeEventListener('visibilitychange',this.syncPlayback);
        this.canvas.removeEventListener('pointermove',this.handleMove);this.canvas.removeEventListener('pointerleave',this.handleLeave);
        this.canvas.removeEventListener('pointerdown',this.handleDown);this.canvas.removeEventListener('pointerup',this.handleUp);
        this.canvas.removeEventListener('pointercancel',this.handleCancel);this.canvas.removeEventListener('click',this.handleClick);this.canvas.removeEventListener('keydown',this.handleKey);this.canvas.remove();
    }
}
