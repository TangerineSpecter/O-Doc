import {EquipmentPortrait} from '../Combat/atlas/EquipmentPortrait';

const weaponArtIds: Readonly<Record<string, string>> = {
    long_sword: 'equip.sword',
    two_handed_sword: 'equip.sword',
    axe: 'equip.axe',
    bow: 'equip.bow',
    dagger: 'equip.dagger',
    mage_staff: 'equip.mage_staff',
    two_handed_staff: 'equip.staff',
    holy_staff: 'equip.holy_staff',
};
const weaponTemplateIds: Readonly<Record<string, string>> = {
    'equip.sword': 'equip.sword',
    'equip.two_handed_sword': 'equip.sword',
    'equip.axe': 'equip.axe',
    'equip.bow': 'equip.bow',
    'equip.dagger': 'equip.dagger',
    'equip.mage_staff': 'equip.mage_staff',
    'equip.staff': 'equip.staff',
    'equip.holy_staff': 'equip.holy_staff',
};
const nameToWeaponType: Readonly<Record<string, string>> = {
    '战斧': 'axe',
    '斧': 'axe',
    '长剑': 'long_sword',
    '双手剑': 'two_handed_sword',
    '弓': 'bow',
    '短剑': 'dagger',
    '匕首': 'dagger',
    '法杖': 'mage_staff',
    '双手杖': 'two_handed_staff',
    '圣杖': 'holy_staff',
};
const slotArtIds: Readonly<Record<string, string>> = {
    weapon: 'equip.training_sword',
    offhand: 'equip.offhand.small_shield',
    head: 'equip.head',
    body: 'equip.body',
    hands: 'equip.hands',
    feet: 'equip.feet',
    accessory: 'equip.charm',
};
const qualityFrames: Readonly<Record<string, string>> = {
    white: 'border-slate-200 bg-slate-50',
    blue: 'border-blue-200 bg-blue-50',
    gold: 'border-amber-300 bg-amber-50',
};

interface BlacksmithEquipmentIconProps {
    slot: string;
    equipmentId?: string;
    equipmentType?: string;
    name?: string;
    quality?: string;
    decorative?: boolean;
    className?: string;
}

/** Recipe previews and finished pieces share the adventure atlas's pixel equipment art. */
export function BlacksmithEquipmentIcon({
    slot,
    equipmentId,
    equipmentType,
    name,
    quality,
    decorative = true,
    className = 'h-14 w-14',
}: BlacksmithEquipmentIconProps) {
    const effectiveType = equipmentType || (slot === 'weapon' && name
        ? Object.entries(nameToWeaponType).find(([key]) => name.includes(key))?.[1]
        : undefined);

    const fallbackId = effectiveType === 'ring' ? 'equip.ring' : slotArtIds[slot] || `equip.${slot}`;
    // Weapon templates share a silhouette across level bands; armor keeps its tier-specific drawing.
    const artId = slot === 'weapon' && equipmentId !== 'equip.training_sword'
        ? weaponArtIds[effectiveType || ''] || weaponTemplateIds[(equipmentId || '').replace(/\.\d+$/, '')] || equipmentId || fallbackId
        : equipmentId || fallbackId;
    const artType = effectiveType || (slot === 'offhand' ? 'small_shield' : slot === 'accessory' ? 'pendant' : 'generic');
    const frame = qualityFrames[quality || ''] || 'border-slate-200/80 bg-slate-50';

    return (
        <div className={`shrink-0 overflow-hidden rounded-xl border ${frame} ${className}`}>
            <EquipmentPortrait
                equipmentId={artId}
                equipmentType={artType}
                slot={slot}
                name={name}
                decorative={decorative}
                className="h-full w-full p-1"
            />
        </div>
    );
}
