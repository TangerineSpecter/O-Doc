import {Container,Sprite,Texture} from 'pixi.js';
import slime from '../../../../assets/combat/slime.svg';
import bat from '../../../../assets/combat/cave-bat.svg';
import beast from '../../../../assets/combat/moss-beast.svg';
import king from '../../../../assets/combat/moss-king.svg';
import {getMonsterPixelArt} from '../../art/monsterPixelArt';
import {SlimeActor} from '../SlimeActor';
import {CaveBatActor} from '../CaveBatActor';
import {MossBeastActor} from '../MossBeastActor';
import {MossKingActor} from '../MossKingActor';
import {sampleSlimePose} from '../slimeMotion';
import {sampleCaveBatPose} from '../caveBatMotion';
import {sampleMossBeastPose} from '../mossBeastMotion';
import {sampleMossKingPose} from '../mossKingMotion';
import {loadDefeatArtwork,PixelDefeatEffect} from '../pixelDefeat/PixelDefeatEffect';

type LiveMonster=SlimeActor|CaveBatActor|MossBeastActor|MossKingActor;
type Motion='idle'|'attack'|'hit';
const builtins:Record<string,string>={'monster.slime':slime,'monster.cave_bat':bat,'monster.moss_beast':beast,'monster.moss_king':king};

/** Approved art and existing poses, plus the same fragment effect used in review. */
export class ObservationMonsterActor extends Container {
    private readonly live?:LiveMonster;
    private readonly still?:Sprite;
    private readonly stillTexture:Texture;
    private readonly fragments:PixelDefeatEffect;
    private readonly artwork:Container;
    readonly airborne:boolean;
    private constructor(readonly monsterId:string,art:Awaited<ReturnType<typeof loadDefeatArtwork>>) {
        super();
        this.airborne=monsterId==='monster.cave_bat';
        this.live=monsterId==='monster.slime'?new SlimeActor():monsterId==='monster.cave_bat'?new CaveBatActor()
            :monsterId==='monster.moss_beast'?new MossBeastActor():monsterId==='monster.moss_king'?new MossKingActor():undefined;
        const boss=['monster.moss_king','monster.mine_giant','monster.mist_treant','monster.tide_priest','monster.ash_lord','monster.star_overlord'].includes(monsterId);
        const elite=['monster.moss_beast','monster.iron_guard','monster.ancient_guard','monster.ruin_knight','monster.furnace_guard','monster.rift_lord'].includes(monsterId);
        const size=boss?245:elite?210:185;
        this.stillTexture=Texture.from(art.still);this.stillTexture.source.scaleMode='nearest';
        const scale=size/Math.max(art.still.width,art.still.height);
        if(this.live){
            this.artwork=this.live;this.applyPose('idle',0,0);
            const bounds=this.live.getLocalBounds();this.live.scale.set(size/Math.max(bounds.width,bounds.height));
        } else {
            this.still=new Sprite(this.stillTexture);this.still.anchor.set(.5,1);
            this.still.scale.set(-scale,scale);this.artwork=this.still;
        }
        this.fragments=new PixelDefeatEffect(art.fragments,boss,art.still.width*scale);
        this.fragments.scale.x=this.live?(monsterId==='monster.moss_king'?1:-1):-1;
        this.addChild(this.artwork,this.fragments);
    }
    static async load(id:string) {
        const src=builtins[id]??getMonsterPixelArt(id);
        return src?new ObservationMonsterActor(id,await loadDefeatArtwork(src)):null;
    }
    private applyPose(motion:Motion,time:number,ambient:number) {
        if(this.live instanceof SlimeActor)this.live.update(sampleSlimePose(motion,time,-1),ambient,-1);
        else if(this.live instanceof CaveBatActor)this.live.update(sampleCaveBatPose(motion,time,-1),ambient,-1);
        else if(this.live instanceof MossBeastActor)this.live.update(sampleMossBeastPose(motion,time,-1),ambient,-1);
        else if(this.live instanceof MossKingActor)this.live.update(sampleMossKingPose(motion,time,-1),ambient,-1);
    }
    sample(motion:Motion,time:number,ambient:number,hitAge:number|undefined,defeatAge:number|undefined) {
        this.artwork.visible=defeatAge===undefined;this.fragments.sample(defeatAge??-1);
        this.tint=hitAge!==undefined&&hitAge>=0&&hitAge<.13?0xff9f92:0xffffff;
        if(defeatAge!==undefined)return;
        this.applyPose(motion,time,ambient);
        if(this.still){
            this.still.y=motion==='attack'?-Math.sin(Math.PI*Math.min(1,time/1.1))*9:Math.round(Math.sin(ambient*2)*1.5);
            this.still.rotation=motion==='attack'?-Math.sin(Math.PI*Math.min(1,time/1.1))*.035:0;
        }
    }
    override destroy() {
        if(this.destroyed)return;
        super.destroy({children:true});this.stillTexture.destroy(true);
    }
}
