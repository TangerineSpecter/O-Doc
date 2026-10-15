import {Container,Graphics,Rectangle,Sprite,Texture} from 'pixi.js';
import type {ConceptArt} from '../../art/professionConcepts';
import {identityFrame,identityParts,identitySheet,outfitArts,independentWeapons} from './layeredPlayerArt';
import type {LayeredPlayerOptions} from './layeredPlayerArt';
import {drawPlayerHand} from './playerHandDrawing';
import {getPlayerHandAnchors, noviceHandAnchors} from './playerHandRegistration';
import {getPlayerWeaponRegistration} from './playerWeaponRegistration';
import {drawPlayerBase} from './playerBaseDrawing';
import {createCleanBodyCanvas} from './bodyPixelCleanup';
import {getAuthToken} from '@/utils/authStorage';

export interface AppearanceOverlayTransform {x:number;y:number;scale:number;rotation:number}
export interface AppearanceOverlayTransforms {leftHand:AppearanceOverlayTransform;rightHand:AppearanceOverlayTransform;weapon:AppearanceOverlayTransform}
export const DEFAULT_APPEARANCE_OVERLAYS:AppearanceOverlayTransforms={
    leftHand:{x:0,y:0,scale:1,rotation:0},rightHand:{x:0,y:0,scale:1,rotation:0},weapon:{x:0,y:0,scale:1,rotation:0},
};

/** Fixed novice identity. Wardrobe, hand pixels and equipment have separate owners. */
export class LayeredPlayerActor extends Container {
    readonly bodyLayer = new Container();
    readonly outfitLayer = new Container();
    readonly weaponLayer = new Container();
    private readonly upper = new Container();
    private readonly fullBody = new Sprite();
    private readonly head=new Sprite();
    private readonly skinLayer = new Container();
    private readonly leftHand = new Graphics();
    private readonly rightHand = new Graphics();
    private readonly costume = new Sprite();
    private readonly weapon = new Sprite();
    private readonly ownedTextures:Texture[]=[];
    private costumeTexture?:Texture;
    private costumeTextureOwnsSource=false;
    private readonly defaultHeadTexture!:Texture;
    private customHeadRequest=0;
    private customHeadTexture?:Texture;
    private customFullBodyRequest=0;
    private customFullBodyTexture?:Texture;
    private battleOverlays:AppearanceOverlayTransforms=DEFAULT_APPEARANCE_OVERLAYS;
    private headBehindBody=false;
    private weaponTexture?:Texture;
    private outfitId='';
    private weaponId='';
    private emitter={x:0,y:0};
    private weaponRestRotation=0;

    constructor(private readonly sheets:Map<string,Texture>) {
        super();
        const base = new Graphics();
        // Neutral ivory undershirt and short trousers, on the approved logical grid.
        // This reconstructs the area hidden by the novice cape/belt, not a new face.
        drawPlayerBase(base);
        this.bodyLayer.addChild(base);
        for(const [key,part] of Object.entries(identityParts)) {
            const texture=this.slice({url:identitySheet,size:{width:1774,height:887},region:part});
            this.ownedTextures.push(texture);
            const sprite=key==='head'?this.head:new Sprite();sprite.texture=texture;
            if(key==='head') {sprite.position.set(0,0);this.defaultHeadTexture=texture;}
            else if(key==='leftBoot') {sprite.position.set(104,500);this.bodyLayer.addChild(sprite);}
            else if(key==='rightBoot') {sprite.position.set(195,500);this.bodyLayer.addChild(sprite);}
        }
        // Keep every sleeve/cape pixel. Palms cover their own silhouette only;
        // rectangular cut-outs would erase garment seams around the wrists.
        this.costume.position.set(0,310);this.costume.width=374;this.costume.height=190;
        this.outfitLayer.addChild(this.costume);
        this.skinLayer.addChild(this.leftHand,this.rightHand);
        this.weaponLayer.addChild(this.weapon);
        // Body and hair sit behind carried equipment; palms cover the handle.
        this.fullBody.width=374;this.fullBody.height=528;this.fullBody.visible=false;
        this.upper.addChild(this.fullBody,this.bodyLayer,this.outfitLayer,this.head,this.weaponLayer,this.skinLayer);
        this.upper.pivot.set(identityFrame.feet.x,identityFrame.feet.y);
        this.addChild(this.upper);
    }

    private slice(art:ConceptArt) {
        const {x,y,width,height}=art.region;
        return new Texture({source:this.sheets.get(art.url)!.source,frame:new Rectangle(x,y,width,height)});
    }

    configure(options:LayeredPlayerOptions) {
        const hasFullBody=Boolean(this.customFullBodyTexture);
        this.fullBody.visible=options.showBody&&hasFullBody;
        this.bodyLayer.visible=options.showBody&&!hasFullBody;
        this.skinLayer.visible=options.showBody;this.head.visible=options.showBody;
        this.head.visible=options.showBody&&!hasFullBody;
        this.outfitLayer.visible=options.showOutfit&&!hasFullBody;
        this.weaponLayer.visible=options.showWeapon;
        if(options.outfit!==this.outfitId) {
            this.outfitId=options.outfit;
            const art=outfitArts.find(item=>item.id===options.outfit) ?? outfitArts[0];
            const previous=this.costumeTexture;
            const previousOwnsSource=this.costumeTextureOwnsSource;
            if (art.original) {
                const source=this.sheets.get(art.body.url)!.source.resource as CanvasImageSource;
                this.costumeTexture=Texture.from(createCleanBodyCanvas(source,art.body.region));
                this.costumeTexture.source.scaleMode='nearest';
                this.costumeTextureOwnsSource=true;
            } else {
                this.costumeTexture=this.slice(art.body);
                this.costumeTextureOwnsSource=false;
            }
            this.costume.texture=this.costumeTexture;
            this.costume.width=374;this.costume.height=190;
            previous?.destroy(previousOwnsSource);
        }
        if(options.weapon!==this.weaponId) {
            this.weaponId=options.weapon;
            const item=independentWeapons.find(w=>w.id===options.weapon);
            this.weapon.visible=Boolean(item);
            if(item) {
                const previous=this.weaponTexture;this.weaponTexture=this.slice(item.art);
                this.weapon.texture=this.weaponTexture;previous?.destroy(false);
                const {width,height}=item.art.region;
                // Grip registration is item-local; the weapon never chooses a job.
                const registration=getPlayerWeaponRegistration(options.weapon,width,height);
                this.weapon.pivot.set(registration.grip.x,registration.grip.y);
                const scale=registration.height/height;
                this.weapon.scale.set(registration.mirrored?-scale:scale,scale);
                this.weapon.rotation=registration.rotation;
                this.weaponRestRotation=registration.rotation;
                // Registered in item texture coordinates; read the live transform
                // after placement so a replaced weapon never emits from the wrist.
                this.emitter=options.weapon==='equip.staff'||options.weapon==='equip.mage_staff'?{x:width*.58,y:height*.13}
                    :options.weapon==='equip.bow'?registration.grip:{x:width*.55,y:height*.16};
            }
        }
        const anchors=options.showOutfit?getPlayerHandAnchors(options.outfit):noviceHandAnchors;
        const holding=options.showWeapon&&this.weapon.visible;
        const left=this.battleOverlays.leftHand,right=this.battleOverlays.rightHand,weapon=this.battleOverlays.weapon;
        this.leftHand.position.set(anchors.left.x+left.x,anchors.left.y+left.y);
        this.leftHand.scale.set(left.scale);this.leftHand.rotation=left.rotation;
        this.rightHand.position.set(anchors.right.x+right.x,anchors.right.y+right.y);
        this.rightHand.scale.set(right.scale);this.rightHand.rotation=right.rotation;
        drawPlayerHand(this.leftHand,false);drawPlayerHand(this.rightHand,holding);
        this.weapon.position.set(anchors.right.x+weapon.x,anchors.right.y+weapon.y);
        const item=independentWeapons.find(w=>w.id===options.weapon);
        if(item&&this.weaponTexture){
            const registration=getPlayerWeaponRegistration(options.weapon,item.art.region.width,item.art.region.height);
            const scale=registration.height/item.art.region.height*weapon.scale;
            this.weapon.scale.set(registration.mirrored?-scale:scale,scale);
            this.weaponRestRotation=registration.rotation+weapon.rotation;
            this.weapon.rotation=this.weaponRestRotation;
        }
    }

    setAppearanceOverlays(overlays:AppearanceOverlayTransforms) {
        this.battleOverlays=overlays;
        if(this.outfitId)this.configure({outfit:this.outfitId,weapon:this.weaponId,aura:'none',showBody:true,showOutfit:true,
            showWeapon:this.weaponLayer.visible,showRear:false,showGround:false,backdrop:'plain',paused:false});
    }

    async setFullBodyImage(url?:string) {
        const request=++this.customFullBodyRequest;
        if(!url){this.fullBody.texture=Texture.EMPTY;this.customFullBodyTexture?.destroy(true);this.customFullBodyTexture=undefined;this.fullBody.visible=false;
            this.bodyLayer.visible=true;this.outfitLayer.visible=true;this.head.visible=true;return;}
        try {
            const token=getAuthToken();
            const response=await fetch(url,{headers:token?{Authorization:`Token ${token}`}:{}});
            if(!response.ok)throw new Error('full body image is unavailable');
            const bitmap=await createImageBitmap(await response.blob());
            const texture=Texture.from(bitmap);
            if(request!==this.customFullBodyRequest){texture.destroy(true);return;}
            texture.source.scaleMode='nearest';
            const previous=this.customFullBodyTexture;this.customFullBodyTexture=texture;this.fullBody.texture=texture;
            this.fullBody.width=374;this.fullBody.height=528;this.fullBody.visible=true;
            this.bodyLayer.visible=false;this.outfitLayer.visible=false;this.head.visible=false;
            previous?.destroy(true);
        } catch {
            if(request===this.customFullBodyRequest){this.fullBody.texture=Texture.EMPTY;this.customFullBodyTexture?.destroy(true);this.customFullBodyTexture=undefined;
                this.fullBody.visible=false;this.bodyLayer.visible=true;this.outfitLayer.visible=true;this.head.visible=true;}
        }
    }

    async setHeadImage(url?:string) {
        const request=++this.customHeadRequest;
        if(!url) {this.head.texture=this.defaultHeadTexture;this.customHeadTexture?.destroy(true);this.customHeadTexture=undefined;this.updateHeadLayer();return;}
        try {
            const token=getAuthToken();
            const response=await fetch(url,{headers:token?{Authorization:`Token ${token}`}:{}});
            if(!response.ok)throw new Error('head image is unavailable');
            const bitmap=await createImageBitmap(await response.blob());
            const texture=Texture.from(bitmap);
            if(request!==this.customHeadRequest){texture.destroy(true);return;}
            texture.source.scaleMode='nearest';
            const previous=this.customHeadTexture;
            this.customHeadTexture=texture;
            this.head.texture=texture;
            this.updateHeadLayer();
            previous?.destroy(true);
        } catch {
            if(request===this.customHeadRequest){this.head.texture=this.defaultHeadTexture;this.customHeadTexture?.destroy(true);this.customHeadTexture=undefined;this.updateHeadLayer();}
        }
    }

    setHeadBehindBody(behind:boolean) {this.headBehindBody=behind;this.updateHeadLayer();}
    private updateHeadLayer() {
        // The attachment point remains fixed. Only the hanging artwork changes
        // occlusion; failed/custom-empty textures retain the original layering.
        this.upper.setChildIndex(this.head,this.headBehindBody&&this.customHeadTexture?0:3);
    }

    update(time:number,lean=0,lift=0) {this.upper.y=Math.round(Math.sin(time*2.1)*2)-lift;this.upper.rotation=lean;}
    /** Rotate carried art around its registered grip; clothing and hands stay intact. */
    setWeaponSwing(rotation:number) {this.weapon.rotation=this.weaponRestRotation+rotation;}

    getEmissionPoint(world:Container) {
        const point=this.weaponLayer.visible&&this.weapon.visible
            ?this.weapon.toGlobal(this.emitter)
            :this.upper.toGlobal(getPlayerHandAnchors(this.outfitId).right);
        return world.toLocal(point);
    }

    override destroy() {
        this.customHeadRequest++;
        this.customFullBodyRequest++;
        super.destroy({children:true});
        this.customHeadTexture?.destroy(true);
        this.customFullBodyTexture?.destroy(true);
        this.ownedTextures.forEach(t=>t.destroy(false));
        this.costumeTexture?.destroy(this.costumeTextureOwnsSource);this.weaponTexture?.destroy(false);
    }
}
