import {Application,Assets,Container,Sprite,Texture,Text} from 'pixi.js';
import type {AdventurePartySnapshot,PartyCombatant} from '../../../../types/api/combat';
import {LayeredPlayerActor} from '../playerAppearance/LayeredPlayerActor';
import {identitySheet,outfitArts,independentWeapons} from '../playerAppearance/layeredPlayerArt';
import {getProfessionAura} from '../../art/professionAuras';
import {battleBackgroundArt} from '../../art/battleBackgroundArt';
import type {BattleBackgroundArt, BattleBackgroundId} from '../../art/battleBackgroundArt';
import {loadPixelBattleBackground} from '../loadPixelBattleBackground';
import {ObservationMonsterActor} from './ObservationMonsterActor';
import {PartyEventCursor} from './partyEventCursor';

interface UnitView {actor:LayeredPlayerActor|ObservationMonsterActor;unit:PartyCombatant;x:number;y:number;hit?:number;action?:number;defeat?:number}
/** All poses follow confirmed unit/event IDs; animation never advances the battle. */
export class PartyBattleScene {
    private app=new Application();
    private world=new Container();
    private background=new Sprite();
    private units=new Map<string,UnitView>();
    private sheets=new Map<string,Texture>();
    private backgrounds=new Map<string,Texture>();
    private backgroundLoads=new Map<string,Promise<Texture|undefined>>();
    private backgroundId='';
    private clock=0;
    private initialized=false;
    private disposed=false;
    private version=0;
    private paused=false;
    private eventCursor=new PartyEventCursor();
    private resizeObserver=new ResizeObserver(()=>this.resize());
    private onVisibility=()=>this.sync();
    private reduced=matchMedia('(prefers-reduced-motion: reduce)');
    constructor(private host:HTMLElement,private snapshot:AdventurePartySnapshot) {}
    private backgroundTexture(art:BattleBackgroundArt) {
        const cached=this.backgrounds.get(art.id);
        if(cached)return Promise.resolve(cached);
        const pending=this.backgroundLoads.get(art.id);
        if(pending)return pending;
        const loading=loadPixelBattleBackground(art).then(canvas=>{
            if(this.disposed){canvas.width=0;canvas.height=0;return undefined;}
            const texture=Texture.from(canvas);
            texture.source.scaleMode='nearest';
            this.backgrounds.set(art.id,texture);
            return texture;
        }).finally(()=>{
            if(this.backgroundLoads.get(art.id)===loading)this.backgroundLoads.delete(art.id);
        });
        this.backgroundLoads.set(art.id,loading);
        return loading;
    }
    async init() {
        await this.app.init({width:720,height:423,antialias:false,autoDensity:true,resolution:Math.min(devicePixelRatio||1,2),autoStart:false,preference:'webgl',background:0x304642});
        this.initialized=true;
        if(this.disposed){this.app.destroy(true,{children:true});return;}
        const sources=[...new Set([identitySheet,...outfitArts.map(v=>v.body.url),...independentWeapons.map(v=>v.art.url)])];
        this.sheets=new Map(await Promise.all(sources.map(async src=>{
            const texture=await Assets.load<Texture>(src);texture.source.scaleMode='nearest';return [src,texture] as const;
        })));
        if(this.disposed)return;
        this.world.addChild(this.background);this.app.stage.addChild(this.world);
        this.app.canvas.style.cssText='display:block;width:100%;height:100%;image-rendering:pixelated';
        this.app.canvas.setAttribute('aria-label','按服务器事实展示的队伍冒险场景');
        this.host.appendChild(this.app.canvas);
        this.app.ticker.add(ticker=>{this.clock+=Math.min(ticker.deltaMS/1000,.05);this.draw();});
        document.addEventListener('visibilitychange',this.onVisibility);
        this.resizeObserver.observe(this.host);
        this.resize();await this.update(this.snapshot);this.sync();
    }
    async update(snapshot:AdventurePartySnapshot) {
        this.snapshot=snapshot;
        if(!this.initialized||!this.sheets.size||this.disposed)return;
        const version=++this.version;
        const art=battleBackgroundArt[snapshot.dungeonId as BattleBackgroundId];
        if(art&&this.backgroundId!==art.id){
            const texture=await this.backgroundTexture(art);
            if(this.disposed||version!==this.version)return;
            if(texture){this.background.texture=texture;this.background.width=720;this.background.height=423;this.backgroundId=art.id;}
        }
        const present=new Set([...snapshot.players,...snapshot.enemies].map(v=>v.id));
        for(const [id,view] of this.units)if(!present.has(id)){view.actor.destroy();this.units.delete(id);}
        for(const [side,list] of [[0,snapshot.players],[1,snapshot.enemies]] as const){
            for(let i=0;i<list.length;i++){
                const unit=list[i];let view=this.units.get(unit.id);
                if(!view){
                    let actor:LayeredPlayerActor|ObservationMonsterActor|null;
                    if(side===0){
                        actor=new LayeredPlayerActor(this.sheets);
                        const job=unit.jobId||'job.novice';
                        const weapon=independentWeapons.some(w=>w.id===unit.visual?.weaponId)?unit.visual!.weaponId:'none';
                        actor.configure({outfit:job,weapon,aura:getProfessionAura(job),showBody:true,showOutfit:true,showWeapon:weapon!=='none',showRear:true,showGround:true,backdrop:'plain',paused:false});
                        if(unit.visual?.characterImageUrl)void actor.setFullBodyImage(unit.visual.characterImageUrl);
                        else if(unit.visual?.headImageUrl)void actor.setHeadImage(unit.visual.headImageUrl);
                        actor.setHeadBehindBody(Boolean(unit.visual?.headBehindBody));
                        if(unit.visual?.appearanceOverlays)actor.setAppearanceOverlays(unit.visual.appearanceOverlays);
                        actor.scale.set(.19);
                    }else{
                        const monsterId=unit.templateId||(unit as any).template_id||'';
                        actor=await ObservationMonsterActor.load(monsterId);
                        if(actor)actor.scale.set(.55);
                    }
                    if(this.disposed||version!==this.version){actor?.destroy();return;}
                    if(!actor)continue;
                    view={actor,unit,x:0,y:0};this.units.set(unit.id,view);this.world.addChild(actor);
                    if(unit.hp<=0)view.defeat=this.clock-5;
                }else if(view.unit.hp>0&&unit.hp<=0)view.defeat=this.clock;
                else if(unit.hp>0)view.defeat=undefined;
                if(unit.hp<view.unit.hp)view.hit=this.clock;
                view.unit=unit;
                const column=list.length<=2?0:i%2;
                view.x=side?600-column*115:120+column*115;
                view.y=list.length===1?315:list.length<=2?200+i*160:180+Math.floor(i/2)*180+column*35;
            }
        }
        for(const event of this.eventCursor.take(snapshot.events)){
            for(const action of event.payload?.events||[]){
                const actor=this.units.get(action.actorId||(action as any).actor_id||'');if(actor)actor.action=this.clock;
                const target=this.units.get(action.targetId||(action as any).target_id||'');
                if(target&&(action.damage||action.healing||action.restored)){
                    if(action.damage)target.hit=this.clock;
                    const amount=action.damage?`−${action.damage}`:`+${action.healing||action.restored}`;
                    const text=new Text({text:amount,style:{fontSize:18,fontWeight:'bold',fill:action.damage?0xffffff:0x91ffc0,stroke:{color:0x243b34,width:3}}});
                    text.position.set(target.x-20,target.y-95);this.world.addChild(text);
                    setTimeout(()=>{if(!text.destroyed)text.destroy();},900);
                }
            }
        }
        this.draw();if(this.paused||this.reduced.matches)this.app.render();
    }
    setPaused(value:boolean){this.paused=value;this.sync();}
    private sync(){if(!this.initialized||this.disposed)return;if(this.paused||this.reduced.matches||document.hidden){this.app.stop();this.draw();this.app.render();}else this.app.start();}
    private draw(){
        for(const view of this.units.values()){
            const age=view.action===undefined?10:this.clock-view.action;
            const hit=view.hit===undefined?undefined:this.clock-view.hit;
            const dead=view.defeat===undefined?undefined:this.clock-view.defeat;
            view.actor.position.set(view.x,view.y);
            if(view.actor instanceof LayeredPlayerActor){view.actor.update(this.clock,age<.5?-.025:0,age<.5?3:0);view.actor.alpha=view.unit.hp>0?1:.35;view.actor.tint=hit!==undefined&&hit<.15?0xffaaaa:0xffffff;}
            else view.actor.sample(dead!==undefined?'idle':hit!==undefined&&hit<.3?'hit':age<1?'attack':'idle',age,this.clock,hit,dead);
        }
    }
    private resize(){if(!this.initialized||this.disposed)return;const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight);this.app.renderer.resize(width,height);this.world.scale.set(Math.min(width/720,height/423));}
    dispose(){this.disposed=true;this.version++;this.resizeObserver.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);if(this.initialized)this.app.destroy(true,{children:true});for(const texture of this.backgrounds.values())texture.destroy(true);this.backgrounds.clear();this.backgroundLoads.clear();}
}
