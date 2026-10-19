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

export type LoadoutHeroArchetype = 'warrior' | 'mage' | 'archer' | 'priest';

const MAGE_JOBS = new Set([
    'job.mage', 'mage', '法师',
    'job.elementalist', 'elementalist', '元素师',
    'job.occultist', 'occultist', '秘术师',
    'job.pyromancer', 'pyromancer', '炎术师',
    'job.cryomancer', 'cryomancer', '冰术师',
    'job.warlock', 'warlock', '咒术师',
    'job.summoner', 'summoner', '召唤师',
]);

const RANGER_JOBS = new Set([
    'job.ranger', 'ranger', '游侠',
    'job.archer', 'archer', '弓手',
    'job.assassin', 'assassin', '刺客',
    'job.sharpshooter', 'sharpshooter', '神射手',
    'job.hunter', 'hunter', '猎人',
    'job.shadowdancer', 'shadowdancer', '影舞者',
    'job.trickster', 'trickster', '诡术师',
]);

const PRIEST_JOBS = new Set([
    'job.priest', 'priest', '牧师',
    'job.cleric', 'cleric', '祭司',
    'job.naturalist', 'naturalist', '自然使',
    'job.highpriest', 'highpriest', '神官',
    'job.inquisitor', 'inquisitor', '审判者',
    'job.druid', 'druid', '德鲁伊',
    'job.warden', 'warden', '守望者',
]);

/**
 * 按照一转职业分支映射背景英雄形象：
 * - 法师系 -> 'mage'
 * - 游侠/弓手系 -> 'archer'
 * - 牧师系 -> 'priest'
 * - 战士系或新手(job.novice)及默认兜底 -> 'warrior'
 */
export function resolveLoadoutHeroArchetype(jobId?: string | null): LoadoutHeroArchetype {
    const key = (jobId || '').trim();
    if (!key) return 'warrior';
    if (MAGE_JOBS.has(key)) return 'mage';
    if (RANGER_JOBS.has(key)) return 'archer';
    if (PRIEST_JOBS.has(key)) return 'priest';
    return 'warrior';
}

/**
 * 判断某个空槽位在当前背包中是否有可穿戴的候选装备
 */
export function hasLoadoutSlotCandidate(
    profile: CombatProfile,
    slot: string,
    equippedSlots?: Map<string, PresentedLoadoutItem>,
): boolean {
    const resolved = equippedSlots ?? resolveLoadoutSlots(profile);
    const equippedIds = new Set<string>();
    for (const entry of resolved.values()) {
        equippedIds.add(entry.item.id);
    }
    for (const id of Object.values(profile.loadout)) {
        if (id) equippedIds.add(id);
    }

    return profile.equipment.some(item => {
        if (equippedIds.has(item.id) || item.marketListed) return false;
        if (slot === 'ring_1' || slot === 'ring_2') {
            return (
                isRingEquipment(item) ||
                item.snapshot.slot === 'ring_1' ||
                item.snapshot.slot === 'ring_2'
            );
        }
        if (slot === 'accessory') {
            return item.snapshot.slot === 'accessory' && !isRingEquipment(item);
        }
        return item.snapshot.slot === slot;
    });
}

export interface HeroSlotAnchor {
    nx: number;
    ny: number;
}

/**
 * 四大一转职业立绘 (360x400) 上对应的 9 个解剖部位归一化锚点坐标
 */
export const LOADOUT_HERO_ANCHORS: Record<LoadoutHeroArchetype, Record<string, HeroSlotAnchor>> = {
    warrior: {
        head: {nx: 0.50, ny: 0.09},
        accessory: {nx: 0.50, ny: 0.24},
        body: {nx: 0.50, ny: 0.34},
        hands: {nx: 0.31, ny: 0.43},
        weapon: {nx: 0.26, ny: 0.54},
        offhand: {nx: 0.70, ny: 0.46},
        ring_1: {nx: 0.29, ny: 0.49},
        ring_2: {nx: 0.70, ny: 0.50},
        feet: {nx: 0.62, ny: 0.83},
    },
    mage: {
        head: {nx: 0.50, ny: 0.14},
        accessory: {nx: 0.49, ny: 0.30},
        body: {nx: 0.48, ny: 0.40},
        hands: {nx: 0.32, ny: 0.41},
        weapon: {nx: 0.27, ny: 0.39},
        offhand: {nx: 0.64, ny: 0.46},
        ring_1: {nx: 0.28, ny: 0.40},
        ring_2: {nx: 0.69, ny: 0.49},
        feet: {nx: 0.52, ny: 0.83},
    },
    archer: {
        head: {nx: 0.50, ny: 0.14},
        accessory: {nx: 0.49, ny: 0.28},
        body: {nx: 0.50, ny: 0.39},
        hands: {nx: 0.31, ny: 0.45},
        weapon: {nx: 0.33, ny: 0.57},
        offhand: {nx: 0.68, ny: 0.48},
        ring_1: {nx: 0.29, ny: 0.50},
        ring_2: {nx: 0.64, ny: 0.51},
        feet: {nx: 0.60, ny: 0.83},
    },
    priest: {
        head: {nx: 0.50, ny: 0.14},
        accessory: {nx: 0.50, ny: 0.30},
        body: {nx: 0.50, ny: 0.40},
        hands: {nx: 0.34, ny: 0.36},
        weapon: {nx: 0.28, ny: 0.26},
        offhand: {nx: 0.66, ny: 0.46},
        ring_1: {nx: 0.34, ny: 0.37},
        ring_2: {nx: 0.68, ny: 0.48},
        feet: {nx: 0.50, ny: 0.84},
    },
};

