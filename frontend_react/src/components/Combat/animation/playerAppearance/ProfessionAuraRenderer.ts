import {Sprite,Texture} from 'pixi.js';
import {drawProfessionAura} from './professionAuraDrawing';
import type {ProfessionAuraId} from './layeredPlayerArt';

/** Logical size stays fixed; thin aura contours use a 4-unit pixel grid. */
class AuraSurface {
    readonly canvas=document.createElement('canvas');
    readonly texture:Texture;
    readonly sprite:Sprite;
    readonly context:CanvasRenderingContext2D;
    private density=1;
    constructor(private readonly x:number,private readonly y:number,private readonly width:number,private readonly height:number) {
        this.canvas.width=width;this.canvas.height=height;
        this.context=this.canvas.getContext('2d')!;this.context.imageSmoothingEnabled=false;
        this.texture=Texture.from(this.canvas);this.texture.source.scaleMode='nearest';
        this.sprite=new Sprite(this.texture);this.sprite.scale.set(8);this.sprite.position.set(x,y);
    }
    setDensity(density:number) {
        if(this.density===density)return;
        this.density=density;this.canvas.width=this.width*density;this.canvas.height=this.height*density;
        this.context.imageSmoothingEnabled=false;this.texture.source.resize(this.width,this.height,density);
    }
    reset() {const pixelScale=this.density/8;this.context.setTransform(1,0,0,1,0,0);this.context.clearRect(0,0,this.canvas.width,this.canvas.height);this.context.setTransform(pixelScale,0,0,pixelScale,-this.x*pixelScale,-this.y*pixelScale);}
    upload() {this.texture.source.update();}
    dispose() {this.sprite.destroy();this.texture.destroy(true);this.canvas.width=0;this.canvas.height=0;}
}
export class ProfessionAuraRenderer {
    private readonly back=new AuraSurface(-336,-680,84,88);
    private readonly floor=new AuraSurface(-336,-96,84,24);
    readonly rear=this.back.sprite;
    readonly ground=this.floor.sprite;
    private frame='';
    draw(id:ProfessionAuraId,time:number,rearVisible:boolean,groundVisible:boolean) {
        this.rear.visible=rearVisible&&id!=='none';this.ground.visible=groundVisible&&id!=='none';
        const frame=`${id}:${Math.floor(time*12)}`;
        if(frame===this.frame) return;
        this.frame=frame;const density=id==='none'?1:2;
        this.back.setDensity(density);this.floor.setDensity(density);this.back.reset();this.floor.reset();
        drawProfessionAura(this.back.context,this.floor.context,id,Math.floor(time*12)/12);
        this.back.upload();this.floor.upload();
    }
    dispose() {this.back.dispose();this.floor.dispose();}
}
