import {professionConcepts, weaponConcepts} from '../../art/professionConcepts';
import {playerSheetUrl, playerSheetSize, playerSheetColumns, playerJobDetails} from '../../art/playerVisuals';
import type {PlayerJob} from '../../art/playerVisuals';
import type {ConceptArt} from '../../art/professionConcepts';

export {auraNames} from '../../art/professionAuras';
export type {ProfessionAuraId} from '../../art/professionAuras';
import type {ProfessionAuraId} from '../../art/professionAuras';
export const identitySheet = playerSheetUrl;
export const identityParts = {
    head:{x:27,y:95,width:374,height:310},
    leftBoot:{x:131,y:595,width:91,height:28},
    rightBoot:{x:222,y:595,width:96,height:28},
};
export interface OutfitArt {id:string;name:string;family:string;body:ConceptArt;original:boolean}
export const outfitArts: OutfitArt[] = professionConcepts.map(concept=>{
    const original = concept.approved === true;
    if(concept.family==='bard')return {id:concept.id,name:concept.name,family:concept.family,original:false,body:concept.art};
    if (original) {
        const job = concept.id as PlayerJob;
        return {id:concept.id,name:concept.name,family:concept.family,original,body:{url:playerSheetUrl,size:playerSheetSize,region:{x:playerSheetColumns[playerJobDetails[job].index],y:405,width:374,height:190}}};
    }
    // Unapproved concept torsos are registered independently. Head, skin and boots
    // never come from these sheets; their body frames are fitted to the novice rig.
    const {region} = concept.art;
    const top = concept.family === 'mage' ? .525 : concept.family === 'ranger' ? .575 : .56;
    const y = Math.round(region.y+region.height*top);
    const bottom = Math.round(region.y+region.height*.927);
    return {id:concept.id,name:concept.name,family:concept.family,original,body:{...concept.art,region:{x:region.x,y,width:region.width,height:bottom-y}}};
});
export const independentWeapons = weaponConcepts;
export const identityFrame = {width:374,height:528,feet:{x:187,y:528}};
export interface LayeredPlayerOptions {
    outfit:string;weapon:string;aura:ProfessionAuraId;
    showBody:boolean;showOutfit:boolean;showWeapon:boolean;showRear:boolean;showGround:boolean;
    backdrop:'cave'|'plain';paused:boolean;
}
export const initialLayeredOptions: LayeredPlayerOptions = {
    outfit:'job.novice',weapon:'equip.staff',aura:'flame',showBody:true,showOutfit:true,
    showWeapon:true,showRear:true,showGround:true,backdrop:'cave',paused:false,
};
