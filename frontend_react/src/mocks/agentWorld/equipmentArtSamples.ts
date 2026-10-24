import catalog from './catalog';
import type {CombatEquipment, CombatRow} from '../../types/api/combat';
import type {MarketItem} from '../../types/api/market';

/** Complete built-in artwork coverage. IDs come from the same typed local catalog as the atlas. */
export const equipmentArtTemplates = catalog.combat.tables.equipmentTemplates.filter(row =>
    /^equip\.(armor\.|head(?:\.|$)|ring$|offhand\.|two_handed_sword$)/.test(row.id));
// Display fixtures retain each template's real stat categories; they do not simulate random rolls.
function templateStats(row:CombatRow):Record<string,number> {
    const stats:Record<string,number>={};
    for(const stat of ['physicalAttack','magicAttack','hp','mp','physicalDefense','magicDefense','healing']) {
        const value=Math.floor(Number(row[`${stat}Base`]||0)+Number(row[`${stat}Growth`]||0)*Number(row.levelMin));
        if(value)stats[stat==='hp'?'hpMax':stat==='mp'?'mpMax':stat]=Math.floor(value*1.15);
    }
    if(Number(row.evasion))stats.evasion=Number(row.evasion);
    return stats;
}
export const equipmentArtSamples:CombatEquipment[] = equipmentArtTemplates.map(row => ({
    id:`local-art-${row.id}`,templateId:row.id,bound:false,locked:false,value:'120',
    snapshot:{templateId:row.id,name:row.name!,slot:row.slot!,equipmentType:row.equipmentType,
        level:Number(row.levelMin),quality:'blue',value:'120',stats:templateStats(row),affixes:[]},
}));
export const equipmentArtMarketSamples:MarketItem[] = equipmentArtSamples.map(gear => ({
    name:gear.snapshot.name,kind:'combat_equipment',quantity:1,rarity:'blue',value:gear.value,
    source:{kind:'combat_equipment',equipmentId:gear.id,sku:`combat.equipment.${gear.id}`},
    equipmentSnapshot:gear.snapshot,
}));
