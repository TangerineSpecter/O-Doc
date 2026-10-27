import type {CombatRow} from '../../../types/api/combat';

function level(value: string | undefined): number {
    if (value === undefined || value.trim() === '') return Infinity;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Infinity;
}

/** Keep equal ranges in catalog order, so adding another area does not reshuffle them. */
export function orderDungeons(dungeons: CombatRow[]): CombatRow[] {
    return [...dungeons].sort((a, b) =>
        level(a.recommendedLevelMin) - level(b.recommendedLevelMin) ||
        level(a.recommendedLevelMax) - level(b.recommendedLevelMax));
}

/** A monster in multiple areas belongs to its lowest-level area for ordering. */
export function orderMonsters(monsters: CombatRow[], dungeons: CombatRow[], encounters: CombatRow[]): CombatRow[] {
    const dungeonOrder = new Map(orderDungeons(dungeons).map((dungeon, index) => [dungeon.id, index]));
    const habitats = new Map<string, {area: number; level: number}>();
    const register = (monsterId: string | undefined, dungeonId: string | undefined, minimum: string | undefined) => {
        if (!monsterId || !dungeonId) return;
        const area = dungeonOrder.get(dungeonId);
        if (area === undefined) return;
        const previous = habitats.get(monsterId);
        const encounterLevel = level(minimum);
        if (!previous || area < previous.area || (area === previous.area && encounterLevel < previous.level)) {
            habitats.set(monsterId, {area, level: encounterLevel});
        }
    };
    for (const row of encounters) register(row.monsterId, row.dungeonId, row.levelMin);
    for (const dungeon of dungeons) register(dungeon.bossId, dungeon.id, dungeon.bossLevelMin);
    const rankOrder: Record<string, number> = {normal: 0, elite: 1, boss: 2};
    return [...monsters].sort((a, b) => {
        const aHabitat = habitats.get(a.id), bHabitat = habitats.get(b.id);
        return (aHabitat?.area ?? Infinity) - (bHabitat?.area ?? Infinity) ||
            (rankOrder[a.rank || 'normal'] ?? 3) - (rankOrder[b.rank || 'normal'] ?? 3) ||
            (aHabitat?.level ?? level(a.levelMin)) - (bHabitat?.level ?? level(b.levelMin));
    });
}
