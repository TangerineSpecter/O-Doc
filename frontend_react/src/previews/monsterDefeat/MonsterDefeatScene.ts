import {Application,Assets,Container,Graphics,Sprite,Text,Texture} from 'pixi.js';
import {LayeredPlayerActor} from '../../components/Combat/animation/playerAppearance/LayeredPlayerActor';
import {identitySheet,outfitArts,independentWeapons} from '../../components/Combat/animation/playerAppearance/layeredPlayerArt';
import {drawPlayerMagicBolt} from '../../components/Combat/animation/playerRouteEffects';
import {PixelDefeatEffect,loadDefeatArtwork} from '../../components/Combat/animation/pixelDefeat/PixelDefeatEffect';
import {defeatClamp as clamp} from '../../components/Combat/animation/pixelDefeat/pixelDefeatMotion';
import {createDefeatPreviewBackdrop} from './defeatPreviewArt';
import type {DefeatPreviewMonster} from './defeatPreviewArt';
import {battleBackgroundArt} from '../../components/Combat/art/battleBackgroundArt';
import type {BattleBackdrop,BattleBackgroundId} from '../../components/Combat/art/battleBackgroundArt';
import {loadPixelBattleBackground} from '../../components/Combat/animation/loadPixelBattleBackground';

export interface DefeatPlayback {time:number;duration:number;paused:boolean;phase:string;finished:boolean}
const impact=2.05,burst=impact+.13;
/** Isolated local defeat demonstration; never reads or writes exploration data. */
export class MonsterDefeatScene {
    private readonly app=new Application();
    private readonly world=new Container();
    private readonly bolt=new Graphics();
    private readonly shadow=new Graphics().ellipse(0,5,72,11).fill({color:0x355e58,alpha:.17});
    private readonly heroShadow=new Graphics().ellipse(-185,5,56,10).fill({color:0x355e58,alpha:.17});
    private readonly still=new Sprite();
    private readonly damage=new Text({text:'128',style:{fontFamily:'monospace',fontWeight:'bold',fontSize:26,fill:0xffffff,stroke:{color:0x405968,width:5}}});
    private readonly resizeObserver=new ResizeObserver(()=>this.resize());
    private readonly motion=matchMedia('(prefers-reduced-motion: reduce)');
    private hero?:LayeredPlayerActor;
    private fragments?:PixelDefeatEffect;
    private backgroundTexture?:Texture;
    private readonly mapTextures=new Map<BattleBackgroundId,Texture>();
    private background?:Sprite;
    private backdrop:BattleBackdrop='dungeon.moss_cave';
    private artTexture?:Texture;
    private initialized=false;
    private disposed=false;
    private time=0;
    private ambient=0;
    private paused=this.motion.matches;
    private looping=false;
    private rate=1;
    private lastReport=-1;
    readonly duration:number;
    constructor(private readonly host:HTMLElement,private readonly monster:DefeatPreviewMonster,private readonly onPlayback:(state:DefeatPlayback)=>void) {
        this.duration=monster.boss?3.8:3.5;
    }
    async init() {
        await this.app.init({width:Math.max(1,this.host.clientWidth),height:Math.max(1,this.host.clientHeight),backgroundAlpha:0,
            autoStart:false,antialias:false,autoDensity:true,resolution:Math.min(devicePixelRatio||1,2),preference:'webgl'});
        this.initialized=true;if(this.disposed){this.app.destroy(true,{children:true});return;}
        const outfit=outfitArts.find(item=>item.id==='job.mage')!,weapon=independentWeapons.find(item=>item.id==='equip.staff')!;
        const urls=[...new Set([identitySheet,outfit.body.url,weapon.art.url])];
        const [sheets,art,backgrounds]=await Promise.all([
            Promise.all(urls.map(async src=>{const texture=await Assets.load<Texture>(src);texture.source.scaleMode='nearest';return [src,texture] as const;})),
            loadDefeatArtwork(this.monster.src),
            Promise.all(Object.values(battleBackgroundArt).map(async item=>[item.id,await loadPixelBattleBackground(item)] as const)),
        ]);
        if(this.disposed)return;
        this.hero=new LayeredPlayerActor(new Map(sheets));this.hero.position.set(-185,0);this.hero.scale.set(.41);
        this.hero.configure({outfit:'job.mage',weapon:'equip.staff',aura:'none',showBody:true,showOutfit:true,showWeapon:true,
            showRear:false,showGround:false,backdrop:'plain',paused:false});
        this.backgroundTexture=Texture.from(createDefeatPreviewBackdrop());this.backgroundTexture.source.scaleMode='nearest';
        for(const [id,canvas] of backgrounds){const texture=Texture.from(canvas);texture.source.scaleMode='nearest';this.mapTextures.set(id,texture);}
        const background=new Sprite(this.backgroundTexture);
        this.background=background;background.position.set(-360,-334);this.setBackdrop(this.backdrop);
        this.artTexture=Texture.from(art.still);this.artTexture.source.scaleMode='nearest';this.still.texture=this.artTexture;
        this.still.anchor.set(.5,1);this.still.position.set(150,0);
        const size=this.monster.boss?250:205;
        // Right-side opponents face the player on the left. Front-facing art
        // keeps its lighting; the same mirror is applied to the fragment atlas.
        const facing=this.monster.sourceFacing===1?-1:1;
        const scale=size/Math.max(art.still.width,art.still.height);this.still.scale.set(scale*facing,scale);
        this.fragments=new PixelDefeatEffect(art.fragments,this.monster.boss,art.still.width*scale);this.fragments.position.set(150,0);
        this.fragments.scale.x=facing;
        this.shadow.position.set(150,0);this.shadow.scale.x=Math.min(1.5,art.still.width*scale/150);
        this.damage.anchor.set(.5);this.damage.position.set(150,-140);
        this.world.addChild(background,this.heroShadow,this.shadow,this.hero,this.still,this.fragments,this.bolt,this.damage);
        this.app.stage.addChild(this.world);
        this.app.canvas.style.cssText='display:block;width:100%;height:100%;image-rendering:pixelated';
        this.app.canvas.setAttribute('aria-label',`${this.monster.name}受击后像素碎片消散演示，伤害数字为演示值`);
        this.host.appendChild(this.app.canvas);
        this.app.ticker.add(ticker=>{
            const delta=Math.min(ticker.deltaMS/1000,.05)*this.rate;this.ambient+=delta;
            this.time=Math.min(this.duration+1,this.time+delta);
            if(this.looping&&this.time>=this.duration+.8)this.time=0;
            this.draw();this.report();
        });
        this.resizeObserver.observe(this.host);document.addEventListener('visibilitychange',this.sync);
        this.motion.addEventListener('change',this.motionChange);this.resize();this.report(true);this.sync();
    }
    replay(){this.time=0;this.paused=false;this.render();this.report(true);this.sync();}
    togglePause(){this.paused=!this.paused;this.report(true);this.sync();}
    seek(time:number){this.time=Math.max(0,Math.min(this.duration,time));this.paused=true;this.render();this.report(true);this.sync();}
    setLoop(loop:boolean){this.looping=loop;if(loop&&this.time>=this.duration)this.replay();}
    setRate(rate:number){this.rate=rate;}
    setBackdrop(backdrop:BattleBackdrop) {
        this.backdrop=backdrop;
        const texture=backdrop==='plain'?this.backgroundTexture:this.mapTextures.get(backdrop);
        if(this.background&&texture){
            this.background.texture=texture;this.background.width=720;
            this.background.height=backdrop==='plain'?423:334/battleBackgroundArt[backdrop].feetRatio;
            this.render();
        }
    }
    private draw() {
        if(!this.hero||!this.fragments)return;
        const hit=this.time-impact,dead=this.time>=burst,fade=clamp((this.time-burst)/(this.monster.boss?1.2:.98));
        this.hero.update(this.ambient,this.time>1.1&&this.time<2.3?-.015:0);
        this.still.visible=!dead;this.still.tint=hit>=0&&hit<.07?0xffbbb1:0xffffff;
        this.still.x=150+(hit>=0?Math.sin(hit*65)*3+hit*15:Math.sin(this.ambient*1.3)*1.5);
        this.still.y=hit>=0?0:Math.round(Math.sin(this.ambient*2)*1.5);
        this.fragments.sample(dead?this.time-burst:-1);
        this.shadow.alpha=1-fade;this.heroShadow.alpha=1;
        this.damage.visible=hit>=0&&hit<.8;this.damage.alpha=1-clamp((hit-.35)/.45);
        this.damage.y=-145-Math.max(0,hit)*58;
        this.bolt.clear();
        if(this.time>=1.1&&this.time<2.7) {
            const emission=this.hero.getEmissionPoint(this.world);
            drawPlayerMagicBolt(this.bolt,this.time-1.1,{sourceX:-185,targetX:150,emitterX:emission.x,emitterY:emission.y,facing:1});
        }
    }
    private report(force=false) {
        const frame=Math.floor(this.time*20);if(!force&&frame===this.lastReport)return;this.lastReport=frame;
        const phase=this.time<1.1?'待机':this.time<impact?'魔力弹':this.time<burst?'受击':this.time<this.duration-.2?'碎片消散':'击败完成';
        this.onPlayback({time:Math.min(this.duration,this.time),duration:this.duration,paused:this.paused,phase,finished:this.time>=this.duration});
    }
    private render(){if(!this.initialized||this.disposed)return;this.draw();this.app.render();}
    private resize(){if(!this.hero||this.disposed)return;const {clientWidth:width,clientHeight:height}=this.host;if(!width||!height)return;
        this.app.renderer.resize(width,height);this.world.scale.set(Math.min(width/720,height/423));this.world.position.set(width/2,height*.79);this.render();}
    private sync=()=>{if(!this.initialized||this.disposed)return;if(this.paused||document.hidden)this.app.stop();else this.app.start();};
    private motionChange=()=>{if(this.motion.matches){this.paused=true;this.report(true);}this.sync();};
    dispose(){if(this.disposed)return;this.disposed=true;this.resizeObserver.disconnect();document.removeEventListener('visibilitychange',this.sync);
        this.motion.removeEventListener('change',this.motionChange);
        if(this.initialized)this.app.destroy(true,{children:true});
        if(!this.world.destroyed)this.world.destroy({children:true});
        for(const item of [this.bolt,this.shadow,this.heroShadow,this.still,this.damage])if(!item.destroyed)item.destroy();
        this.artTexture?.destroy(true);this.backgroundTexture?.destroy(true);
        for(const texture of this.mapTextures.values())texture.destroy(true);this.mapTextures.clear();}
}
