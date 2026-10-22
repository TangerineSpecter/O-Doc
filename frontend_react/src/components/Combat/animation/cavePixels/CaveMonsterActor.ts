import {Container, Sprite, Texture} from 'pixi.js';
import {createCaveSpriteRenderer} from './caveSprites';
import {createKingDetailRenderer} from './kingDetail';
import {sampleCavePose,caveDurations} from './caveMotion';
import {drawCaveSkills} from './caveSkills';
import {caveSize} from './caveTypes';
import type {CaveMotion,CavePose,CaveProfile} from './caveTypes';
import {MeadowShatter} from '../meadowPixels/MeadowShatter';
import {meadowShatterAt} from '../meadowPixels/meadowMotion';

/** Approved cave artwork in logical 128px coordinates, with a 256px boss texture. */
export class CaveMonsterActor extends Container {
    private readonly pixels=createCaveSpriteRenderer();
    private readonly detail:ReturnType<typeof createKingDetailRenderer>|undefined;
    private readonly canvas:HTMLCanvasElement;
    private readonly context:CanvasRenderingContext2D;
    private readonly texture:Texture;
    private readonly body:Sprite;
    private readonly shatter=new MeadowShatter();
    private shattered=false;
    private previousDefeat?:number;
    private defeatAmbient=0;
    private readonly resolution:number;

    constructor(readonly profile:CaveProfile) {
        super();
        this.resolution=profile.key==='king'?2:1;
        if(profile.key==='king')this.detail=createKingDetailRenderer();
        // Include skill geometry on both sides; the pivot remains at the planted feet.
        this.canvas=Object.assign(document.createElement('canvas'),{width:384*this.resolution,height:224*this.resolution});
        this.context=this.canvas.getContext('2d')!;
        this.texture=Texture.from(this.canvas);this.texture.source.scaleMode='nearest';
        this.body=new Sprite(this.texture);this.body.anchor.set(.5,180/224);this.body.scale.set(1/this.resolution);
        this.scale.set(185/116*caveSize(profile.key));
        this.addChild(this.body,this.shatter);this.sample('idle',0,0,undefined);
    }
    sample(action:CaveMotion,elapsed:number,ambient:number,defeatAge:number|undefined) {
        if(defeatAge===undefined||(this.previousDefeat!==undefined&&defeatAge<this.previousDefeat)) {
            if(this.shattered)this.shatter.reset();this.shattered=false;
        }
        if(defeatAge!==undefined&&(this.previousDefeat===undefined||defeatAge<this.previousDefeat))this.defeatAmbient=ambient-defeatAge;
        this.previousDefeat=defeatAge;
        const state=defeatAge!==undefined?'defeat':elapsed>=caveDurations[action]?'idle':action;
        const pose=sampleCavePose(this.profile.key,state,defeatAge??elapsed,ambient,-1);
        // Scene owns approach and recoil; skill motion remains local to the creature.
        if(state==='attack'||state==='move'||state==='hit')pose.x=0;
        if(defeatAge!==undefined&&defeatAge>=meadowShatterAt) {
            this.body.visible=false;
            if(!this.shattered) {
                const clean={...pose,flash:false,fracture:0};
                const time=this.defeatAmbient+meadowShatterAt;
                const image=this.detail?.sample128(clean,time)??this.pixels.drawSprite(this.profile.key,clean,time);
                this.shatter.start(image.getContext('2d')!.getImageData(0,0,128,128),pose.y,this.profile.colors);this.shattered=true;
            }
            this.shatter.sample(defeatAge-meadowShatterAt);return;
        }
        this.body.visible=true;
        const ctx=this.context;
        ctx.setTransform(this.resolution,0,0,this.resolution,0,0);ctx.clearRect(0,0,384,224);
        ctx.save();ctx.translate(192,180);
        drawCaveSkills(ctx,this.profile.key,pose,false);
        if(state==='evasion')for(let n=3;n>0;n--)this.drawBody({...pose,fade:1-.08*(4-n),x:pose.x+n*9*pose.facing},ambient-n*.045);
        this.drawBody(pose,ambient);drawCaveSkills(ctx,this.profile.key,pose,true);
        ctx.restore();this.texture.source.update();
    }
    private drawBody(pose:CavePose,time:number) {
        const image=this.detail?.sprite(pose,time)??this.pixels.drawSprite(this.profile.key,pose,time);
        const rows=image.height,ctx=this.context,w=128*pose.sx,h=128*pose.sy;
        const snap=(v:number)=>Math.round(v*this.resolution)/this.resolution;
        ctx.save();ctx.globalAlpha=1-pose.fade;ctx.imageSmoothingEnabled=false;
        for(let row=0;row<rows;row++) {
            const y=snap(pose.y-(118-row*128/rows)*h/128);
            const bottom=snap(pose.y-(118-(row+1)*128/rows)*h/128);
            if(bottom<=y)continue;
            const tilt=snap((118-row*128/rows)/128*pose.tilt);
            ctx.drawImage(image,0,row,image.width,1,snap(pose.x-w/2+tilt),y,w,bottom-y);
        }
        ctx.restore();
    }
    get shake(){return this.shattered?this.shatter.shake:0;}
    override destroy(){if(this.destroyed)return;super.destroy({children:true});this.texture.destroy(true);}
}
