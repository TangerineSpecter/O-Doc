import type {CombatEvent, CombatReward, EquipmentSnapshot} from '../../types/api/combat';

export interface ObservationLoot {key: string; reward: CombatReward; quantity: number; times: number[]}
export function isEquipmentReward(reward: CombatReward): reward is CombatReward & {item: EquipmentSnapshot} {
    return reward.kind === 'equipment' && 'templateId' in reward.item;
}

/** Stack materials by stable SKU; randomized equipment remains individual. */
export function observationLoot(rewards: CombatReward[]): ObservationLoot[] {
    const slots = new Map<string, ObservationLoot>();
    for (const reward of rewards) {
        const materialId = 'id' in reward.item ? reward.item.id : undefined;
        const key = reward.kind === 'material' && materialId ? `material:${materialId}` : reward.id;
        const existing = slots.get(key);
        if (existing) {existing.quantity += reward.quantity ?? 1; existing.times.push(reward.elapsedSeconds);}
        else slots.set(key, {key, reward, quantity: reward.quantity ?? 1, times: [reward.elapsedSeconds]});
    }
    return [...slots.values()];
}

export function observationKills(events: CombatEvent[]) {
    return events.flatMap(row => (row.payload.events || []).filter(action => action.kind === 'kill')
        .map((action, index) => ({key: `${row.id}:${index}`, seconds: row.elapsedSeconds, action})));
}

/** Merge adjacent facts at the same elapsed time without changing their sequence. */
export function observationEventGroups(events: CombatEvent[]) {
    const groups: {key: string; seconds: number; rows: CombatEvent[]}[] = [];
    for (const event of events) {
        const previous = groups[groups.length - 1];
        if (previous?.seconds === event.elapsedSeconds) previous.rows.push(event);
        else groups.push({key: event.id, seconds: event.elapsedSeconds, rows: [event]});
    }
    return groups;
}

const eventLabels: Record<string, string> = {request: '探索请求已接受', plan: '出发计划已确认',
    depart: '出发，装备与药剂已备齐', pause: '探索暂停', resume: '继续探索'};
export function observationEventMessage(event: CombatEvent) {
    return event.payload.report || event.payload.reason || eventLabels[event.kind] || '探索状态已更新';
}
