import {Application,Assets,Container,Graphics} from 'pixi.js';
import type {Texture} from 'pixi.js';
import {identitySheet,outfitArts,independentWeapons} from '../../components/Combat/animation/playerAppearance/layeredPlayerArt';
import type {LayeredPlayerOptions} from '../../components/Combat/animation/playerAppearance/layeredPlayerArt';
import {LayeredPlayerActor} from '../../components/Combat/animation/playerAppearance/LayeredPlayerActor';
import {ProfessionAuraRenderer} from '../../components/Combat/animation/playerAppearance/ProfessionAuraRenderer';

/** One Pixi scene. Outfit, weapon and aura selection do not change identity. */
export class LayeredPlayerScene {
    private readonly app=new Application();
    private readonly world=new Container();
    private readonly aura=new ProfessionAuraRenderer();
    private readonly shadow=new Graphics().ellipse(0,10,165,26).fill({color:0x426859,alpha:.15});
    private readonly resizeObserver=new ResizeObserver(()=>this.resize());
    private readonly visibilityObserver=new IntersectionObserver(entries=>{this.visible=entries.some(e=>e.isIntersecting);this.syncPlayback();});
    private actor?:LayeredPlayerActor;
    private initialized=false;
    private disposed=false;
    private visible=true;
    private time=0;
    constructor(private readonly host:HTMLElement,private options:LayeredPlayerOptions) {}

    async init() {
        await this.app.init({width:Math.max(1,this.host.clientWidth),height:Math.max(1,this.host.clientHeight),
            backgroundAlpha:0,antialias:false,autoDensity:true,autoStart:false,
            resolution:Math.min(devicePixelRatio||1,2),preference:'webgl'});
        this.initialized=true;
        if(this.disposed) {this.app.destroy(true,{children:true});return;}
        const urls=[...new Set([identitySheet,...outfitArts.map(o=>o.body.url),...independentWeapons.map(w=>w.art.url)])];
        const textures=await Promise.all(urls.map(async url=>{
            const texture=await Assets.load<Texture>(url);texture.source.scaleMode='nearest';return [url,texture] as const;
        }));
        if(this.disposed) return;
        this.actor=new LayeredPlayerActor(new Map(textures));
        this.world.addChild(this.shadow,this.aura.ground,this.aura.rear,this.actor);
        this.app.stage.addChild(this.world);
        this.app.canvas.setAttribute('aria-label','新手统一底模、独立服装、武器与职业氛围效果');
        this.app.canvas.style.cssText='width:100%;height:100%;display:block;image-rendering:pixelated';
        this.host.appendChild(this.app.canvas);
        this.app.ticker.add(ticker=>{this.time+=Math.min(ticker.deltaMS/1000,.05);this.draw();});
        this.resizeObserver.observe(this.host);this.visibilityObserver.observe(this.host);
        document.addEventListener('visibilitychange',this.syncPlayback);
        this.resize();this.syncPlayback();
    }
    configure(options:LayeredPlayerOptions) {this.options=options;this.draw();if(this.initialized&&!this.disposed)this.app.render();this.syncPlayback();}
    private draw() {
        if(!this.actor||this.disposed)return;
        this.actor.configure(this.options);this.actor.update(this.time);
        this.shadow.visible=this.options.showBody;
        this.aura.draw(this.options.aura,this.time,this.options.showRear,this.options.showGround);
    }
    private resize() {
        if(!this.actor||this.disposed)return;
        const width=this.host.clientWidth,height=this.host.clientHeight;
        if(!width||!height)return;
        this.app.renderer.resize(width,height);
        this.world.position.set(width/2,height*.83);
        this.world.scale.set(Math.min(width/850,height/735));
        this.draw();this.app.render();
    }
    private syncPlayback=()=>{
        if(!this.initialized||this.disposed)return;
        if(this.options.paused||document.hidden||!this.visible)this.app.stop();else this.app.start();
    };
    dispose() {
        if(this.disposed)return;this.disposed=true;
        this.resizeObserver.disconnect();this.visibilityObserver.disconnect();
        document.removeEventListener('visibilitychange',this.syncPlayback);
        this.aura.dispose();
        if(this.initialized)this.app.destroy(true,{children:true});
        if(!this.world.destroyed)this.world.destroy({children:true});
        if(!this.shadow.destroyed)this.shadow.destroy();
    }
}
