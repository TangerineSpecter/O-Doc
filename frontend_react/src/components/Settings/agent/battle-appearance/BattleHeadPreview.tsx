import {useEffect, useRef, useState} from 'react';
import {Application,Assets,Container,Graphics,Texture} from 'pixi.js';
import {LayeredPlayerActor} from '@/components/Combat/animation/playerAppearance/LayeredPlayerActor';
import {identitySheet,outfitArts,independentWeapons} from '@/components/Combat/animation/playerAppearance/layeredPlayerArt';

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
    constructor(private host:HTMLElement, private jobId:string, private headUrl:string) {}

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
        this.actor.configure({outfit:this.jobId,weapon:'none',aura:'none',showBody:true,showOutfit:true,showWeapon:false,showRear:false,showGround:false,backdrop:'plain',paused:false});
        this.actor.scale.set(1);
        this.world.addChild(this.floor,this.actor);this.app.stage.addChild(this.world);
        this.app.canvas.style.cssText='display:block;width:100%;height:100%;image-rendering:pixelated';
        this.host.appendChild(this.app.canvas);
        await this.actor.setHeadImage(this.headUrl);
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

    setHead(url:string) {this.headUrl=url;void this.actor?.setHeadImage(url);}
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

export function BattleHeadPreview({jobId,headUrl}:{jobId:string;headUrl:string}) {
    const host=useRef<HTMLDivElement>(null);
    const scene=useRef<PreviewScene|undefined>(undefined);
    const [pose,setPose]=useState<Pose>('idle');
    const [ready,setReady]=useState(false);
    useEffect(()=>{
        if(!host.current)return;
        let alive=true;
        const preview=new PreviewScene(host.current,jobId,'');scene.current=preview;
        void preview.init().then(()=>{if(alive)setReady(true);}).catch(()=>{if(alive)setReady(false);});
        const observer=new ResizeObserver(()=>preview.resize());observer.observe(host.current);
        return ()=>{alive=false;observer.disconnect();preview.dispose();scene.current=undefined;};
    },[jobId]);
    useEffect(()=>{scene.current?.setHead(headUrl);},[headUrl]);
    return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div><p className="text-sm font-semibold text-slate-800">战斗身体预览</p><p className="mt-0.5 text-xs text-slate-500">使用当前冒险职业 · {jobId}</p></div>
            <div className="flex rounded-full bg-slate-100 p-1" aria-label="动作演示">
                {(['idle','hit','cast'] as Pose[]).map((item,index)=><button key={item} type="button" onClick={()=>{setPose(item);scene.current?.play(item);}} className={`rounded-full px-2.5 py-1 text-[11px] ${pose===item?'bg-white text-orange-700 shadow-sm':'text-slate-500 hover:text-slate-800'}`}>{['待机','受击','施法'][index]}</button>)}
            </div>
        </div>
        <div className="relative h-[300px] bg-[linear-gradient(180deg,#eef2f0_0%,#e4eae8_100%)] sm:h-[360px]">
            {!ready&&<div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">正在载入战斗角色…</div>}
            <div ref={host} className="absolute inset-0" />
        </div>
    </div>;
}
