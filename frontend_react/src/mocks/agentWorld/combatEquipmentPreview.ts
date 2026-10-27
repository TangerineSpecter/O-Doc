import type {CombatProfile} from '../../types/api/combat';
import {normalizeStatKey} from '../../components/Combat/presentation';

/** Local illustration of equipment differences; it never writes the resident loadout. */
export function localEquipmentPreview(profile: CombatProfile, changes: unknown) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes))
        return new Response(JSON.stringify({message:'换装计划无效'}), {status:400});
    const loadout = {...profile.loadout};
    const allowed = new Set(['weapon','offhand','head','body','hands','feet','accessory','ring_1','ring_2']);
    for (const [slot, identity] of Object.entries(changes)) {
        if (!allowed.has(slot) || (identity !== null && typeof identity !== 'string'))
            return new Response(JSON.stringify({message:'装备部位或装备标识无效'}), {status:400});
        if (identity === null) delete loadout[slot];
        else if (profile.equipment.some(item => item.id === identity)) loadout[slot] = identity;
        else return new Response(JSON.stringify({message:'装备不存在'}), {status:400});
    }
    const weapon = profile.equipment.find(item => item.id === loadout.weapon);
    if (weapon?.snapshot.grip === 'two_handed') delete loadout.offhand;
    const attributes = {...profile.attributes};
    const apply = (id: string, sign: number) => {
        const item = profile.equipment.find(gear => gear.id === id);
        for (const [key, value] of Object.entries(item?.snapshot.stats || {})) {
            const stat = normalizeStatKey(key);
            const current = Number(attributes[stat] ?? 0);
            if (Number.isFinite(current) && Number.isFinite(value))
                attributes[stat] = Math.round((current + sign * value) * 10000) / 10000;
        }
    };
    for (const id of Object.values(profile.loadout)) apply(id, -1);
    for (const id of Object.values(loadout)) apply(id, 1);
    return {attributes};
}
