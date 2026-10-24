import type {ArmorFamily} from './equipmentArtPalette';
export type EquipmentArtProfile = {kind:'armor';family:ArmorFamily;slot:'body'|'hands'|'feet';tier:number}
    | {kind:'head';tier:number} | {kind:'shield';style:'magic'|'small'|'large'} | {kind:'ring'} | {kind:'greatsword'};
/** Resolve built-ins by stable template ID, including records without a slot/type snapshot. */
export function equipmentArtProfile(id:string):EquipmentArtProfile|undefined {
    const armor=id.match(/^equip\.armor\.(cloth|leather|light|plate|heavy)\.(body|hands|feet)(?:\.(30|50|70|90))?$/);
    if(armor) {
        const family=armor[1] as ArmorFamily;
        const base=family==='light'||family==='plate'?30:10;
        const level=Number(armor[3]||base);
        if(level<=base && armor[3]) return undefined;
        return {kind:'armor',family,slot:armor[2] as 'body'|'hands'|'feet',tier:(level-base)/20};
    }
    const head=id.match(/^equip\.head(?:\.(30|50|70|90))?$/);
    if(head) return {kind:'head',tier:(Number(head[1]||10)-10)/20};
    const shield=id.match(/^equip\.offhand\.(magic|small|large)_shield$/);
    if(shield) return {kind:'shield',style:shield[1] as 'magic'|'small'|'large'};
    if(id==='equip.ring') return {kind:'ring'};
    if(id==='equip.two_handed_sword') return {kind:'greatsword'};
    return undefined;
}
