import type {CombatCatalog, CombatRow} from '../../types/api/combat';
import type {CatalogExportSheet} from '../../utils/catalogSpreadsheet';
import {equipmentSlotLabel, equipmentTypeLabels, statLabels} from './presentation';

const tableLabels: Record<string, string> = {
    affixSlots: '词条可用部位',
    affixes: '装备词条范围',
    bossDrops: '首领专属掉落',
    drops: '魔物掉落配置',
    dungeonMonsters: '地牢魔物分布',
    dungeons: '地牢图鉴',
    equipmentAffixes: '装备词条配置',
    equipmentPools: '地牢装备池',
    equipmentProfessions: '装备职业限制',
    equipmentTemplates: '装备图鉴',
    levelExperience: '等级经验表',
    materials: '材料图鉴',
    monsterActions: '魔物行动配置',
    monsterProfiles: '魔物属性模板',
    monsterRanks: '魔物等级系数',
    monsters: '怪物图鉴',
    potions: '战斗药剂图鉴',
    professions: '职业图鉴',
    qualities: '装备品质规则',
    rules: '冒险通用规则',
    skillEffects: '技能效果配置',
    skillLevels: '技能等级配置',
    skills: '技能图鉴',
    styles: '战斗风格配置',
};

const fieldLabels: Record<string, string> = {
    actionKind: '行动类型', accuracy: '命中', accuracyBase: '基础命中率', affixCount: '词条数量', affixId: '词条名称',
    attackConstant: '攻击常数', attackLinear: '攻击线性成长', attackMultiplier: '攻击倍率', attackQuadratic: '攻击二次成长',
    attackWeight: '普攻权重', bossId: '首领魔物', bossLevelMax: '首领最高等级', bossLevelMin: '首领最低等级',
    bossProbabilityCap: '首领出现概率上限', bossProbabilityStep: '首领概率增长幅度', bossStartKills: '触发首领前击败数',
    bossWeight: '首领权重', chance: '触发概率', code: '效果类型', condition: '触发条件', costBase: '基础魔力消耗',
    costPerLevel: '每级额外魔力消耗', costRankFactor: '技能阶级消耗倍率', cooldownRounds: '冷却回合', critical: '暴击率',
    criticalDamage: '暴击伤害', critical_damage: '暴击伤害', damageType: '伤害类型', defendFactor: '防御倾向', defendReduction: '防御姿态减伤',
    defenseConstant: '防御常数', defenseLinear: '防御线性成长', defenseMultiplier: '防御倍率', defenseReductionCap: '减伤上限',
    defenseScaleBase: '防御缩放基础值', defenseScalePerLevel: '每级防御缩放', dexAccuracyMax: '敏捷命中加成上限',
    dexAccuracyScale: '敏捷命中系数', dexEvasionMax: '敏捷闪避加成上限', dexEvasionScale: '敏捷闪避系数', dexterityGrowth: '敏捷成长',
    damageVariationMax: '伤害浮动上限', damageVariationMin: '伤害浮动下限', dailyMinutes: '每日冒险时长（分钟）', duration: '持续回合',
    dungeonId: '地牢名称', exclusiveProbability: '专属掉落概率', bossOnly: '是否首领专属', grip: '持握方式',
    eliteGoldChance: '精英魔物金币掉落概率', eliteWeight: '精英魔物权重', enabled: '是否启用', encounterDelaySeconds: '遭遇间隔（秒）',
    encounterWeight: '遭遇权重', energyBlockSeconds: '体力消耗周期（秒）', energyPerBlock: '每个体力周期消耗', equipmentCarryCap: '装备携带上限',
    equipmentId: '装备名称', equipmentLevelMax: '装备等级上限', equipmentLevelMin: '装备等级下限', equipmentPerHourLimit: '每小时装备获取上限',
    equipmentType: '装备类型', equipmentIntervalSeconds: '装备掉落间隔（秒）', entryEnergyCost: '出发体力消耗', evasion: '闪避',
    evasionBase: '基础闪避率', evasionCap: '闪避率上限', experience: '经验', experienceMultiplier: '经验倍率', experienceToNext: '升级所需经验',
    group: '效果分组', healThreshold: '治疗触发阈值', healing: '治疗能力', healingBase: '基础治疗能力', healingGrowth: '治疗能力成长', hitMax: '最高命中率', hitMin: '最低命中率',
    hits: '攻击段数', hp: '生命上限', hpBase: '基础生命', hpConstant: '生命常数', hpGrowth: '生命成长', hpLinear: '生命线性成长',
    hpMultiplier: '生命倍率', hpPerVitality: '每点体质增加生命', hpQuadratic: '生命二次成长', hpRecoveryRatio: '生命恢复比例',
    hp_max: '最大生命', hpMax: '最大生命', intelligenceGrowth: '智力成长', itemId: '掉落内容', itemKind: '掉落类型', level: '等级',
    levelCap: '等级上限', levelMax: '最高等级', levelMin: '最低等级', learnLevel: '学习等级', lootCarryCap: '材料携带上限',
    lootIntervalSeconds: '材料掉落间隔（秒）', luckCriticalMax: '幸运暴击加成上限', luckCriticalScale: '幸运暴击系数', luckGrowth: '幸运成长',
    magicAttackBase: '基础魔法攻击', magicAttackGrowth: '魔法攻击成长', magicAttackMultiplier: '魔法攻击倍率', magicDefenseBase: '基础魔法防御',
    magicDefenseGrowth: '魔法防御成长', magicDefenseMultiplier: '魔法防御倍率', manaThreshold: '魔力保留阈值', maxBase: '词条数值上限',
    maxGrowth: '词条成长上限', minBase: '词条数值下限', minGrowth: '词条成长下限', mpBase: '基础魔力', mpConstant: '魔力常数',
    mpGrowth: '魔力成长', mpLinear: '魔力线性成长', mpMultiplier: '魔力倍率', mpPerIntelligence: '每点智力增加魔力',
    mpPerSpirit: '每点精神增加魔力', mpQuadratic: '魔力二次成长', mpRecoveryRatio: '魔力恢复比例', mp_max: '最大魔力', monsterId: '魔物名称',
    name: '名称', normalEquipmentChance: '普通魔物装备掉落概率', normalGoldChance: '普通魔物金币掉落概率', normalWeight: '普通魔物权重',
    outsideRecoverySeconds: '场外恢复间隔（秒）', parentId: '上级职业', penetrationCap: '防御穿透上限', physicalAttackBase: '基础物理攻击',
    physicalAttackGrowth: '物理攻击成长', physicalDefenseBase: '基础物理防御', physicalDefenseGrowth: '物理防御成长',
    physicalDefenseMultiplier: '物理防御倍率', poolId: '装备池名称', potionCarryCap: '药剂携带上限', professionId: '职业名称',
    profile: '属性模板', purchasePrice: '购买单价', quantityMax: '最多数量', quantityMin: '最少数量', rank: '魔物等级或技能阶数',
    recommendedLevelMax: '推荐等级上限', recommendedLevelMin: '推荐等级下限', reduction: '伤害减免', restoreValue: '恢复量',
    requiredLevel: '所需等级', requiredMastery: '所需技能精通', rootJob: '限定职业', roundSeconds: '战斗回合时长（秒）',
    saleMultiplier: '回收价格倍率', salePrice: '回收单价', sharedCooldownRounds: '共用冷却回合', skillId: '技能名称',
    skillLevelId: '技能等级', skillWeight: '技能权重', slot: '装备部位', spiritGrowth: '精神成长', stage: '转职阶数', stat: '属性',
    statusReductionCap: '异常状态减免上限', strengthGrowth: '力量成长', target: '作用目标', unit: '数值单位', value: '数值',
    vitalityGrowth: '体质成长', vulnerabilityCap: '易伤上限', weaponSaleBase: '武器回收基础价', weaponSalePerLevel: '武器每级回收价',
    weight: '权重', xpConstant: '经验常数项', xpLinear: '经验线性系数', xpOverlevelBaseCap: '越级经验基础上限', xpQuadratic: '经验二次系数',
    xpRequirementConstant: '升级经验常数项', xpRequirementCubic: '升级经验三次系数', xpRequirementLinearSquared: '升级经验二次系数',
    affixSaleBonusCap: '词条回收加成上限', attributePercentBonusMax: '属性百分比加成上限', attributePercentBonusMin: '属性百分比加成下限',
    bossGoldChance: '首领金币掉落概率', defeatHpRatio: '倒地后生命比例', defeatRestSeconds: '倒地休息时长（秒）',
};

const ruleLabels: Record<string, string> = {
    round_seconds: '每个战斗回合时长（秒）', encounter_delay_seconds: '寻找下一只魔物的间隔（秒）',
    loot_interval_seconds: '材料掉落间隔（秒）', equipment_interval_seconds: '装备掉落间隔（秒）',
    loot_carry_cap: '材料携带上限', equipment_carry_cap: '装备携带上限', entry_energy_cost: '出发体力消耗',
    energy_per_block: '每个体力周期消耗', energy_block_seconds: '体力消耗周期（秒）', daily_minutes: '每日冒险时长（分钟）',
    level_cap: '等级上限', normal_equipment_chance: '普通魔物装备掉落概率', normal_gold_chance: '普通魔物金币掉落概率',
    elite_gold_chance: '精英魔物金币掉落概率', boss_gold_chance: '首领金币掉落概率', weapon_sale_base: '武器回收基础价',
    weapon_sale_per_level: '武器每级回收价', equipment_per_hour_limit: '每小时装备获取上限', potion_carry_cap: '药剂携带上限',
    defeat_rest_seconds: '倒地休息时长（秒）', outside_recovery_seconds: '场外恢复间隔（秒）', hp_recovery_ratio: '生命恢复比例',
    mp_recovery_ratio: '魔力恢复比例', defeat_hp_ratio: '倒地后生命比例', hp_base: '基础生命', mp_base: '基础魔力',
    hp_per_vitality: '每点体质增加生命', mp_per_intelligence: '每点智力增加魔力', mp_per_spirit: '每点精神增加魔力',
    accuracy_base: '基础命中率', dex_accuracy_max: '敏捷命中加成上限', dex_accuracy_scale: '敏捷命中系数',
    evasion_base: '基础闪避率', dex_evasion_max: '敏捷闪避加成上限', dex_evasion_scale: '敏捷闪避系数',
    hit_min: '最低命中率', hit_max: '最高命中率', evasion_cap: '闪避率上限', critical_base: '基础暴击率',
    luck_critical_max: '幸运暴击加成上限', luck_critical_scale: '幸运暴击系数', critical_cap: '暴击率上限',
    critical_damage_base: '基础暴击伤害', critical_damage_cap: '暴击伤害上限', defense_scale_base: '防御缩放基础值',
    defense_scale_per_level: '每级防御缩放', defense_reduction_cap: '减伤上限', status_reduction_cap: '异常状态减免上限',
    defend_reduction: '防御姿态减伤', penetration_cap: '防御穿透上限', xp_constant: '经验常数项', xp_linear: '经验线性系数',
    xp_quadratic: '经验二次系数', xp_overlevel_base_cap: '越级经验基础上限', xp_requirement_constant: '升级经验常数项',
    xp_requirement_linear_squared: '升级经验二次系数', xp_requirement_cubic: '升级经验三次系数',
    damage_variation_min: '伤害浮动下限', damage_variation_max: '伤害浮动上限', affix_sale_bonus_cap: '词条回收加成上限',
    attribute_percent_bonus_min: '属性百分比加成下限', attribute_percent_bonus_max: '属性百分比加成上限', vulnerability_cap: '易伤上限',
};

const rankLabels: Record<string, string> = {normal: '普通', elite: '精英', boss: '首领'};
const profileLabels: Record<string, string> = {plain: '普通型', agile: '敏捷型', armored: '重装型', magic: '魔法型'};
const qualityLabels: Record<string, string> = {white: '白装', blue: '蓝装', gold: '金装'};
const actionLabels: Record<string, string> = {attack: '普通攻击', skill: '技能'};
const itemKindLabels: Record<string, string> = {material: '材料', equipment_pool: '区域装备池', equipment: '装备', potion: '药剂'};
const conditionLabels: Record<string, string> = {always: '始终可用', not_active: '没有持续技能生效时', hp_below_50: '生命低于一半时'};
const damageTypeLabels: Record<string, string> = {physical: '物理', magic: '魔法'};
const gripLabels: Record<string, string> = {one_handed: '单手', two_handed: '双手'};
const groupLabels: Record<string, string> = {
    reduction: '伤害减免', shield: '护盾', evasion: '闪避', attack: '攻击', burn: '灼烧', regeneration: '恢复',
    accuracy: '命中', physical_defense: '物理防御', shield_wall_reduction: '圣盾减伤', shield_wall_reflect: '圣盾反击',
    holy_aegis: '圣光庇护', decay: '衰弱', defense: '防御', contract: '契约', damage_taken: '受到伤害', poison: '中毒',
};
const targetLabels: Record<string, string> = {enemy: '敌方', self: '自身'};
const kindLabels: Record<string, string> = {active: '主动技能', passive: '被动技能', monster: '魔物技能', heal: '生命恢复', mana: '魔力恢复'};
const effectCodeLabels: Record<string, string> = {
    damage: '伤害', modifier: '属性变化', passive_percent: '被动属性提升', shield: '护盾', passive_recovery: '战斗恢复',
    attack_accuracy: '命中加成', heal: '治疗', dot: '持续伤害', passive_cost: '消耗降低', passive_flat: '被动属性加成',
    attack_critical: '暴击加成', hot: '持续治疗', reflect: '反伤', shield_break: '破盾', missing_hp_damage: '损失生命增伤',
    passive_low_hp: '低血量减伤', passive_damage: '伤害提升', passive_duration: '减益延长', summon: '召唤',
    attack_penetration: '防御穿透', shared_hit: '共享命中与暴击', passive_conversion: '属性转化',
    passive_equipment_percent: '装备精通属性提升', passive_equipment_flat: '装备精通属性加成',
};
const effectStatLabels: Record<string, string> = {
    reduction: '伤害减免', weapon_attack: '武器攻击', attack: '攻击', defense: '防御', mp: '魔力',
    damage_taken: '受到伤害', elite_boss: '对精英与首领', strength_to_magic: '力量转为魔法攻击', spirit_to_magic: '精神转为魔法攻击',
    burn: '灼烧', poison: '中毒', debuff: '减益效果', contract: '契约',
};

const identifierLabels: Record<string, string> = {
    plain: '普通型', agile: '敏捷型', armored: '重装型', magic: '魔法型', normal: '普通', elite: '精英', boss: '首领',
    white: '白装', blue: '蓝装', gold: '金装',
};

function lookup(tables: CombatCatalog['tables'], table: string, id: string): CombatRow | undefined {
    return tables[table]?.find(row => row.id === id);
}

function named(tables: CombatCatalog['tables'], table: string, id: string): string {
    return lookup(tables, table, id)?.name || '';
}

function professionName(tables: CombatCatalog['tables'], id: string): string {
    return named(tables, 'professions', id) || named(tables, 'professions', `job.${id}`) || '';
}

function skillName(tables: CombatCatalog['tables'], id: string): string {
    const direct = named(tables, 'skills', id);
    if (direct) return direct;
    const level = lookup(tables, 'skillLevels', id);
    const parent = level ? named(tables, 'skills', level.skillId || '') : '';
    return parent && level ? `${parent}（第${level.rank}阶）` : '';
}

function poolName(tables: CombatCatalog['tables'], id: string): string {
    if (!id) return '';
    const dungeonId = id.replace(/^pool\./, 'dungeon.');
    const dungeon = named(tables, 'dungeons', dungeonId);
    return dungeon ? `${dungeon}装备池` : '区域装备池';
}

function affixName(tables: CombatCatalog['tables'], id: string): string {
    const stat = lookup(tables, 'affixes', id)?.stat || '';
    const label = statLabels[stat] || effectStatLabels[stat] || '';
    return label ? `${label}词条` : '';
}

function referenceValue(table: string, field: string, value: string, row: CombatRow, tables: CombatCatalog['tables']): string {
    if (field === 'monsterId' || field === 'bossId') return named(tables, 'monsters', value) || '未匹配魔物';
    if (field === 'dungeonId') return named(tables, 'dungeons', value) || '未匹配地牢';
    if (field === 'equipmentId') return named(tables, 'equipmentTemplates', value) || '未匹配装备';
    if (field === 'itemId') {
        if (row.itemKind === 'equipment_pool') return poolName(tables, value);
        return named(tables, 'materials', value) || named(tables, 'potions', value) || named(tables, 'equipmentTemplates', value) || '未匹配物品';
    }
    if (field === 'poolId') return poolName(tables, value);
    if (field === 'affixId') return affixName(tables, value) || '未匹配词条';
    if (field === 'professionId' || field === 'parentId') return professionName(tables, value) || '未匹配职业';
    if (field === 'rootJob') return professionName(tables, value) || '全职业';
    if (field === 'skillId') return skillName(tables, value) || '未匹配技能';
    if (field === 'skillLevelId') return skillName(tables, value) || '未匹配技能';
    if (field === 'requiredMastery') return value.split(';').map(id => skillName(tables, id)).filter(Boolean).join('、') || '无';
    if (field === 'dropTableId') {
        const monster = named(tables, 'monsters', row.monsterId || '');
        return monster ? `${monster}掉落规则` : '魔物掉落规则';
    }
    if (field === 'profile') return profileLabels[value] || '未分类模板';
    if (field === 'slot') return equipmentSlotLabel(value, row.equipmentType);
    if (field === 'equipmentType') return equipmentTypeLabels[value] || '其他装备类型';
    if (field === 'group') return equipmentTypeLabels[value] || groupLabels[value] || '其他效果分组';
    if (field === 'grip') return gripLabels[value] || '其他持握方式';
    if (field === 'rank') return table === 'monsters' ? rankLabels[value] || '其他级别' : `${value}阶`;
    if (field === 'stat') return statLabels[value] || effectStatLabels[value] || value;
    if (field === 'actionKind') return actionLabels[value] || value;
    if (field === 'itemKind') return itemKindLabels[value] || '其他掉落';
    if (field === 'condition') return conditionLabels[value] || '特殊条件';
    if (field === 'damageType') return damageTypeLabels[value] || value;
    if (field === 'target') return targetLabels[value] || value;
    if (field === 'kind') return kindLabels[value] || value;
    if (field === 'code') return effectCodeLabels[value] || '其他技能效果';
    if (field === 'unit') return value === 'ratio' ? '比例' : value === 'integer' ? '整数' : value;
    if (field === 'enabled' || field === 'bossOnly') return value === '1' ? '是' : value === '0' ? '否' : value;
    return identifierLabels[value] || value;
}

function rowTitle(table: string, row: CombatRow): string {
    if (row.name) return row.name;
    if (table === 'rules') return ruleLabels[row.id] || '其他冒险规则';
    if (table === 'monsterProfiles') return `${profileLabels[row.id] || '其他'}属性模板`;
    if (table === 'monsterRanks') return `${rankLabels[row.id] || '其他'}魔物`;
    if (table === 'qualities') return qualityLabels[row.id] || '其他品质';
    if (table === 'affixes') return `${statLabels[row.stat || ''] || effectStatLabels[row.stat || ''] || '属性'}词条`;
    return '';
}

function exportRow(table: string, row: CombatRow, tables: CombatCatalog['tables']): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const title = rowTitle(table, row);
    if (title) result['名称'] = title;

    for (const [field, value] of Object.entries(row)) {
        if (field === 'id' || field === 'name' || value === undefined || value === '') continue;
        const label = field === 'rank' ? table === 'monsters' ? '魔物级别' : '技能阶数' : fieldLabels[field];
        if (!label) continue;
        result[label] = referenceValue(table, field, value, row, tables);
    }
    return result;
}

export function adventureCatalogExportSheets(catalog: CombatCatalog): CatalogExportSheet[] {
    const tables = Object.entries(catalog.tables);
    const sheets: CatalogExportSheet[] = [
        {name: '导出说明', rows: [{说明: '按冒险图鉴的中文名称整理；保留规划所需的数值，已将关联编号转换为名称，并隐藏内部编号与图片资源。'}]},
        ...tables.map(([key, rows]) => ({name: tableLabels[key] || '其他图鉴配置', rows: rows.map(row => exportRow(key, row, catalog.tables))})),
        {
            name: '魔物等级预览',
            rows: catalog.monsterPreviews.map(preview => ({
                名称: named(catalog.tables, 'monsters', preview.id) || '未匹配魔物',
                等级: preview.level,
                ...Object.fromEntries(Object.entries(preview.attributes).map(([key, value]) => [statLabels[key] || effectStatLabels[key] || key, value])),
            })),
        },
    ];
    return sheets;
}
