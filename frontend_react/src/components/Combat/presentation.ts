import type {CombatEvent, CombatRow} from '../../types/api/combat';
export const elementOrder = ['water', 'fire', 'earth', 'wind', 'light', 'dark'] as const;
export const elementLabels: Record<string, string> = {water: '水', fire: '火', earth: '土', wind: '风', light: '光', dark: '暗'};
export const elementStatLabels: Record<string, string> = Object.fromEntries(elementOrder.flatMap(element => {
    const power = `${elementLabels[element]}属性强化`;
    const resist = `${elementLabels[element]}属性抗性`;
    return [[`${element}_power`, power], [`${element}_resist`, resist], [`${element}Power`, power], [`${element}Resist`, resist]];
}));
export const ratioStatKeys = new Set(['accuracy', 'evasion', 'critical', 'criticalDamage', 'critical_damage', ...Object.keys(elementStatLabels)]);
export function isRatioStat(key: string) {
    return ratioStatKeys.has(key) || ratioStatKeys.has(normalizeStatKey(key));
}
export function normalizeStatKey(k: string): string {
    return k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
export function formatRatio(value: number | string | null | undefined) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number)) return '-';
    const percent = Math.round(number * 10000) / 100;
    const text = Number.isInteger(percent) ? percent.toFixed(1) : percent.toFixed(2).replace(/0$/, '');
    return `${text}%`;
}
function formatEffectPercent(value: number) {
    const percent = Math.round(value * 10000) / 100;
    return `${percent.toFixed(2).replace(/\.?0+$/, '')}%`;
}
export function elementPhrase(element: string | undefined) {
    if (element === 'none') return '无属性';
    return elementLabels[element || ''] ? `${elementLabels[element || '']}属性` : '随武器属性';
}
export const statLabels: Record<string, string> = {physical_attack:'物理攻击',magic_attack:'魔法攻击',physical_defense:'物理防御',magic_defense:'魔法防御',hp_max:'最大生命',mp_max:'最大魔力',critical_damage:'暴击伤害',strength: '力量', dexterity: '敏捷', intelligence: '智力', vitality: '体质', spirit: '精神', luck: '运气', hpMax: '最大生命', mpMax: '最大魔力', physicalAttack: '物理攻击', magicAttack: '魔法攻击', physicalDefense: '物理防御', magicDefense: '魔法防御', healing: '治疗能力', accuracy: '命中', evasion: '闪避', critical: '暴击', criticalDamage: '暴击伤害', ...elementStatLabels};
export const slotLabels: Record<string, string> = {weapon: '武器', offhand: '副手', head: '头饰', body: '护甲', hands: '手套', feet: '靴子', accessory: '吊坠', ring_1: '戒指位 1', ring_2: '戒指位 2'};
export const equipmentTypeLabels: Record<string, string> = {instrument:'乐器',
    generic: '通用',
    cloth_armor: '布甲', heavy_armor: '重甲', leather_armor: '皮甲', light_armor: '轻甲', plate_armor: '板甲',
    magic_shield: '魔法盾', small_shield: '小盾', large_shield: '大盾',
    mage_staff: '法杖', two_handed_staff: '双手杖', holy_staff: '圣杖',
    long_sword: '长剑', axe: '战斧', bow: '长弓', dagger: '匕首', two_handed_sword: '双手剑',
    ring: '戒指', pendant: '吊坠',
};
export function equipmentSlotLabel(slot: string, equipmentType?: string) {
    return slot === 'accessory' && equipmentType === 'ring' ? '戒指' : slotLabels[slot] || slot;
}
export const statusLabels: Record<string, string> = {waiting_party:'等待下一波加入', preparing: '准备出发', active: '探索中', battle: '交战', searching: '寻找怪物', paused: '已暂停', promotion: '等待 Agent 转职', promotion_failed: '转职选择待重试', completed: '探索完成', recalled: '已召回', fallen: '倒地', failed: '准备失败', exhausted: '资源不足', interrupted: '系统中断', done: '已结束'};
export const qualityLabels: Record<string, string> = {white: '白装', blue: '蓝装', gold: '金装'};
export function appendCombatEvents(previous: CombatEvent[], incoming: CombatEvent[]) {
    const records = new Map(previous.map(row => [row.id, row]));
    for (const row of incoming) records.set(row.id, row);
    return [...records.values()].sort((a, b) => a.sequence - b.sequence);
}
export const elapsed = (seconds: number) => `${Math.floor(seconds / 60)}分${seconds % 60}秒`;

const effectNames: Record<string, string> = {damage:'伤害', heal:'治疗', shield:'护盾', shield_break:'破盾伤害', summon:'召唤伤害', reflect:'反伤', hot:'持续治疗', dot:'持续伤害', modifier:'属性变化', passive_cost:'魔力消耗降低', passive_percent:'属性增幅', passive_flat:'属性加成', passive_element:'属性精通', passive_recovery:'回合恢复', passive_equipment_percent:'装备精通增幅', passive_equipment_flat:'装备精通加成', passive_conversion:'属性转化', passive_damage:'伤害增幅', passive_low_hp:'低血量减伤', passive_duration:'减益延长', attack_critical:'本次暴击加成', attack_accuracy:'本次命中加成', attack_penetration:'防御穿透', missing_hp_damage:'损失生命伤害加成', shared_hit:'共享命中与暴击', attack_lifesteal:'吸血'};
const effectStats: Record<string, string> = {physical_attack:'物理攻击', magic_attack:'魔法攻击', physical_defense:'物理防御', magic_defense:'魔法防御', hp_max:'最大生命', mp_max:'最大魔力', critical_damage:'暴击伤害', weapon_attack:'武器攻击', attack:'攻击', defense:'防御', reduction:'减伤', damage_taken:'受到伤害', elite_boss:'对精英与Boss', strength_to_magic:'力量转为魔法攻击', spirit_to_magic:'精神转为魔法攻击', poison:'中毒', burn:'灼烧'};
/** Old immutable catalogs described per-round recovery using the solo round's seconds. */
export function skillDescription(description: string) {
    return description.replace(/^战斗中每\s*15\s*秒恢复/, '每个交战回合行动前恢复');
}

function bardEffectText(effect: CombatRow): string | undefined {
    const v=Number(effect.value||0), rounds=Number(effect.duration||0), percent=`${Number((v*100).toFixed(2))}%`;
    const group=String(effect.group||'');
    if(effect.code==='passive_equipment_duration') return `头、身体、手、脚四件皮甲齐穿时，所有音律效果持续时间 +${v}回合（伤害、冷却、层数不变）`;
    const passive:Record<string,string>={passive_music_cost:`辅助乐曲耗蓝降低${percent}`,passive_magic_penetration:`直接魔法攻击忽略${percent}魔防`,passive_melody_power:`主旋律增益数值乘以${Number((1+v).toFixed(2))}`,passive_bard_sanctuary:`自己音律减益影响的敌人对友方伤害降低${percent}，计入60%减伤上限`,passive_bard_echo:`直接攻击命中后${percent}概率随机给单名队友攻强8%、命中5个百分点或暴击3个百分点，持续2回合，每次行动最多一次`,passive_bard_resonance:`对带有自己共振的敌人，自身直接伤害提高${percent}`};
    if(effect.code&&passive[effect.code])return passive[effect.code];
    if(effect.code!=='bard_music')return undefined;
    if(group==='encourage')return `一名存活友方物攻与魔攻提高${percent}，持续${rounds}回合`;
    if(group==='melody_attack')return `全体存活友方物攻与魔攻提高${percent}，持续${rounds}回合；主旋律互斥，同类取最高`;
    if(group==='melody_guard')return `全体存活友方减伤${percent}，持续${rounds}回合；主旋律互斥`;
    if(group==='requiem')return `全体敌人物攻与魔攻降低${percent}，持续${rounds}回合，Boss减半`;
    const extras:Record<string,string>={accuracy_break:`，降低命中，持续${rounds}回合`,silence:`，封主动技能${rounds}回合，可普攻；Boss成功率50%`,beats:'，至少一段命中获得1层节拍，最多3层',beat_finisher:'，3层节拍时消耗并强化终曲',resonance:`，叠加1层自身共振，最多3层，持续${rounds}回合`,resonance_finisher:'，命中消耗自己的共振追加伤害',extend_melody:'，当前主旋律延长1回合，每首最多一次'};
    return `${elementPhrase(effect.element)}：${Number(effect.hits)>1?`${effect.hits}段，每段`:''}${v}倍魔攻${extras[group]||''}`;
}

export function effectText(effect: CombatRow) {
    const music=bardEffectText(effect);
    if(music)return music;
    const stat = statLabels[effect.stat || ''] || effectStats[effect.stat || ''] || '';
    const value = Number(effect.value || 0);
    if (effect.code === 'passive_tiered_reduction') {
        const percent = (factor: number) => Number((value * factor * 100).toFixed(2));
        return `生命低于50%时减伤 ${percent(1)}%；低于30%时减伤 ${percent(2)}%（2倍）；低于10%时减伤 ${percent(4)}%（4倍），按受击前血线取最高档`;
    }
    if (effect.code === 'passive_equipment_lifesteal') {
        return `装备双手剑时，普攻和直接物理技能按实际扣血的 ${Number((value * 100).toFixed(2))}% 恢复自身生命（不含护盾吸收、过量伤害、持续伤害和反伤）`;
    }
    if (effect.code === 'passive_recovery') {
        const resource = effect.stat === 'hp_max' ? '生命' : '法力';
        return `每个交战回合行动前恢复最大${resource}的 ${Number((value * 100).toFixed(2))}%`;
    }
    const scaled = ['damage','heal','shield','shield_break','summon','hot','dot'].includes(effect.code || '');
    const percent = ['modifier','reflect','passive_percent','passive_element','passive_equipment_percent','passive_cost','passive_damage','passive_low_hp','attack_critical','attack_accuracy','attack_penetration','missing_hp_damage','attack_lifesteal'].includes(effect.code || '') || isRatioStat(effect.stat || '');
    const magnitude = effect.code === 'shared_hit' ? '' : scaled ? `${value} ×${stat}` : `${stat}${percent ? formatEffectPercent(value) : value}`;
    const condition = String(effect.code || '').startsWith('passive_equipment_')
        ? `（${String(effect.group || '').endsWith('_armor_set') ? '头、身体、手、脚四件齐穿' : '装备'}${equipmentTypeLabels[String(effect.group || '').replace(/_set$/, '')] || effect.group || '对应类型'}时）`
        : '';
    const typed = ['damage', 'dot', 'summon', 'shield_break'].includes(effect.code || '') && effect.group !== 'poison'
        ? `，${elementPhrase(effect.element)}` : '';
    return `${effectNames[effect.code || ''] || '技能效果'} ${magnitude}${typed}${condition}${Number(effect.hits)>1 ? `，${effect.hits}段` : ''}${Number(effect.duration)>0 ? `，持续${effect.duration}回合` : ''}${effect.chance && Number(effect.chance)<1 ? `，触发率${Number(effect.chance)*100}%` : ''}`.trim();
}
const typedEffectCodes = new Set(['damage', 'dot', 'summon', 'shield_break', 'bard_music']);
export function elementNotes(effects: CombatRow[]) {
    const notes: string[] = [];
    for (const effect of effects) {
        if (typedEffectCodes.has(effect.code || '') && effect.group !== 'poison' && (effect.code !== 'bard_music' || !!effect.element)) notes.push(elementPhrase(effect.element));
        if (effect.code === 'passive_element') notes.push(statLabels[effect.stat || ''] || '');
    }
    return [...new Set(notes.filter(Boolean))];
}
