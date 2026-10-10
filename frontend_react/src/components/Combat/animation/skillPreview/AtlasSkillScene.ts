import {Application,Assets,Container,Graphics} from 'pixi.js';
import type {Texture} from 'pixi.js';
import mossCave from '../../../../assets/combat/moss-cave.svg';
import {LayeredPlayerActor} from '../playerAppearance/LayeredPlayerActor';
import {ProfessionAuraRenderer} from '../playerAppearance/ProfessionAuraRenderer';
import {identitySheet,outfitArts,independentWeapons} from '../playerAppearance/layeredPlayerArt';
import {getProfessionAura} from '../../art/professionAuras';
import {SlimeActor} from '../SlimeActor';
import {sampleSlimePose} from '../slimeMotion';
import {createSlimeStage} from '../slimeStage';
import {drawPlayerMagicBolt,samplePlayerSkillFeedback} from '../playerRouteEffects';
import {AtlasSkillRenderer} from './AtlasSkillRenderer';
import {sampleAtlasSkillHit} from './atlasSkillProfiles';
import type {AtlasSkillProfile} from './atlasSkillProfiles';

export interface SkillPlayback {time:number;duration:number;status:'playing'|'paused'|'finished'}
/** Pure visual demo. It does not issue battle commands, apply damage or change learned skills. */
export class AtlasSkillScene {
    private readonly app=new Application();
    private readonly world=new Container();
    private readonly aura=new ProfessionAuraRenderer();
    private readonly effects=new AtlasSkillRenderer();
    private readonly bolt=new Graphics();
    private readonly shade=new Graphics().rect(-320,-311,640,420).fill(0x293745);
    private readonly slime=new SlimeActor();
    private readonly heroShadow=new Graphics().ellipse(0,6,61,12).fill({color:0x426859,alpha:.16});
    private readonly slimeShadow=new Graphics().ellipse(144,6,76,12).fill({color:0x426859,alpha:.16});
    private readonly resizeObserver=new ResizeObserver(()=>this.resize());
    private readonly visibilityObserver=new IntersectionObserver(entries=>{this.visible=entries.some(e=>e.isIntersecting);this.syncPlayback();});
    private readonly reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    private actor?:LayeredPlayerActor;
    private initialized=false;
    private disposed=false;
    private visible=true;
    private time=0;
    private ambient=0;
    private playing=true;
    private paused=this.reducedMotion.matches;
    private lastReport=-1;
    private weapon:string;
    constructor(private readonly host:HTMLElement,private readonly jobId:string,private readonly skill:AtlasSkillProfile,
        private readonly onPlayback:(state:SkillPlayback)=>void) {this.weapon=skill.weapon;}

    async init() {
        await this.app.init({width:Math.max(1,this.host.clientWidth),height:Math.max(1,this.host.clientHeight),
            backgroundAlpha:0,autoStart:false,antialias:false,autoDensity:true,
            resolution:Math.min(devicePixelRatio||1,2),preference:'webgl'});
        this.initialized=true;if(this.disposed){this.app.destroy(true,{children:true});return;}
        const outfit=outfitArts.find(item=>item.id===this.jobId);
        const urls=[...new Set([identitySheet,outfit?.body.url||identitySheet,...independentWeapons.map(item=>item.art.url)])];
        const [sheets,cave]=await Promise.all([
            Promise.all(urls.map(async url=>{const texture=await Assets.load<Texture>(url);texture.source.scaleMode='nearest';return [url,texture] as const;})),
            Assets.load<Texture>({src:mossCave,data:{resolution:2}}),
        ]);
        if(this.disposed)return;
        this.actor=new LayeredPlayerActor(new Map(sheets));this.actor.scale.set(.4);
        this.slime.position.set(144,0);this.slime.scale.set(.74);
        this.shade.alpha=0;
        this.world.addChild(createSlimeStage('cave',cave),this.shade,this.heroShadow,this.slimeShadow,
            this.aura.ground,this.effects.ground,this.aura.rear,this.effects.rear,this.slime,this.actor,this.effects.front,this.bolt);
        this.app.stage.addChild(this.world);
        this.app.canvas.setAttribute('aria-label',`${this.skill.name}技能视觉预览`);
        this.app.canvas.style.cssText='display:block;width:100%;height:100%;image-rendering:pixelated';
        this.host.appendChild(this.app.canvas);
        if(this.paused)this.time=Math.min(this.skill.duration-.1,Number.isFinite(this.skill.impact)?this.skill.impact+.1:this.skill.release+.8);
        this.app.ticker.add(ticker=>{
            const delta=Math.min(ticker.deltaMS/1000,.05);this.ambient+=delta;
            if(this.playing) {
                this.time=Math.min(this.skill.duration,this.time+delta);
                if(this.time>=this.skill.duration){this.playing=false;this.report(true);}
            }
            this.draw();this.report();
            if(!this.playing)this.syncPlayback();
        });
        this.resizeObserver.observe(this.host);this.visibilityObserver.observe(this.host);
        document.addEventListener('visibilitychange',this.syncPlayback);this.reducedMotion.addEventListener('change',this.onMotionChange);
        this.resize();this.report(true);this.syncPlayback();
    }
    replay() {this.time=0;this.playing=true;this.paused=false;this.render();this.report(true);this.syncPlayback();}
    togglePause() {this.paused=!this.paused;this.report(true);this.syncPlayback();}
    seek(time:number) {this.time=Math.max(0,Math.min(this.skill.duration,time));this.playing=this.time<this.skill.duration;this.paused=true;this.render();this.report(true);this.syncPlayback();}
    setWeapon(id:string) {this.weapon=id;this.render();}
    private report(force=false) {
        const frame=Math.floor(this.time*10);if(!force&&this.lastReport===frame)return;this.lastReport=frame;
        this.onPlayback({time:this.time,duration:this.skill.duration,status:!this.playing?'finished':this.paused?'paused':'playing'});
    }
    private draw() {
        if(!this.actor||this.disposed)return;
        const skill=this.skill,hit=this.time-skill.impact;
        const impulse=this.playing&&skill.target==='enemy'?Math.max(0,1-Math.abs(hit-.02)/.48):0;
        const moving=skill.motion==='slash'?impulse*106:skill.motion==='dash'?impulse*220:0;
        const sourceX=-138+moving;
        this.actor.position.set(sourceX,0);
        this.actor.configure({outfit:this.jobId,weapon:this.weapon,aura:getProfessionAura(this.jobId),showBody:true,showOutfit:true,
            showWeapon:this.weapon!=='none',showRear:true,showGround:true,backdrop:'cave',paused:this.paused});
        const lean=this.playing?(this.time<skill.release?-.025:.04)*Math.max(0,1-Math.max(0,this.time-skill.release)/.6):0;
        this.actor.update(this.ambient,lean,impulse*7);
        this.heroShadow.x=sourceX;
        this.aura.rear.position.set(sourceX-336*.4,-680*.4);this.aura.rear.scale.set(8*.4);
        this.aura.ground.position.set(sourceX-336*.4,-96*.4);this.aura.ground.scale.set(8*.4);
        this.aura.draw(getProfessionAura(this.jobId),this.ambient,true,true);
        const hitTime=this.playing?sampleAtlasSkillHit(skill,this.time):undefined;
        this.slime.update(sampleSlimePose(hitTime===undefined?'idle':'hit',hitTime??this.ambient,-1),this.ambient,-1);
        const emission=this.actor.getEmissionPoint(this.world);
        const anchors={sourceX,targetX:144,emitterX:emission.x,emitterY:emission.y,facing:1 as const};
        this.bolt.clear();
        if(this.playing) {
            if(skill.shape==='bolt')drawPlayerMagicBolt(this.bolt,this.time,anchors);
            this.effects.draw(skill,this.time,anchors);
        } else this.effects.clear();
        const feedback=skill.shape==='burst'&&this.playing?samplePlayerSkillFeedback('skill.player.037',this.time):{shade:0,shakeX:0,shakeY:0};
        this.shade.alpha=feedback.shade;
        this.world.pivot.set(-feedback.shakeX,-feedback.shakeY);
    }
    private render(){if(!this.actor||this.disposed)return;this.draw();this.app.render();}
    private resize() {
        if(!this.actor||this.disposed)return;
        const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;
        this.app.renderer.resize(width,height);this.world.position.set(width/2,height*.78);this.world.scale.set(Math.min(width/640,height/420));this.render();
    }
    private syncPlayback=()=>{
        if(!this.initialized||this.disposed)return;
        if(this.paused||document.hidden||!this.visible||!this.playing)this.app.stop();else this.app.start();
    };
    private onMotionChange=()=>{if(this.reducedMotion.matches){this.paused=true;this.report(true);}this.syncPlayback();};
    dispose() {
        if(this.disposed)return;this.disposed=true;
        this.resizeObserver.disconnect();this.visibilityObserver.disconnect();document.removeEventListener('visibilitychange',this.syncPlayback);
        this.reducedMotion.removeEventListener('change',this.onMotionChange);
        this.aura.dispose();this.effects.dispose();
        if(this.initialized)this.app.destroy(true,{children:true});
        for(const item of [this.world,this.slime,this.heroShadow,this.slimeShadow,this.bolt,this.shade])if(!item.destroyed)item.destroy({children:true});
    }
}
