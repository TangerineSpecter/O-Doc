import body from '../../../assets/combat/equipment-body-v1.png';
import hands from '../../../assets/combat/equipment-hands-v1.png';
import feet from '../../../assets/combat/equipment-feet-v1.png';
import charm from '../../../assets/combat/equipment-charm-v1.png';
import mageStaff from '../../../assets/combat/equipment-mage-staff-v1.svg';
import mossCave from '../../../assets/combat/equipment-boss-moss-cave-v1.png';
import abandonedMine from '../../../assets/combat/equipment-boss-abandoned-mine-v1.png';
import mistForest from '../../../assets/combat/equipment-boss-mist-forest-v1.png';
import sunkenRuins from '../../../assets/combat/equipment-boss-sunken-ruins-v1.png';
import emberFortress from '../../../assets/combat/equipment-boss-ember-fortress-v1.png';
import starRift from '../../../assets/combat/equipment-boss-star-rift-v1.png';

/** Built-in inventory art uses catalog IDs so each regional charm keeps its identity. */
const equipmentIcons: Readonly<Record<string, string>> = {
    'equip.body': body,
    'equip.hands': hands,
    'equip.feet': feet,
    'equip.charm': charm,
    'equip.mage_staff': mageStaff,
    'equip.boss.moss_cave': mossCave,
    'equip.boss.abandoned_mine': abandonedMine,
    'equip.boss.mist_forest': mistForest,
    'equip.boss.sunken_ruins': sunkenRuins,
    'equip.boss.ember_fortress': emberFortress,
    'equip.boss.star_rift': starRift,
};

export function getEquipmentIcon(equipmentId: string): string | undefined {
    return equipmentIcons[equipmentId];
}
