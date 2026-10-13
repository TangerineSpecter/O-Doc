import {useEffect, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {Application,Assets,Container,Graphics,Texture} from 'pixi.js';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp} from 'lucide-react';
import {LayeredPlayerActor} from '@/components/Combat/animation/playerAppearance/LayeredPlayerActor';
import type {AppearanceOverlayTransform,AppearanceOverlayTransforms} from '@/components/Combat/animation/playerAppearance/LayeredPlayerActor';
import {identitySheet,outfitArts,independentWeapons} from '@/components/Combat/animation/playerAppearance/layeredPlayerArt';
import {SettingsSelect} from '../../SettingsSelect';

type Pose='idle'|'hit'|'cast';

class PreviewScene {
    private app=new Application();
    private world=new Container();
    private floor=new Graphics();
    private actor?:LayeredPlayerActor;
    private startedAt=performance.now();
    private actionStartedAt=0;
    private pose:Pose='idle';
    private disposed=false;
    private appInitialized=false;
    private appDestroyed=false;
    private characterUrl='';
    private headUrl='';
    constructor(private host:HTMLElement, private jobId:string, private weaponId:string, private overlays:AppearanceOverlayTransforms) {}

    async init() {
        await this.app.init({background:0xeef2f0,antialias:false,autoDensity:true,resolution:Math.min(devicePixelRatio||1,2),preference:'webgl',autoStart:false});
        this.appInitialized=true;
        if(this.disposed){this.destroyApplication();return;}
        const urls=[...new Set([identitySheet,...outfitArts.map(item=>item.body.url),...independentWeapons.map(item=>item.art.url)])];
        const sheets=await Promise.all(urls.map(async url=>{
            const texture=await Assets.load<Texture>(url);texture.source.scaleMode='nearest';return [url,texture] as const;
        }));
        if(this.disposed)return;
        this.actor=new LayeredPlayerActor(new Map(sheets));
        this.actor.configure({outfit:this.jobId,weapon:this.weaponId,aura:'none',showBody:true,showOutfit:true,showWeapon:this.weaponId!=='none',showRear:false,showGround:false,backdrop:'plain',paused:false});
        this.actor.setAppearanceOverlays(this.overlays);
        this.actor.scale.set(1);
        this.world.addChild(this.floor,this.actor);this.app.stage.addChild(this.world);
        this.app.canvas.style.cssText='display:block;width:100%;height:100%;image-rendering:pixelated';
        this.host.appendChild(this.app.canvas);
        await this.actor.setFullBodyImage(this.characterUrl||undefined);
        await this.actor.setHeadImage(this.headUrl||undefined);
        if(this.disposed)return;
        this.app.ticker.add(()=>{
            const t=(performance.now()-this.startedAt)/1000;
            const age=this.pose==='idle'?Infinity:(performance.now()-this.actionStartedAt)/1000;
            const active=age<.6;
            const impulse=active?Math.sin(Math.PI*age/.6):0;
            const lean=this.pose==='hit'&&active?-.12*impulse:this.pose==='cast'&&active?.045*impulse:0;
            const lift=this.pose==='cast'&&active?10*impulse:this.pose==='hit'&&active?4*impulse:0;
            this.actor?.update(t,lean,lift);
            this.world.x=Math.round(this.app.renderer.width/2);
            this.world.y=Math.round(this.app.renderer.height*.89);
            this.app.render();
            if(!active&&this.pose!=='idle')this.pose='idle';
        });
        this.resize();
        this.app.start();
    }

    setCharacter(characterUrl:string,headUrl:string) {this.characterUrl=characterUrl;this.headUrl=headUrl;void this.actor?.setFullBodyImage(characterUrl||undefined);void this.actor?.setHeadImage(headUrl||undefined);}
    setHeadLayer(behind:boolean) {this.actor?.setHeadBehindBody(behind);}
    setWeapon(id:string) {
        this.weaponId=id;
        this.actor?.configure({outfit:this.jobId,weapon:id,aura:'none',showBody:true,showOutfit:true,showWeapon:id!=='none',showRear:false,showGround:false,backdrop:'plain',paused:false});
        this.actor?.setAppearanceOverlays(this.overlays);
    }
    setOverlays(overlays:AppearanceOverlayTransforms) {this.overlays=overlays;this.actor?.setAppearanceOverlays(overlays);}
    play(pose:Pose) {this.pose=pose;this.actionStartedAt=performance.now();}
    resize() {
        if(!this.actor||this.disposed)return;
        const width=this.host.clientWidth,height=this.host.clientHeight;
        if(!width||!height)return;
        this.app.renderer.resize(width,height);
        const scale=Math.min(width/430,height/610);
        this.actor.scale.set(scale);
        this.floor.clear().ellipse(0,2,66,10).fill({color:0x45625f,alpha:.17});
        this.actor.position.set(0,0);
        this.app.render();
    }
    dispose() {
        if(this.disposed)return;
        this.disposed=true;
        this.destroyApplication();
        this.host.replaceChildren();
    }

    private destroyApplication() {
        // Application.init() awaits renderer creation before Pixi initializes its plugins.
        // React StrictMode can clean up this scene while that await is still pending.
        if(!this.appInitialized||this.appDestroyed)return;
        this.appDestroyed=true;
        this.app.destroy(true,{children:true});
    }
}

type EditableOverlay='leftHand'|'rightHand'|'weapon'|'none';
interface BattleHeadPreviewProps {
    jobId:string;weaponId:string;headUrl:string;characterUrl:string;headBehindBody?:boolean;
    onWeaponChange:(id:string)=>void;previewWeaponOnly:boolean;
    overlays:AppearanceOverlayTransforms;activeOverlay:EditableOverlay;onActiveOverlayChange:(key:EditableOverlay)=>void;
    onOverlayChange:(key:Exclude<EditableOverlay,'none'>,value:AppearanceOverlayTransform)=>void;
}

export function BattleHeadPreview({jobId,weaponId,headUrl,characterUrl,headBehindBody=false,onWeaponChange,previewWeaponOnly,overlays,activeOverlay,onActiveOverlayChange,onOverlayChange}:BattleHeadPreviewProps) {
    const host=useRef<HTMLDivElement>(null);
    const scene=useRef<PreviewScene|undefined>(undefined);
    const drag=useRef<{x:number;y:number;start:AppearanceOverlayTransform}|null>(null);
    const [pose,setPose]=useState<Pose>('idle');
    const [ready,setReady]=useState(false);
    useEffect(()=>{
        if(!host.current)return;
        let alive=true;
        const preview=new PreviewScene(host.current,jobId,weaponId,overlays);scene.current=preview;
        void preview.init().then(()=>{if(alive)setReady(true);}).catch(()=>{if(alive)setReady(false);});
        const observer=new ResizeObserver(()=>preview.resize());observer.observe(host.current);
        return ()=>{alive=false;observer.disconnect();preview.dispose();scene.current=undefined;};
    },[jobId]);
    useEffect(()=>{scene.current?.setWeapon(weaponId);},[weaponId]);
    useEffect(()=>{scene.current?.setCharacter(characterUrl,headUrl);},[characterUrl,headUrl]);
    useEffect(()=>{scene.current?.setOverlays(overlays);},[overlays]);
    useEffect(()=>{scene.current?.setHeadLayer(headBehindBody);},[headBehindBody,jobId]);
    const pointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
        if(activeOverlay==='none')return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current={x:event.clientX,y:event.clientY,start:overlays[activeOverlay]};
    };
    const pointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
        if(!drag.current||!host.current||activeOverlay==='none')return;
        const scale=Math.min(host.current.clientWidth/430,host.current.clientHeight/610);
        const start=drag.current.start;
        onOverlayChange(activeOverlay,{...start,x:Math.round(start.x+(event.clientX-drag.current.x)/scale),y:Math.round(start.y+(event.clientY-drag.current.y)/scale)});
    };
    const pointerUp=()=>{drag.current=null;};
    const targetLabel=activeOverlay==='weapon'?'武器':activeOverlay==='leftHand'?'左手':'右手';
    const currentOverlay=activeOverlay==='none'?null:overlays[activeOverlay];
    const changeCurrent=(patch:Partial<AppearanceOverlayTransform>)=>{
        if(activeOverlay==='none'||!currentOverlay)return;
        onOverlayChange(activeOverlay,{...currentOverlay,...patch});
    };
    const moveCurrent=(x:number,y:number)=>changeCurrent({x:(currentOverlay?.x||0)+x,y:(currentOverlay?.y||0)+y});
    return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div><p className="text-sm font-semibold text-slate-800">战斗角色预览</p><p className="mt-0.5 text-xs text-slate-500">当前战斗姿势 · {jobId}</p></div>
            <div className="flex rounded-full bg-slate-100 p-1" aria-label="动作演示">
                {(['idle','hit','cast'] as Pose[]).map((item,index)=><button key={item} type="button" onClick={()=>{setPose(item);scene.current?.play(item);}} className={`rounded-full px-2.5 py-1 text-[11px] ${pose===item?'bg-white text-orange-700 shadow-sm':'text-slate-500 hover:text-slate-800'}`}>{['待机','受击','施法'][index]}</button>)}
            </div>
        </div>
        <div className="relative h-[300px] bg-[linear-gradient(180deg,#eef2f0_0%,#e4eae8_100%)] sm:h-[360px]">
            {!ready&&<div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">正在载入战斗角色…</div>}
            <div ref={host} className={`absolute inset-0 ${activeOverlay==='none'?'':'touch-none cursor-move'}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
            {activeOverlay!=='none'&&<div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-slate-900/70 px-2.5 py-1 text-[10px] font-medium text-white">拖动预览中的{targetLabel}调整位置</div>}
        </div>
        <div className="space-y-2 border-t border-slate-100 p-3">
            <div className="flex items-center gap-2"><label className="shrink-0 text-xs font-semibold text-slate-600">预览武器</label><div className="min-w-0 flex-1"><SettingsSelect value={weaponId} options={[{value:'none',label:'空手'},...independentWeapons.map(item=>({value:item.id,label:item.name}))]} onChange={id=>{onWeaponChange(id);if(id==='none'&&activeOverlay==='weapon')onActiveOverlayChange('none');}} menuPortal/></div></div>
            <p className="text-[11px] text-slate-500">{previewWeaponOnly?'当前显示示例武器，供持握位置校准；实际战斗按已装备武器显示。':'当前预览与装备一致；切换预览武器不会更改装备。'}</p>
            <div className="flex flex-wrap gap-1.5">
                {([{id:'none',label:'仅预览'},{id:'leftHand',label:'左手'},{id:'rightHand',label:'右手'},{id:'weapon',label:'武器'}] as const).map(item=><button key={item.id} type="button" disabled={item.id==='weapon'&&weaponId==='none'} onClick={()=>onActiveOverlayChange(item.id)} className={`rounded-lg px-2.5 py-1.5 text-[11px] disabled:opacity-40 ${activeOverlay===item.id?'bg-orange-100 font-semibold text-orange-800':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item.label}</button>)}
            </div>
            {currentOverlay&&<div className="flex items-center justify-between text-[11px] text-slate-500"><span>{targetLabel}偏移 ({currentOverlay.x}, {currentOverlay.y})</span><button type="button" onClick={()=>changeCurrent({x:0,y:0,scale:1,rotation:0})} className="font-semibold text-orange-700">重置当前图层</button></div>}
            {currentOverlay&&<div className="grid items-center gap-2 sm:grid-cols-[auto_1fr_auto]">
                <div className="flex items-center justify-center gap-1"><button type="button" onClick={()=>moveCurrent(-1,0)} className="rounded-lg bg-slate-100 p-1.5" title="左移一像素"><ArrowLeft className="h-3.5 w-3.5"/></button><div className="flex flex-col gap-1"><button type="button" onClick={()=>moveCurrent(0,-1)} className="rounded-lg bg-slate-100 p-1.5" title="上移一像素"><ArrowUp className="h-3.5 w-3.5"/></button><button type="button" onClick={()=>moveCurrent(0,1)} className="rounded-lg bg-slate-100 p-1.5" title="下移一像素"><ArrowDown className="h-3.5 w-3.5"/></button></div><button type="button" onClick={()=>moveCurrent(1,0)} className="rounded-lg bg-slate-100 p-1.5" title="右移一像素"><ArrowRight className="h-3.5 w-3.5"/></button></div>
                <label className="flex items-center gap-2 text-[10px] text-slate-500">大小 <input type="range" min="0.5" max="1.8" step="0.02" value={currentOverlay.scale} onChange={event=>changeCurrent({scale:Number(event.target.value)})} className="min-w-20 flex-1 accent-orange-500"/>{currentOverlay.scale.toFixed(2)}×</label>
                <label className="flex items-center gap-1 text-[10px] text-slate-500">旋转 <input type="range" min="-0.8" max="0.8" step="0.02" value={currentOverlay.rotation} onChange={event=>changeCurrent({rotation:Number(event.target.value)})} className="w-16 accent-orange-500"/></label>
            </div>}
            <p className="text-[11px] text-slate-500">角色全身图会替代职业底模；武器和两只像素手仍按战斗图层叠放。选择手或武器后，在上方预览中拖动对齐。</p>
        </div>
    </div>;
}
