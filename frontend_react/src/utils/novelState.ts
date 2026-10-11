import type {Entity} from '../types/api/novel';
const words: Record<string, string> = {life: '生死', location: '位置', injury: '伤势', items: '物品', holder: '持有人', motivation: '动机', relationship: '关系', knowledge: '知晓', uncertain: '未确定信息', identity: '身份', alive: '存活', dead: '死亡', unknown: '未知', suspected_dead: '疑似死亡', certain: '确定', suspected: '怀疑', rumor: '传闻', misbelief: '误信'};
function describe(value: unknown, entities: Entity[]): string {
    if (Array.isArray(value)) return value.map(v => describe(v, entities)).join('、');
    if (value && typeof value === 'object') {const item = value as Record<string, unknown>;if (item.description) return `${words[String(item.certainty)] || ''}：${item.description}`;return Object.entries(item).map(([key, val]) => `${words[key] || key}：${describe(val, entities)}`).join('；');}
    const text = String(value ?? '未知');return entities.find(e => e.id === text)?.name || words[text] || text;
}
export function describeNovelState(state: Record<string, unknown>, entities: Entity[]) {
    return Object.entries(state).map(([key, value]) => `${words[key] || key}：${describe(value, entities)}`).join('；') || '尚无已采用正文事实';
}
