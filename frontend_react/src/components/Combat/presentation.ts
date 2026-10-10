import type {CombatAction, CombatEvent, CombatRow} from '../../types/api/combat';
export const statLabels: Record<string, string> = {physical_attack:'物理攻击',magic_attack:'魔法攻击',physical_defense:'物理防御',magic_defense:'魔法防御',hp_max:'最大生命',mp_max:'最大魔力',critical_damage:'暴击伤害',strength: '力量', dexterity: '敏捷', intelligence: '智力', vitality: '体质', spirit: '精神', luck: '运气', hpMax: '最大生命', mpMax: '最大魔力', physicalAttack: '物理攻击', magicAttack: '魔法攻击', physicalDefense: '物理防御', magicDefense: '魔法防御', healing: '治疗能力', accuracy: '命中', evasion: '闪避', critical: '暴击', criticalDamage: '暴击伤害'};
export const slotLabels: Record<string, string> = {weapon: '武器', head: '头饰', body: '护甲', hands: '手套', feet: '靴子', accessory: '护符'};
export const statusLabels: Record<string, string> = {preparing: '准备出发', active: '探索中', battle: '交战', searching: '寻找怪物', paused: '等待自动恢复', completed: '探索完成', recalled: '已召回', fallen: '倒地', failed: '准备失败', exhausted: '资源不足', interrupted: '系统中断', done: '已结束'};
export const qualityLabels: Record<string, string> = {white: '白装', blue: '蓝装', gold: '金装'};
export function appendCombatEvents(previous: CombatEvent[], incoming: CombatEvent[]) {
    const records = new Map(previous.map(row => [row.id, row]));
    for (const row of incoming) records.set(row.id, row);
    return [...records.values()].sort((a, b) => a.sequence - b.sequence);
}
export function actionText(action: CombatAction) {
    if (action.kind === 'kill') return `击败 ${action.monster?.name || '怪物'}，经验 +${action.experience || 0}`;
    if (action.kind === 'encounter') return `遭遇 ${action.name}`;
    return `${action.actor || ''} · ${action.action || action.kind}${action.hit === false ? '（未命中）' : action.damage != null ? ` → ${action.target || ''} ${action.critical ? '暴击 ' : ''}${action.damage} 伤害` : action.healing != null || action.restored != null ? ` +${action.healing ?? action.restored}` : ''}`;
}
export const elapsed = (seconds: number) => `${Math.floor(seconds / 60)}分${seconds % 60}秒`;

const effectNames: Record<string, string> = {damage:'伤害', heal:'治疗', shield:'护盾', hot:'持续治疗', dot:'持续伤害', modifier:'属性变化', passive_cost:'魔力消耗降低', passive_percent:'属性增幅', passive_flat:'属性加成', passive_conversion:'属性转化', passive_damage:'伤害增幅', passive_low_hp:'低血量减伤', passive_duration:'减益延长', attack_critical:'本次暴击加成', attack_accuracy:'本次命中加成', attack_penetration:'防御穿透', missing_hp_damage:'损失生命伤害加成', shared_hit:'共享命中与暴击', attack_lifesteal:'吸血'};
const effectStats: Record<string, string> = {physical_attack:'物理攻击', magic_attack:'魔法攻击', physical_defense:'物理防御', magic_defense:'魔法防御', hp_max:'最大生命', mp_max:'最大魔力', critical_damage:'暴击伤害', weapon_attack:'武器攻击', attack:'攻击', defense:'防御', reduction:'减伤', damage_taken:'受到伤害', elite_boss:'对精英与Boss', strength_to_magic:'力量转为魔法攻击', spirit_to_magic:'精神转为魔法攻击', poison:'中毒', burn:'灼烧'};
export function effectText(effect: CombatRow) {
    const stat = statLabels[effect.stat || ''] || effectStats[effect.stat || ''] || '';
    const value = Number(effect.value || 0);
    const scaled = ['damage','heal','shield','hot','dot'].includes(effect.code || '');
    const percent = ['modifier','passive_percent','passive_cost','passive_damage','passive_low_hp','attack_critical','attack_accuracy','attack_penetration','missing_hp_damage','attack_lifesteal'].includes(effect.code || '') || ['accuracy','evasion','critical','critical_damage'].includes(effect.stat || '');
    const magnitude = effect.code === 'shared_hit' ? '' : scaled ? `${value} ×${stat}` : `${stat}${percent ? `${Number((value*100).toFixed(1))}%` : value}`;
    return `${effectNames[effect.code || ''] || '技能效果'} ${magnitude}${Number(effect.hits)>1 ? `，${effect.hits}段` : ''}${Number(effect.duration)>0 ? `，持续${effect.duration}回合` : ''}${effect.chance && Number(effect.chance)<1 ? `，触发率${Number(effect.chance)*100}%` : ''}`.trim();
}
