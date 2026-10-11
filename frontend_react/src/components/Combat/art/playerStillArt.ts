import {identityParts,identitySheet,outfitArts} from '../animation/playerAppearance/layeredPlayerArt';
import {drawPlayerBase} from '../animation/playerAppearance/playerBaseDrawing';
import type {PlayerRectPainter} from '../animation/playerAppearance/playerBaseDrawing';
import {drawPlayerHands} from '../animation/playerAppearance/playerHandDrawing';
import {getPlayerHandAnchors} from '../animation/playerAppearance/playerHandRegistration';
import {drawProfessionAura} from '../animation/playerAppearance/professionAuraDrawing';
import {getProfessionAura} from './professionAuras';

export const playerStillFrame={width:672,height:760,feetX:336,feetY:684};
const images=new Map<string,Promise<HTMLImageElement>>();
const portraits=new Map<string,Promise<string>>();
function imageFor(url:string) {
    let promise=images.get(url);
    if(!promise) {
        promise=new Promise<HTMLImageElement>((resolve,reject)=>{
            const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('角色素材加载失败'));image.src=url;
        });
        images.set(url,promise);void promise.catch(()=>images.delete(url));
    }
    return promise;
}

class CanvasRects implements PlayerRectPainter {
    private pending:number[][]=[];
    constructor(private readonly context:CanvasRenderingContext2D) {}
    clear() {this.pending=[];return this;}
    rect(x:number,y:number,width:number,height:number) {this.pending.push([x,y,width,height]);return this;}
    fill(color:number) {
        this.context.fillStyle=`#${color.toString(16).padStart(6,'0')}`;
        this.pending.forEach(([x,y,w,h])=>this.context.fillRect(x,y,w,h));this.pending=[];return this;
    }
}

/** One cached Canvas bitmap per outfit; atlas cards never allocate WebGL renderers. */
export function loadPlayerStill(jobId:string,includeAura=true):Promise<string> {
    const cacheKey=`${jobId}:${includeAura}`;
    const cached=portraits.get(cacheKey);if(cached)return cached;
    const promise=(async()=>{
        const outfit=outfitArts.find(art=>art.id===jobId);
        if(!outfit)throw new Error('未登记职业形象');
        const [identity,costume]=await Promise.all([imageFor(identitySheet),imageFor(outfit.body.url)]);
        const canvas=document.createElement('canvas');
        canvas.width=playerStillFrame.width;canvas.height=playerStillFrame.height;
        const c=canvas.getContext('2d');if(!c)throw new Error('无法绘制角色');c.imageSmoothingEnabled=false;
        const rear=document.createElement('canvas'),ground=document.createElement('canvas');
        const auraId=getProfessionAura(jobId),density=2;
        rear.width=ground.width=84*density;rear.height=ground.height=95*density;
        const rc=rear.getContext('2d')!,gc=ground.getContext('2d')!;
        for(const context of [rc,gc])context.setTransform(density/8,0,0,density/8,42*density,85.5*density);
        if(includeAura)drawProfessionAura(rc,gc,auraId,0);
        c.drawImage(ground,0,0,672,760);
        c.save();c.translate(336,684);c.fillStyle='rgba(66,104,89,.15)';c.beginPath();c.ellipse(0,10,165,26,0,0,Math.PI*2);c.fill();c.restore();
        c.drawImage(rear,0,0,672,760);
        c.translate(149,156);
        const painter=new CanvasRects(c);drawPlayerBase(painter);
        const r=outfit.body.region;c.drawImage(costume,r.x,r.y,r.width,r.height,0,310,374,190);
        const h=identityParts.head;c.drawImage(identity,h.x,h.y,h.width,h.height,0,0,374,310);
        for(const [key,x] of [['leftBoot',104],['rightBoot',195]] as const) {
            const boot=identityParts[key];c.drawImage(identity,boot.x,boot.y,boot.width,boot.height,x,500,boot.width,boot.height);
        }
        drawPlayerHands(painter,false,getPlayerHandAnchors(jobId));
        const url=canvas.toDataURL('image/png');canvas.width=rear.width=ground.width=0;return url;
    })();
    portraits.set(cacheKey,promise);void promise.catch(()=>portraits.delete(cacheKey));return promise;
}
