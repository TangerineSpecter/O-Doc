import {Container,Graphics,Rectangle,Sprite,Texture} from 'pixi.js';
import type {ConceptArt} from '../../art/professionConcepts';
import {identityFrame,identityParts,identitySheet,outfitArts,independentWeapons} from './layeredPlayerArt';
import type {LayeredPlayerOptions} from './layeredPlayerArt';
import {drawPlayerHands} from './playerHandDrawing';
import {getPlayerHandAnchors, noviceHandAnchors} from './playerHandRegistration';
import {getPlayerWeaponRegistration} from './playerWeaponRegistration';
import {drawPlayerBase} from './playerBaseDrawing';
import {getAuthToken} from '@/utils/authStorage';

/** Fixed novice identity. Wardrobe, hand pixels and equipment have separate owners. */
export class LayeredPlayerActor extends Container {
    readonly bodyLayer = new Container();
    readonly outfitLayer = new Container();
    readonly weaponLayer = new Container();
    private readonly upper = new Container();
    private readonly head=new Sprite();
    private readonly skinLayer = new Container();
    private readonly hands = new Graphics();
    private readonly costume = new Sprite();
    private readonly weapon = new Sprite();
    private readonly ownedTextures:Texture[]=[];
    private costumeTexture?:Texture;
    private readonly defaultHeadTexture!:Texture;
    private customHeadRequest=0;
    private customHeadTexture?:Texture;
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
        this.skinLayer.addChild(this.hands);
        this.weaponLayer.addChild(this.weapon);
        // Body and hair sit behind carried equipment; palms cover the handle.
        this.upper.addChild(this.bodyLayer,this.outfitLayer,this.head,this.weaponLayer,this.skinLayer);
        this.upper.pivot.set(identityFrame.feet.x,identityFrame.feet.y);
        this.addChild(this.upper);
    }

    private slice(art:ConceptArt) {
        const {x,y,width,height}=art.region;
        return new Texture({source:this.sheets.get(art.url)!.source,frame:new Rectangle(x,y,width,height)});
    }

    configure(options:LayeredPlayerOptions) {
        this.bodyLayer.visible=options.showBody;
        this.skinLayer.visible=options.showBody;this.head.visible=options.showBody;
        this.outfitLayer.visible=options.showOutfit;
        this.weaponLayer.visible=options.showWeapon;
        if(options.outfit!==this.outfitId) {
            this.outfitId=options.outfit;
            const art=outfitArts.find(item=>item.id===options.outfit) ?? outfitArts[0];
            const previous=this.costumeTexture;
            this.costumeTexture=this.slice(art.body);this.costume.texture=this.costumeTexture;
            this.costume.width=374;this.costume.height=190;
            previous?.destroy(false);
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
                this.emitter=options.weapon==='equip.staff'?{x:width*.58,y:height*.13}
                    :options.weapon==='equip.bow'?registration.grip:{x:width*.55,y:height*.16};
            }
        }
        const anchors=options.showOutfit?getPlayerHandAnchors(options.outfit):noviceHandAnchors;
        const holding=options.showWeapon&&this.weapon.visible;
        this.weapon.position.set(anchors.right.x,anchors.right.y);
        drawPlayerHands(this.hands,holding,anchors);
    }

    async setHeadImage(url?:string) {
        const request=++this.customHeadRequest;
        if(!url) {this.head.texture=this.defaultHeadTexture;this.customHeadTexture?.destroy(true);this.customHeadTexture=undefined;return;}
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
            previous?.destroy(true);
        } catch {
            if(request===this.customHeadRequest){this.head.texture=this.defaultHeadTexture;this.customHeadTexture?.destroy(true);this.customHeadTexture=undefined;}
        }
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
        super.destroy({children:true});
        this.customHeadTexture?.destroy(true);
        this.ownedTextures.forEach(t=>t.destroy(false));
        this.costumeTexture?.destroy(false);this.weaponTexture?.destroy(false);
    }
}
