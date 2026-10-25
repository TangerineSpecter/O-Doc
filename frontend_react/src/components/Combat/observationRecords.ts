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
    const groups: {key: string; seconds: number; label?: string; rows: CombatEvent[]}[] = [];
    for (const event of events) {
        const previous = groups[groups.length - 1];
        if (previous?.seconds === event.elapsedSeconds && previous?.label === event.timelineLabel) previous.rows.push(event);
        else groups.push({key: event.id, seconds: event.elapsedSeconds, label: event.timelineLabel, rows: [event]});
    }
    return groups;
}

export interface ParsedSettlement {
    actorName?: string;
    minutes?: number;
    kills?: number;
    experience?: number;
    energy?: number;
    reason?: string;
    loots?: {name: string; count: number}[];
    potions?: number;
    elixirs?: number;
    level?: number;
    raw: string;
}

export function parseSettlementReport(text?: string): ParsedSettlement | null {
    if (!text || typeof text !== 'string') return null;
    const isReport = text.includes('探索') && (text.includes('击败') || text.includes('经验') || text.includes('收获') || text.includes('体力'));
    if (!isReport) return null;

    const minutesMatch = text.match(/探索\s*(\d+)\s*分钟/);
    const killsMatch = text.match(/击败\s*(\d+)\s*只(?:怪物|魔物)?/);
    const expMatch = text.match(/获得\s*(\d+)\s*经验/);
    const energyMatch = text.match(/消耗\s*(\d+)\s*体力/);
    const potionsMatch = text.match(/消耗药剂\s*(\d+)\s*瓶/);
    const elixirsMatch = text.match(/炼金药水使用\s*(\d+)\s*瓶/);
    const levelMatch = text.match(/返回\s*Lv\.(\d+)/);
    const actorMatch = text.match(/^([^，,。.]+?)探索\d+分钟/);

    const lootMatch = text.match(/收获[：:](.*?)[。.]/);
    const loots: {name: string; count: number}[] = [];
    if (lootMatch && lootMatch[1]) {
        const lootParts = lootMatch[1].split(/[、,，]/);
        const countMap = new Map<string, number>();
        for (const part of lootParts) {
            const m = part.trim().match(/^(.*?)[×xX](\d+)$/);
            if (m) {
                const name = m[1].trim();
                const count = parseInt(m[2], 10) || 1;
                countMap.set(name, (countMap.get(name) || 0) + count);
            } else if (part.trim()) {
                const name = part.trim();
                countMap.set(name, (countMap.get(name) || 0) + 1);
            }
        }
        for (const [name, count] of countMap.entries()) {
            loots.push({name, count});
        }
    }

    let reason = text;
    if (actorMatch) reason = reason.replace(actorMatch[0], '');
    if (minutesMatch) reason = reason.replace(minutesMatch[0], '');
    if (killsMatch) reason = reason.replace(killsMatch[0], '');
    if (expMatch) reason = reason.replace(expMatch[0], '');
    if (energyMatch) reason = reason.replace(energyMatch[0], '');
    if (potionsMatch) reason = reason.replace(potionsMatch[0], '');
    if (elixirsMatch) reason = reason.replace(elixirsMatch[0], '');
    if (levelMatch) reason = reason.replace(levelMatch[0], '');
    if (lootMatch) reason = reason.replace(lootMatch[0], '');
    reason = reason.replace(/[，,；;。.\s]+/g, ' ').trim();

    return {
        actorName: actorMatch ? actorMatch[1] : undefined,
        minutes: minutesMatch ? parseInt(minutesMatch[1], 10) : undefined,
        kills: killsMatch ? parseInt(killsMatch[1], 10) : undefined,
        experience: expMatch ? parseInt(expMatch[1], 10) : undefined,
        energy: energyMatch ? parseInt(energyMatch[1], 10) : undefined,
        potions: potionsMatch ? parseInt(potionsMatch[1], 10) : undefined,
        elixirs: elixirsMatch ? parseInt(elixirsMatch[1], 10) : undefined,
        level: levelMatch ? parseInt(levelMatch[1], 10) : undefined,
        reason: reason || undefined,
        loots: loots.length > 0 ? loots : undefined,
        raw: text,
    };
}

export function sanitizeGroupRows(rows: CombatEvent[]): CombatEvent[] {
    const hasMeaningful = rows.some(r => (r.payload.events && r.payload.events.length > 0) || Boolean(r.payload.report));
    if (!hasMeaningful) {
        const result: CombatEvent[] = [];
        let lastMsg = '';
        for (const r of rows) {
            const msg = observationEventMessage(r);
            if (msg !== lastMsg) {
                result.push(r);
                lastMsg = msg;
            }
        }
        return result.length > 0 ? result : [rows[0]];
    }
    return rows.filter(r => {
        if (r.payload.events && r.payload.events.length > 0) return true;
        if (r.payload.report) return true;
        if (r.payload.reason) return true;
        if (r.kind !== 'round') return true;
        return false;
    });
}

const eventLabels: Record<string, string> = {
    request: '探索请求已接受',
    plan: '出发计划已确认',
    depart: '出发，装备与药剂已就绪',
    pause: '探索暂停，等待自动恢复',
    resume: '重整旗鼓，继续探索',
    terminal: '探索结束结算',
};
export function observationEventMessage(event: CombatEvent) {
    return event.payload.report || event.payload.reason || eventLabels[event.kind] || '探索动态更新';
}
