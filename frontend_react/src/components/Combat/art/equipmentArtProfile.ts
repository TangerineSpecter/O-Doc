import type {ArmorFamily} from './equipmentArtPalette';

export type WeaponElement = 'none' | 'water' | 'earth' | 'wind' | 'fire';
export type RedesignedWeaponKind = 'sword' | 'axe' | 'bow' | 'dagger' | 'mage_staff' | 'staff' | 'holy_staff';

export type EquipmentArtProfile =
    | {kind:'armor';family:ArmorFamily;slot:'body'|'hands'|'feet';tier:number}
    | {kind:'instrument';tier:number;element?:Exclude<WeaponElement,'none'>}
    | {kind:'head';family:ArmorFamily;tier:number}
    | {kind:'shield';style:'magic'|'small'|'large'}
    | {kind:'ring'}
    | {kind:'greatsword'}
    | {kind:'trainingSword'}
    | {kind:'weapon';weapon:RedesignedWeaponKind;refined:boolean;element:WeaponElement};

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
    if(id==='equip.instrument.element_low') return {kind:'instrument',tier:0};
    const instrument=id.match(/^equip\.instrument(?:\.(30|50|70|90|element_low))?(?:\.element\.(water|earth|wind|fire))?$/);
    if(instrument) {
        const rawTier=instrument[1];
        const tier=rawTier&&rawTier!=='element_low'?(Number(rawTier)-10)/20:0;
        const element=instrument[2] as Exclude<WeaponElement,'none'>|undefined;
        return element?{kind:'instrument',tier,element}:{kind:'instrument',tier};
    }
    const weapon=id.match(/^equip\.(sword|axe|bow|dagger|mage_staff|staff|holy_staff)(?:(\.30))?(?:\.element\.(water|earth|wind|fire))?$/);
    if(weapon) {
        const kind=weapon[1] as RedesignedWeaponKind;
        const has30=Boolean(weapon[2]);
        const element=(weapon[3]||'none') as WeaponElement;
        // Base Lv.1-30 non-elemental weapons keep their original approved concept art.
        if(!has30&&element==='none') return undefined;
        const refined=has30||kind==='staff'||kind==='holy_staff';
        return {kind:'weapon',weapon:kind,refined,element};
    }
    const head=id.match(/^equip\.head(?:\.(leather|light|heavy|plate))?(?:\.(30|50|70|90))?$/);
    if(head) return {kind:'head',family:(head[1]||'cloth') as ArmorFamily,tier:(Number(head[2]||10)-10)/20};
    const shield=id.match(/^equip\.offhand\.(magic|small|large)_shield$/);
    if(shield) return {kind:'shield',style:shield[1] as 'magic'|'small'|'large'};
    if(id==='equip.ring') return {kind:'ring'};
    if(id==='equip.training_sword') return {kind:'trainingSword'};
    if(id==='equip.two_handed_sword') return {kind:'greatsword'};
    return undefined;
}
