export interface CombatRow {id: string; name?: string; [key: string]: string | undefined}
export interface CombatCatalog {version: string; tables: Record<string, CombatRow[]>; monsterPreviews: {id: string; level: number; attributes: Record<string, number | string>}[]}
export interface EquipmentSnapshot {templateId: string; name: string; slot: string; level: number; quality: string; value: string; stats: Record<string, number>; affixes: {id: string; stat: string; value: number}[]}
export interface CombatEquipment {id: string; snapshot: EquipmentSnapshot; bound: boolean; locked: boolean; value: string}
export interface CombatProfile {
    discoveries: {encountered: string[]; defeated: string[]; equipment: string[]}; initialized: boolean; actorId: string; progression: {level: number; experience: number; job: string; stats: Record<string, number>; skills: Record<string, number>};
    attributes: Record<string, number | string>; hp: number; mp: number; loadout: Record<string, string>; equipment: CombatEquipment[];
    skills: (CombatRow & {rank: number; effects: CombatRow[]; parameters: CombatRow})[];
    potions: (CombatRow & {owned: number})[]; materials: (CombatRow & {owned: number})[]; activeExplorationId: string | null; promotionOptions: CombatRow[]; restUntil: string | null;
}
export interface Combatant {name: string; level: number; hp: number; mp: number; stats: Record<string, number | string>; states: {code: string; name: string; remaining?: number}[]}
export interface CombatAction {kind: string; actor?: string; target?: string; action?: string; name?: string; hit?: boolean; critical?: boolean; damage?: number; healing?: number; restored?: number; experience?: number; monster?: {name: string; level: number}; rewards?: CombatReward[]}
export interface CombatReward {id: string; kind: string; item: EquipmentSnapshot | CombatRow; equipmentId?: string; quantity?: number; elapsedSeconds: number}
export interface CombatEvent {id: string; sequence: number; kind: string; elapsedSeconds: number; payload: {events?: CombatAction[]; report?: string; reason?: string}; createdAt: string}
export interface CombatResult {energy?: number; experience?: number; kills?: number; potionsUsed?: Record<string, number>; rewards?: CombatReward[]; report?: string}
export interface CombatSnapshot {canControl: boolean; id: string; actorId: string; version: number; stage: string; status: string; reason: string; elapsedSeconds: number; durationSeconds: number; nextTickAt: string | null; player: Combatant | null; enemy: Combatant | null; potions: Record<string, number>; result: CombatResult; events: CombatEvent[]; latestCursor: number; nextCursor: number; hasMore: boolean}
export interface CombatHistory {list: {id: string; status: string; elapsedSeconds: number; result: CombatResult; createdAt: string}[]; total: number; page: number}
export interface CombatConfig {dailyMinutes: number; autoEnabled: boolean}
