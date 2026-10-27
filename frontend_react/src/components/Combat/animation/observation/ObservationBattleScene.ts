import {caveSkillLabels,caveSkillImpact} from '../cavePixels/caveTypes';
import type {CaveSkill} from '../cavePixels/caveTypes';
import {caveDurations} from '../cavePixels/caveMotion';
import {Application,Assets,Container,Graphics,Sprite,Text,Texture} from 'pixi.js';
import {DEFAULT_APPEARANCE_OVERLAYS,LayeredPlayerActor} from '../playerAppearance/LayeredPlayerActor';
import {identitySheet,outfitArts,independentWeapons} from '../playerAppearance/layeredPlayerArt';
import {ProfessionAuraRenderer} from '../playerAppearance/ProfessionAuraRenderer';
import {getProfessionAura} from '../../art/professionAuras';
import {battleBackgroundArt} from '../../art/battleBackgroundArt';
import type {BattleBackgroundId} from '../../art/battleBackgroundArt';
import {loadPixelBattleBackground} from '../loadPixelBattleBackground';
import {AtlasSkillRenderer} from '../skillPreview/AtlasSkillRenderer';
import type {AtlasSkillProfile} from '../skillPreview/atlasSkillProfiles';
import {drawPlayerMagicBolt} from '../playerRouteEffects';
import {ObservationMonsterActor} from './ObservationMonsterActor';
import {drawMeadowAttack} from '../meadowPixels/meadowAttack';
import {drawElementSkill} from '../elementPixels/elementSkillVisuals';
import type {ElementSkillVisual} from '../elementPixels/elementSkillVisuals';
import {elementEquipmentArt} from '../../art/elementEquipmentArt';
import {chooseObservationAttack,clampObservation as clamp,observationRecoil,observationSwing} from './observationPresentation';
import type {ObservationVisual} from './observationPresentation';

interface VisualTurn {caveSkill?:CaveSkill;elementSkill?:ElementSkillVisual;side:'player'|'enemy';skill?:AtlasSkillProfile;start:number;duration:number;impact:number;damage:number;ranged:boolean;hit:boolean}
interface FloatingValue {start:number;text:string;target:'player'|'enemy';color:number}

/** Local alternating choreography. Only snapshot transitions can confirm defeat. */
export class ObservationBattleScene {
    private readonly app=new Application();
    private readonly world=new Container();
    private readonly backdrop=new Sprite();
    private readonly effects=new AtlasSkillRenderer();
    private readonly aura=new ProfessionAuraRenderer();
    private readonly bolt=new Graphics();
    private readonly enemyEffect=new Graphics();
    private readonly heroShadow=new Graphics().ellipse(0,5,52,9).fill({color:0x193f43,alpha:.2});
    private readonly enemyShadow=new Graphics().ellipse(0,5,68,10).fill({color:0x193f43,alpha:.2});
    private readonly damage=new Text({text:'',style:{fontFamily:'monospace',fontSize:24,fontWeight:'bold',fill:0xffffff,stroke:{color:0x293741,width:4}}});
    private readonly backgrounds=new Map<string,Texture>();
    private readonly resizeObserver=new ResizeObserver(()=>this.resize());
    private readonly visibilityObserver=new IntersectionObserver(entries=>{this.visible=entries.some(entry=>entry.isIntersecting);this.sync();});
    private readonly motion=matchMedia('(prefers-reduced-motion: reduce)');
    private hero?:LayeredPlayerActor;
    private monster?:ObservationMonsterActor;
    private monsterKey='';
    private pendingKey='';
    private loadVersion=0;
    private initialized=false;
    private disposed=false;
    private visible=true;
    private paused=this.motion.matches;
    private ambient=0;
    private nextTurnAt=.7;
    private nextSide:'player'|'enemy'='player';
    private turn?:VisualTurn;
    private floating?:FloatingValue;
    private heroHit?:number;
    private enemyHit?:number;
    private defeatStarted?:number;
    private sourceX=-180;
    private targetX=172;
    private phase='';
    private previousHeadUrl?:string;
    private previousCharacterUrl?:string;
    private previousOverlayKey='';
    constructor(private readonly host:HTMLElement,private visual:ObservationVisual,
        private readonly onPhase:(phase:string)=>void,private readonly onError:(message:string)=>void) {}

    async init() {
        await this.app.init({width:Math.max(1,this.host.clientWidth),height:Math.max(1,this.host.clientHeight),background:0xe8efed,
            autoStart:false,antialias:false,autoDensity:true,resolution:Math.min(devicePixelRatio||1,2),preference:'webgl'});
        this.initialized=true;if(this.disposed){this.app.destroy(true,{children:true});return;}
        const urls=[...new Set([identitySheet,...outfitArts.map(item=>item.body.url),...independentWeapons.map(item=>item.art.url)])];
        const registeredBackgrounds=Object.values(battleBackgroundArt);
        const [sheets,backgrounds]=await Promise.all([
            Promise.all(urls.map(async src=>{const texture=await Assets.load<Texture>(src);texture.source.scaleMode='nearest';return [src,texture] as const;})),
            Promise.all(registeredBackgrounds.map(async art=>[art.id,await loadPixelBattleBackground(art)] as const)),
        ]);
        if(this.disposed)return;
        this.hero=new LayeredPlayerActor(new Map(sheets));this.hero.scale.set(.36);
        for(const [id,canvas] of backgrounds){const texture=Texture.from(canvas);texture.source.scaleMode='nearest';this.backgrounds.set(id,texture);}
        this.damage.anchor.set(.5);this.damage.visible=false;
        this.world.addChild(this.backdrop,this.heroShadow,this.enemyShadow,this.aura.ground,this.effects.ground,
            this.aura.rear,this.effects.rear,this.hero,this.effects.front,this.bolt,this.enemyEffect,this.damage);
        this.app.stage.addChild(this.world);this.configureHero();
        this.app.canvas.style.cssText='display:block;width:100%;height:100%;image-rendering:pixelated';
        this.app.canvas.setAttribute('aria-label','探索场景：左侧居民与右侧当前魔物的交替攻击演示');
        this.host.appendChild(this.app.canvas);
        this.app.ticker.add(ticker=>{
            this.ambient+=Math.min(ticker.deltaMS/1000,.05);
            this.advance();this.draw();
        });
        this.resizeObserver.observe(this.host);this.visibilityObserver.observe(this.host);
        document.addEventListener('visibilitychange',this.sync);this.motion.addEventListener('change',this.onMotion);
        this.resize();this.sync();await this.replaceMonster();
    }
    update(visual:ObservationVisual) {
        const previous=this.visual;this.visual=visual;
        if(!this.hero||this.disposed)return;
        this.configureHero();
        if(visual.jobId!==previous.jobId||visual.weaponId!==previous.weaponId){
            this.turn=undefined;this.floating=undefined;this.heroHit=this.enemyHit=undefined;
            this.nextSide='player';this.nextTurnAt=this.ambient+.7;
        }
        if(!visual.fighting){this.turn=undefined;this.floating=undefined;}
        const confirmed=this.monster&&visual.kills>previous.kills;
        if(confirmed&&this.defeatStarted===undefined){
            this.turn=undefined;this.pendingKey='';this.loadVersion++;
            if(this.motion.matches){this.monster?.destroy();this.monster=undefined;this.monsterKey='';}
            else this.defeatStarted=this.ambient;
        }
        if(this.defeatStarted===undefined)void this.replaceMonster();
        this.resize();this.sync();
    }
    setPaused(paused:boolean){this.paused=paused;this.draw();if(this.initialized&&!this.disposed)this.app.render();this.sync();}
    private configureHero() {
        const baseWeapon=elementEquipmentArt(this.visual.weaponId).baseId;
        const weapon=independentWeapons.some(item=>item.id===baseWeapon)?baseWeapon:'none';
        this.hero!.configure({outfit:this.visual.jobId,weapon,aura:getProfessionAura(this.visual.jobId),showBody:true,
            showOutfit:true,showWeapon:weapon!=='none',showRear:true,showGround:true,backdrop:'plain',paused:this.paused});
        if(this.visual.headImageUrl!==this.previousHeadUrl){
            this.previousHeadUrl=this.visual.headImageUrl;
            void this.hero!.setHeadImage(this.visual.headImageUrl);
        }
        if(this.visual.characterImageUrl!==this.previousCharacterUrl){
            this.previousCharacterUrl=this.visual.characterImageUrl;
            void this.hero!.setFullBodyImage(this.visual.characterImageUrl);
        }
        const overlays=this.visual.appearanceOverlays||DEFAULT_APPEARANCE_OVERLAYS;
        const overlayKey=JSON.stringify(overlays);
        if(overlayKey!==this.previousOverlayKey){this.previousOverlayKey=overlayKey;this.hero!.setAppearanceOverlays(overlays);}
        this.hero!.setHeadBehindBody(Boolean(this.visual.headBehindBody));
        this.hero!.visible=this.visual.hasPlayer;
    }
    private async replaceMonster() {
        const key=this.visual.hasEnemy&&this.visual.monsterId?`${this.visual.encounterId}:${this.visual.monsterId}`:'';
        if(key===this.monsterKey||(key&&key===this.pendingKey))return;
        const version=++this.loadVersion;this.pendingKey=key;this.monsterKey='';this.turn=undefined;this.enemyHit=undefined;
        this.monster?.destroy();this.monster=undefined;this.nextSide='player';this.nextTurnAt=this.ambient+.7;
        if(!key){this.pendingKey='';this.draw();return;}
        try {
            const actor=await ObservationMonsterActor.load(this.visual.monsterId);
            if(this.disposed||version!==this.loadVersion){actor?.destroy();return;}
            this.pendingKey='';this.monsterKey=key;this.monster=actor??undefined;
            this.onError('');
            if(actor)this.world.addChildAt(actor,this.world.getChildIndex(this.effects.front));
            this.draw();this.app.render();
        } catch(error) {
            if(this.disposed||version!==this.loadVersion)return;
            this.pendingKey='';this.onError(error instanceof Error?error.message:'魔物形象加载失败');
        }
    }
    private advance() {
        if(this.defeatStarted!==undefined){
            const nextKey=this.visual.hasEnemy&&this.visual.monsterId?`${this.visual.encounterId}:${this.visual.monsterId}`:'';
            const canReplace=!this.monster?.keepsDebris||(nextKey&&nextKey!==this.monsterKey);
            if(this.ambient-this.defeatStarted>(this.monster?.defeatDuration??1.4)&&canReplace){
                this.defeatStarted=undefined;this.monster?.destroy();this.monster=undefined;this.monsterKey='';void this.replaceMonster();
            }
            return;
        }
        if(!this.visual.fighting||!this.monster)return;
        if(!this.turn&&this.ambient>=this.nextTurnAt){
            const skill=this.nextSide==='player'?chooseObservationAttack(this.visual):undefined;
            const choices=this.monster.caveProfile?.skills;
            const caveSkill=this.nextSide==='enemy'&&choices?.length&&Math.random()<.55?choices[Math.floor(Math.random()*choices.length)]:undefined;
            const elementSkills=this.monster.elementSkills;
            const elementSkill=this.nextSide==='enemy'&&elementSkills.length>0&&Math.random()<.55?elementSkills[Math.floor(Math.random()*elementSkills.length)]:undefined;
            this.turn={side:this.nextSide,skill,caveSkill,elementSkill,start:this.ambient,duration:caveSkill?caveDurations[caveSkill]:skill?.duration??1.7,impact:caveSkill?caveSkillImpact[caveSkill]:skill?.impact??(this.monster.pixelProfile?.ranged ? .9 : .65),
                damage:6+Math.floor(Math.random()*13),ranged:!skill&&this.monster.ranged,hit:false};
            this.nextSide=this.nextSide==='player'?'enemy':'player';
        }
        const turn=this.turn;if(!turn)return;
        const age=this.ambient-turn.start;
        if(!turn.hit&&age>=turn.impact){
            turn.hit=true;
            const defensive=turn.caveSkill==='guard'||turn.caveSkill==='evasion'||turn.elementSkill?.defensive;
            const target=turn.side==='player'?'enemy':'player';
            if(!defensive){if(target==='enemy')this.enemyHit=this.ambient;else this.heroHit=this.ambient;}
            this.floating=defensive?{start:this.ambient,target:'enemy',text:turn.elementSkill?.name??caveSkillLabels[turn.caveSkill!],color:0xcbe8b1}:{start:this.ambient,target,text:`−${turn.damage}`,color:target==='enemy'?0xfff3c9:0xffd2cc};
        }
        if(age>=turn.duration){this.turn=undefined;this.nextTurnAt=this.ambient+.55;}
    }
    private draw() {
        if(!this.hero||this.disposed)return;
        const turn=this.turn,age=turn?this.ambient-turn.start:0,skill=turn?.skill;
        const heroHit=this.heroHit===undefined?undefined:this.ambient-this.heroHit;
        const enemyHit=this.enemyHit===undefined?undefined:this.ambient-this.enemyHit;
        const defeatAge=this.defeatStarted===undefined?undefined:this.ambient-this.defeatStarted;
        const heroLunge=skill&&(skill.motion==='slash'||skill.motion==='dash')
            ?Math.sin(Math.PI*clamp((age-skill.release+.2)/.95))*Math.min(205,(this.targetX-this.sourceX)-125):0;
        const enemyLunge=turn?.side==='enemy'&&!turn.ranged&&!turn.caveSkill&&!turn.elementSkill?Math.sin(Math.PI*clamp((age-.18)/1.15))*Math.min(220,(this.targetX-this.sourceX)-115):0;
        const hx=this.sourceX+heroLunge-observationRecoil(heroHit),ex=this.targetX-enemyLunge+observationRecoil(enemyHit);
        this.hero.position.set(hx,0);this.hero.update(this.ambient,skill?-.025:0,heroLunge?5:0);
        this.hero.setWeaponSwing(skill?observationSwing(skill,age):0);
        this.hero.tint=heroHit!==undefined&&heroHit<.13?0xffa597:0xffffff;
        this.hero.alpha=this.visual.playerAlive?1:.6;this.heroShadow.x=hx;this.enemyShadow.x=ex;
        this.enemyShadow.visible=Boolean(this.monster)&&!(this.monster?.keepsDebris&&defeatAge!==undefined&&defeatAge>=.26);
        this.enemyShadow.alpha=defeatAge===undefined?1:1-clamp(defeatAge/1.1);
        this.aura.rear.position.set(hx-336*.36,-680*.36);this.aura.rear.scale.set(8*.36);
        this.aura.ground.position.set(hx-336*.36,-96*.36);this.aura.ground.scale.set(8*.36);
        this.aura.draw(getProfessionAura(this.visual.jobId),this.ambient,this.visual.hasPlayer,this.visual.hasPlayer);
        const motion=enemyHit!==undefined&&enemyHit<(this.monster?.keepsDebris ? .85 : .45)?'hit':turn?.side==='enemy'?'attack':'idle';
        const motionTime=motion==='hit'?enemyHit!:motion==='attack'?age:this.ambient;
        if(this.monster){this.monster.position.set(ex,0);this.monster.sample(motion,motionTime,this.ambient,enemyHit,defeatAge,turn?.caveSkill);}
        const shake=this.monster?.shake??0;
        this.world.pivot.set(Math.round(Math.sin(this.ambient*113)*shake*.225),Math.round(Math.cos(this.ambient*97)*shake*.225));
        this.bolt.clear();this.enemyEffect.clear();
        if(skill&&this.monster&&defeatAge===undefined){
            const emitter=this.hero.getEmissionPoint(this.world);
            const anchors={sourceX:hx,targetX:ex,emitterX:emitter.x,emitterY:emitter.y,facing:1 as const};
            if(skill.shape==='bolt')drawPlayerMagicBolt(this.bolt,age,anchors);
            this.effects.draw(skill,age,anchors);
        } else this.effects.clear();
        if(turn?.side==='enemy'&&this.monster&&defeatAge===undefined&&!turn.caveSkill){
            if(turn.elementSkill)drawElementSkill(this.enemyEffect,turn.elementSkill,age,ex,hx);
            else if(this.monster.pixelProfile)drawMeadowAttack(this.enemyEffect,this.monster.pixelProfile,age,ex,hx);
            else this.drawEnemyAttack(age,turn.ranged,ex,hx);
        }
        const floatAge=this.floating?this.ambient-this.floating.start:Infinity;
        this.damage.visible=floatAge<.9;
        if(this.floating&&floatAge<.9){this.damage.text=this.floating.text;this.damage.tint=this.floating.color;
            this.damage.position.set(this.floating.target==='player'?hx:ex,-155-floatAge*40);this.damage.alpha=1-clamp((floatAge-.4)/.5);}
        const phase=defeatAge!==undefined?(this.monster?.keepsDebris?'击败 · 像素粉碎':'击败 · 碎片消散'):!this.visual.hasPlayer?'准备出发':!this.visual.hasEnemy?(this.visual.searching?'寻找下一只魔物':'休整')
            :!this.monster?(this.pendingKey?'加载魔物形象':'形象尚未登记'):!this.visual.fighting?'休整':turn?.side==='enemy'?(turn.elementSkill?.name??(turn.caveSkill?caveSkillLabels[turn.caveSkill]:'魔物攻击')):skill?.name??'待机';
        if(phase!==this.phase){this.phase=phase;this.onPhase(phase);}
    }
    private drawEnemyAttack(age:number,ranged:boolean,enemyX:number,heroX:number) {
        const g=this.enemyEffect;
        if(ranged&&age>=.25&&age<.65){
            const p=clamp((age-.25)/.4),x=enemyX+(heroX-enemyX)*p,y=-105;
            g.rect(x-10,y-5,20,10).rect(x-5,y-10,10,20).fill(0x997dc6);
            g.rect(x-4,y-4,8,8).fill(0xf0e8ff);
            for(let i=1;i<4;i++)g.rect(x+16*i,y-3,8,6).fill({color:0xb2a0d9,alpha:1-i*.22});
        }
        const hit=age-.65;
        if(hit>=0&&hit<.28){const alpha=1-hit/.28;
            for(const side of [-1,1])g.moveTo(heroX+side*25,-108).lineTo(heroX,-85).lineTo(heroX+side*27,-67).stroke({color:0xffe8c6,width:4,alpha});
        }
    }
    private resize() {
        if(!this.hero||this.disposed)return;
        const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;
        this.app.renderer.resize(width,height);const scale=Math.min(width/720,height/423);
        const viewWidth=width/scale,viewHeight=height/scale;
        this.sourceX=-viewWidth*.245;this.targetX=viewWidth*.235;
        this.world.scale.set(scale);this.world.position.set(width/2,height*.79);
        const art=battleBackgroundArt[this.visual.dungeonId as BattleBackgroundId];
        this.backdrop.visible=Boolean(art);
        if(art){this.backdrop.texture=this.backgrounds.get(art.id)!;this.backdrop.position.set(-viewWidth/2,-viewHeight*.79);
            this.backdrop.width=viewWidth;this.backdrop.height=viewHeight*.79/art.feetRatio;}
        this.draw();this.app.render();
    }
    private sync=()=>{if(!this.initialized||this.disposed)return;if(this.paused||document.hidden||!this.visible)this.app.stop();else this.app.start();};
    private onMotion=()=>{if(this.motion.matches)this.paused=true;this.sync();};
    dispose() {
        if(this.disposed)return;this.disposed=true;this.loadVersion++;
        this.resizeObserver.disconnect();this.visibilityObserver.disconnect();document.removeEventListener('visibilitychange',this.sync);this.motion.removeEventListener('change',this.onMotion);
        this.aura.dispose();this.effects.dispose();if(this.initialized)this.app.destroy(true,{children:true});
        if(!this.world.destroyed)this.world.destroy({children:true});
        for(const item of [this.backdrop,this.bolt,this.enemyEffect,this.heroShadow,this.enemyShadow,this.damage])if(!item.destroyed)item.destroy();
        for(const texture of this.backgrounds.values())texture.destroy(true);this.backgrounds.clear();
    }
}
