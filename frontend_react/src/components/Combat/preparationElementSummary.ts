import type {CombatCatalog, CombatProfile, EquipmentSnapshot} from '../../types/api/combat';
import {elementLabels, elementOrder, formatRatio} from './presentation';

/** Summarize actual enabled monsters, including the area's boss, without assuming one element per area. */
export function dungeonElementSummary(catalog: CombatCatalog, dungeonId: string): string {
    const dungeon = catalog.tables.dungeons.find(row => row.id === dungeonId);
    if (!dungeon) return '';
    const ids = new Set((catalog.tables.dungeonMonsters || [])
        .filter(row => row.dungeonId === dungeonId && row.enabled !== '0')
        .map(row => row.monsterId));
    if (dungeon.bossId) ids.add(dungeon.bossId);
    const monsters = (catalog.tables.monsters || []).filter(row => ids.has(row.id) && row.enabled !== '0');
    if (!monsters.length) return '';
    const elements = [...new Set(monsters.map(row => row.element || '').map(value =>
        value && value !== 'none' ? `${elementLabels[value] || value}属性` : '无属性'))];
    const elementText = elements.join('、');
    const resists = catalog.tables.monsterResists || [];
    const ranges = elementOrder.flatMap(element => {
        const values = monsters.map(monster => Number(resists.find(row => row.monsterId === monster.id && row.element === element)?.value || 0));
        if (!values.some(value => Number.isFinite(value) && value !== 0)) return [];
        const low = Math.min(...values), high = Math.max(...values);
        const percent = (n: number) => `${n > 0 ? '+' : ''}${formatRatio(n)}`;
        return [`${elementLabels[element]}抗性 ${percent(low)}${low !== high ? `～${percent(high)}` : ''}`];
    });
    return `魔物普攻：${elementText}${ranges.length ? `；${ranges.join('，')}` : '；无额外属性抗性'}`;
}

function weaponDescription(snapshot: EquipmentSnapshot): string {
    const element = snapshot.element || '';
    const name = elementLabels[element];
    if (!name) return `${snapshot.name}（无属性）`;
    const power = snapshot.stats[`${element}Power`] ?? snapshot.stats[`${element}_power`];
    return `${snapshot.name}（${name}属性${power ? `，${name}强化 ${power > 0 ? '+' : ''}${formatRatio(power)}` : ''}）`;
}

export function preparationWeapons(profile: CombatProfile): {equipped: string; backups: string[]} {
    const current = profile.equipment.find(item => item.id === profile.loadout.weapon);
    const backups = profile.equipment.filter(item => item.retainedForAdventure && !item.marketListed &&
        item.id !== profile.loadout.weapon && item.snapshot.slot === 'weapon').map(item => weaponDescription(item.snapshot));
    return {equipped: current ? weaponDescription(current.snapshot) : '未装备武器', backups};
}
