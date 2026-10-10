import {Application,Assets,Container,Graphics} from 'pixi.js';
import type {Texture} from 'pixi.js';
import {LayeredPlayerActor} from './playerAppearance/LayeredPlayerActor';
import {ProfessionAuraRenderer} from './playerAppearance/ProfessionAuraRenderer';
import {identitySheet,outfitArts} from './playerAppearance/layeredPlayerArt';
import {getProfessionAura} from '../art/professionAuras';
import {playerStillFrame} from '../art/playerStillArt';

/** Atlas details share the same identity, clothes and aura as the independent preview. */
export class PlayerPortraitRenderer {
    private readonly app=new Application();
    private readonly world=new Container();
    private readonly aura=new ProfessionAuraRenderer();
    private actor?:LayeredPlayerActor;
    private readonly shadow=new Graphics().ellipse(0,10,165,26).fill({color:0x426859,alpha:.15});
    private readonly resizeObserver=new ResizeObserver(()=>this.resize());
    private readonly visibilityObserver=new IntersectionObserver(entries=>{
        this.visible=entries.some(entry=>entry.isIntersecting);this.syncPlayback();
    });
    private readonly reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    private visible=false;
    private initialized=false;
    private disposed=false;
    private time=0;
    constructor(private readonly host:HTMLElement,private readonly job:string) {}

    async init() {
        await this.app.init({width:Math.max(1,this.host.clientWidth),height:Math.max(1,this.host.clientHeight),
            backgroundAlpha:0,antialias:false,autoDensity:true,autoStart:false,
            resolution:Math.min(devicePixelRatio||1,2),preference:'webgl'});
        this.initialized=true;
        if(this.disposed){this.app.destroy(true,{children:true});return;}
        const art=outfitArts.find(item=>item.id===this.job);
        const urls=[...new Set([identitySheet,art?.body.url||identitySheet])];
        const sheets=await Promise.all(urls.map(async url=>{
            const texture=await Assets.load<Texture>(url);texture.source.scaleMode='nearest';return [url,texture] as const;
        }));
        if(this.disposed)return;
        this.actor=new LayeredPlayerActor(new Map(sheets));
        this.actor.configure({outfit:this.job,weapon:'none',aura:getProfessionAura(this.job),showBody:true,
            showOutfit:true,showWeapon:false,showRear:true,showGround:true,backdrop:'plain',paused:false});
        this.world.addChild(this.shadow,this.aura.ground,this.aura.rear,this.actor);this.app.stage.addChild(this.world);
        this.app.canvas.setAttribute('aria-hidden','true');
        this.app.canvas.style.cssText='display:block;width:100%;height:100%;pointer-events:none;image-rendering:pixelated';
        this.host.appendChild(this.app.canvas);
        this.app.ticker.add(ticker=>{this.time+=Math.min(ticker.deltaMS/1000,.05);this.draw();});
        this.resizeObserver.observe(this.host);this.visibilityObserver.observe(this.host);
        document.addEventListener('visibilitychange',this.syncPlayback);this.reducedMotion.addEventListener('change',this.onMotionChange);
        this.resize();
    }
    private draw() {this.actor?.update(this.time);this.aura.draw(getProfessionAura(this.job),this.time,true,true);}
    private resize() {
        if(!this.actor||this.disposed)return;
        const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;
        this.app.renderer.resize(width,height);
        const scale=Math.min(width/playerStillFrame.width,height/playerStillFrame.height);
        this.world.scale.set(scale);this.world.position.set(width/2,height/2+(playerStillFrame.feetY-playerStillFrame.height/2)*scale);
        this.draw();this.app.render();
    }
    private syncPlayback=()=>{
        if(!this.initialized||this.disposed)return;
        if(document.hidden||!this.visible||this.reducedMotion.matches)this.app.stop();else this.app.start();
    };
    private onMotionChange=()=>{if(this.reducedMotion.matches){this.time=0;this.resize();}this.syncPlayback();};
    dispose() {
        if(this.disposed)return;this.disposed=true;
        this.resizeObserver.disconnect();this.visibilityObserver.disconnect();
        document.removeEventListener('visibilitychange',this.syncPlayback);this.reducedMotion.removeEventListener('change',this.onMotionChange);
        this.aura.dispose();
        if(this.initialized)this.app.destroy(true,{children:true});
        if(!this.world.destroyed)this.world.destroy({children:true});
        if(!this.shadow.destroyed)this.shadow.destroy();
    }
}
