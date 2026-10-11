import {Container,Rectangle,Sprite,Texture} from 'pixi.js';
import {createDefeatFragments,sampleDefeatFragment} from './pixelDefeatMotion';
import type {DefeatFragment} from './pixelDefeatMotion';

/** Samples the actor's own transparent texture; all fragments share one small atlas. */
export class PixelDefeatEffect extends Container {
    private readonly atlas:Texture;
    private readonly pieces:{sprite:Sprite;fragment:DefeatFragment}[]=[];
    constructor(canvas:HTMLCanvasElement,boss:boolean,private readonly displayWidth:number) {
        super();
        this.atlas=Texture.from(canvas);this.atlas.source.scaleMode='nearest';
        const context=canvas.getContext('2d')!;
        const fragments=createDefeatFragments(context.getImageData(0,0,canvas.width,canvas.height),boss);
        for(const fragment of fragments) {
            const texture=new Texture({source:this.atlas.source,frame:new Rectangle(fragment.x,fragment.y,fragment.width,fragment.height)});
            const sprite=new Sprite(texture);sprite.anchor.set(.5);
            this.pieces.push({sprite,fragment});this.addChild(sprite);
        }
        this.visible=false;
    }
    sample(time:number) {
        this.visible=time>=0;
        if(time<0)return;
        const factor=this.displayWidth/this.atlas.width;
        for(const {sprite,fragment} of this.pieces) {
            const pose=sampleDefeatFragment(fragment,time);
            sprite.position.set(Math.round((fragment.x+fragment.width/2-this.atlas.width/2+pose.x)*factor/2)*2,
                Math.round((fragment.y+fragment.height/2-this.atlas.height+pose.y)*factor/2)*2);
            sprite.alpha=pose.alpha;sprite.scale.set(factor*pose.scale);
        }
    }
    override destroy() {
        for(const {sprite} of this.pieces)sprite.texture.destroy(false);
        this.pieces.length=0;
        super.destroy({children:true});this.atlas.destroy(true);
    }
}

/** Crop transparent margins once, then sample at a consistent logical pixel size. */
export async function loadDefeatArtwork(src:string) {
    const image=new Image();image.src=src;await image.decode();
    const source=document.createElement('canvas');source.width=image.naturalWidth;source.height=image.naturalHeight;
    const context=source.getContext('2d')!;context.drawImage(image,0,0);
    const pixels=context.getImageData(0,0,source.width,source.height);
    let left=source.width,top=source.height,right=-1,bottom=-1;
    for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(pixels.data[(y*source.width+x)*4+3]>24) {
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left)throw new Error('魔物素材没有可见像素');
    const width=right-left+1,height=bottom-top+1;
    const make=(longest:number)=>{
        const canvas=document.createElement('canvas'),scale=Math.min(1,longest/Math.max(width,height));
        canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
        const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
        ctx.drawImage(source,left,top,width,height,0,0,canvas.width,canvas.height);return canvas;
    };
    return {still:make(512),fragments:make(80)};
}
