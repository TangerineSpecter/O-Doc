import type {CombatRow} from '../../../types/api/combat';

interface EquipmentDropTables {
    monsters: CombatRow[];
    drops: CombatRow[];
    equipmentPools: CombatRow[];
    equipmentTemplates: CombatRow[];
    dungeonMonsters: CombatRow[];
    dungeons: CombatRow[];
    bossDrops: CombatRow[];
}

/** Equipment is a possible drop only when an actual encounter level can use its level band. */
export function equipmentDropCandidates(monsterId: string, tables: EquipmentDropTables): string[] {
    const monster = tables.monsters.find(row => row.id === monsterId);
    if (!monster) return [];

    const poolIds = new Set(tables.drops
        .filter(row => row.monsterId === monsterId && row.itemKind === 'equipment_pool')
        .map(row => String(row.itemId || '')));
    const encounters = tables.dungeonMonsters
        .filter(row => row.monsterId === monsterId)
        .map(row => ({
            levelMin: Number(row.levelMin),
            levelMax: Number(row.levelMax),
            dungeon: tables.dungeons.find(dungeon => dungeon.id === row.dungeonId),
        }))
        .filter((entry): entry is {levelMin: number; levelMax: number; dungeon: CombatRow} => Boolean(entry.dungeon));

    const bossTrophies = tables.bossDrops.filter(row => row.monsterId === monsterId);
    for (const dungeon of tables.dungeons.filter(row => row.bossId === monsterId)) {
        encounters.push({
            levelMin: Number(dungeon.bossLevelMin),
            levelMax: Number(dungeon.bossLevelMax),
            dungeon,
        });
    }

    const names = new Set<string>();
    const candidateIds = new Set(tables.equipmentPools
        .filter(pool => poolIds.has(String(pool.poolId || '')))
        .map(pool => String(pool.equipmentId || '')));
    for (const trophy of bossTrophies) candidateIds.add(String(trophy.equipmentId || ''));

    for (const templateId of candidateIds) {
        const template = tables.equipmentTemplates.find(row => row.id === templateId);
        if (!template || template.enabled !== '1') continue;

        const templateMin = Number(template.levelMin);
        const templateMax = Number(template.levelMax);
        const monsterMin = Number(monster.levelMin);
        const monsterMax = Number(monster.levelMax);
        const canDrop = encounters.some(({levelMin, levelMax, dungeon}) => {
            const encounterMin = Math.max(monsterMin, levelMin);
            const encounterMax = Math.min(monsterMax, levelMax);
            const equipmentMin = Number(dungeon.equipmentLevelMin);
            const equipmentMax = Number(dungeon.equipmentLevelMax);
            const possibleMonsterMin = Math.max(encounterMin, templateMin, equipmentMin);
            const possibleMonsterMax = Math.min(encounterMax, templateMax);
            const possibleItemMin = Math.max(equipmentMin, templateMin);
            const possibleItemMax = Math.min(equipmentMax, templateMax, possibleMonsterMax);
            return possibleMonsterMin <= possibleMonsterMax && possibleItemMin <= possibleItemMax;
        });

        if (canDrop && template.name) names.add(template.name);
    }
    return [...names];
}
