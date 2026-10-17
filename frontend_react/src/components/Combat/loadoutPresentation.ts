import type {CombatEquipment, CombatProfile} from '../../types/api/combat';

export interface PresentedLoadoutItem {
    item: CombatEquipment;
    sourceSlot: string;
}

const standardSlots = [
    'weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory', 'ring_1', 'ring_2',
];

export function isRingEquipment(item: CombatEquipment): boolean {
    return (item.snapshot.equipmentType || item.displayType) === 'ring';
}

/**
 * Prefer the canonical slot keys, then recover old/mis-keyed rings into a free
 * ring position. Keep the original key so an explicit unequip can clear it.
 */
export function resolveLoadoutSlots(profile: CombatProfile): Map<string, PresentedLoadoutItem> {
    const equipmentById = new Map<string, CombatEquipment>(profile.equipment.map(item => [item.id, item] as const));
    const slots = new Map<string, PresentedLoadoutItem>();
    const assignedIds = new Set<string>();

    for (const slot of standardSlots) {
        const equipmentId = profile.loadout[slot];
        const item = equipmentId ? equipmentById.get(equipmentId) : undefined;
        if (!item || (slot === 'accessory' && isRingEquipment(item))) continue;
        slots.set(slot, {item, sourceSlot: slot});
        assignedIds.add(item.id);
    }

    for (const [sourceSlot, equipmentId] of Object.entries(profile.loadout)) {
        if (!equipmentId || assignedIds.has(equipmentId)) continue;
        const item = equipmentById.get(equipmentId);
        if (!item || !isRingEquipment(item)) continue;
        const ringSlot = (['ring_1', 'ring_2'] as const).find(slot => !slots.has(slot));
        if (!ringSlot) continue;
        slots.set(ringSlot, {item, sourceSlot});
        assignedIds.add(item.id);
    }

    return slots;
}
