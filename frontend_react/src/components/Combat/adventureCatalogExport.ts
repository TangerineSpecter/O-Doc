import type {CombatCatalog} from '../../types/api/combat';
import type {CatalogExportSheet} from '../../utils/catalogSpreadsheet';

const tableLabels: Record<string, string> = {
    affixSlots: '词条部位',
    affixes: '词条配置',
    bossDrops: '首领掉落',
    drops: '普通掉落',
    dungeonMonsters: '地牢怪物关系',
    dungeons: '地牢配置',
    equipmentAffixes: '装备词条关系',
    equipmentPools: '装备掉落池',
    equipmentProfessions: '装备职业关系',
    equipmentTemplates: '装备模板',
    levelExperience: '等级经验',
    materials: '冒险材料',
    monsterActions: '怪物行动',
    monsterProfiles: '怪物属性',
    monsterRanks: '怪物等级',
    monsters: '怪物配置',
    potions: '战斗药剂',
    professions: '职业配置',
    qualities: '装备品质',
    rules: '战斗规则',
    skillEffects: '技能效果',
    skillLevels: '技能等级',
    skills: '技能配置',
    styles: '战斗风格',
};

export function adventureCatalogExportSheets(catalog: CombatCatalog): CatalogExportSheet[] {
    const tables = Object.entries(catalog.tables);
    return [
        {name: '目录信息', rows: [{version: catalog.version, tableCount: tables.length, exportScope: '所有冒险图鉴配置表；不含图标图片和居民发现记录'}]},
        ...tables.map(([key, rows]) => ({name: tableLabels[key] || key, rows})),
        {name: '怪物等级预览', rows: catalog.monsterPreviews},
    ];
}
