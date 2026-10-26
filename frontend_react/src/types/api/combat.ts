import type {BattleAppearanceOverlays} from './setting';

export interface CombatRow {id: string; name?: string; [key: string]: string | undefined}
export interface CombatCatalog {version: string; tables: Record<string, CombatRow[]>; monsterPreviews: {id: string; level: number; attributes: Record<string, number | string>}[]}
export interface EquipmentSnapshot {templateId: string; name: string; slot: string; element?: string; equipmentType?: string; grip?: string; level: number; quality: string; value: string; stats: Record<string, number>; affixes: {id: string; stat: string; value: number}[]}
export interface EquipmentWearRules {version: number; slot: string; equipmentType: string; grip: string; jobLevels: Record<string, number>}
export interface CombatEquipment {id: string; templateId?:string; displayType?: string; snapshot: EquipmentSnapshot; rules?: EquipmentWearRules; bound: boolean; locked: boolean; marketListed?: boolean; marketListingId?: string | null; value: string}
export interface CombatResourceRecovery {amount: number; nextAt: string | null; fullAt: string | null}
export interface CombatRecovery {serverNow: string; nextAt: string | null; hp: CombatResourceRecovery; mp: CombatResourceRecovery}
export interface CombatProfile {
    discoveries: {encountered: string[]; defeated: string[]; equipment: string[]}; initialized: boolean; actorId: string; progression: {level: number; experience: number; job: string; stats: Record<string, number>; skills: Record<string, number>};
    attributes: Record<string, number | string>; hp: number; mp: number; loadout: Record<string, string>; equipment: CombatEquipment[];
    skills: (CombatRow & {rank: number; effects: CombatRow[]; parameters: CombatRow})[];
    potions: (CombatRow & {owned: number})[]; materials: (CombatRow & {owned: number})[]; activeExplorationId: string | null; promotionOptions: CombatRow[]; promotionBusy: boolean;
    reselectOptions: CombatRow[]; reselectBlocked: string; restUntil: string | null;
    recovery?: CombatRecovery | null;
}
export interface Combatant {name: string; level: number; hp: number; mp: number; stats: Record<string, number | string>; skills?: Record<string, number>; rank?: string; bard?: {beats?: number; melody?: {skillId: string; expires: number; extended: boolean}}; states: {code: string; name: string; remaining?: number; value?: number; sourceId?: string; expires?: number; music?: boolean; melody?: boolean; echo?: boolean}[]}
/** Derived from existing exploration state, never persisted as animation data. */
export interface CombatVisualSnapshot {dungeonId:string;jobId:string;weaponId:string;monsterId:string;encounterId:string;headImageUrl?:string;headBehindBody?:boolean;characterImageUrl?:string;appearanceOverlays?:BattleAppearanceOverlays}
export interface CombatAction {kind: string; music?: boolean; stacks?: number; value?: number; stat?: string; expires?: number; duration?: number; actor?: string; target?: string; action?: string; name?: string; element?: string; hit?: boolean; critical?: boolean; damage?: number; absorbed?: number; mp_paid?: number; healing?: number; restored?: number; experience?: number; monster?: {id?: string; name: string; level: number; rank?: string}; rewards?: CombatReward[]}
export interface CombatReward {id: string; kind: string; item: EquipmentSnapshot | CombatRow; equipmentId?: string; quantity?: number; elapsedSeconds: number}
export interface CombatEvent {timelineLabel?: string; id: string; sequence: number; kind: string; elapsedSeconds: number; payload: {sharedEventId?: string; events?: PartyAction[]; report?: string; reason?: string}; createdAt: string}
export interface CombatFood {
    recipeId: string; name: string; stars: number; quantity: number; version: number;
    effects: Record<string, number>; summary: string;
    consumed: {inventoryId: string; ownerId: string; actorId: string; sku: string; stars: number;
        quantity: number; lots: {quantity: number; price: string}[]}[];
}
export interface CombatElixirCarry {recipeId: string; name: string; stars: number; count: number; remaining: number; summary: string; trigger: Record<string, string | number>}
export interface CombatResult {energy?: number; experience?: number; kills?: number; partyKills?:number; potionsUsed?: Record<string, number>; elixirsUsed?: Record<string, number>; elixirsCarried?: {recipeId: string; stars: number; count: number}[]; returnedElixirs?: {recipeId: string; stars: number; count: number}[]; rewards?: CombatReward[]; report?: string; food?: CombatFood | null; foodAdjustment?: string}
export interface CombatSnapshot {party?:AdventurePartySnapshot|null;visual?:CombatVisualSnapshot;promotionBusy?:boolean;remainingSeconds?: number | null; canControl: boolean; id: string; actorId: string; version: number; stage: string; status: string; reason: string; elapsedSeconds: number; durationSeconds: number; nextTickAt: string | null; player: Combatant | null; enemy: Combatant | null; potions: Record<string, number>; elixirs?: CombatElixirCarry[]; result: CombatResult; events: CombatEvent[]; latestCursor: number; nextCursor: number; hasMore: boolean}
export interface CombatHistory {list: {id: string; status: string; elapsedSeconds: number; result: CombatResult; createdAt: string}[]; total: number; page: number}
export interface CombatHistoryStorage {
    currentVersion: string; catalogCount: number; syncCatalogCount: number;
    frozenResidents: number; residentCount: number; frozenExplorations: number; activeExplorations: number;
    versions: {version: string; bytes: number; synchronized: boolean; activeExplorations: number; residents: number}[];
}
export interface CombatConfig {dailyMinutes: number; historyStorage?: CombatHistoryStorage}

export interface AdventureOption {id:string;revision:number;dungeonId:string;dungeonName:string;durationSeconds:number;endsAt:string;members:{actorId:string;name:string;level:number;jobId:string;jobName:string}[]}
export interface AdventureOptions {solo:boolean;parties:AdventureOption[]}
export interface PartyCombatant extends Combatant {visual?:CombatVisualSnapshot;id:string;jobId?:string;jobName?:string;templateId?:string;revived?:boolean;taunt?:{actorId:string;expires:number}}
export interface PartyRoll {rewardId:string;winnerId:string;rounds:Record<string,number>[];reward:CombatReward}
export interface PartyAction extends CombatAction {actorId?:string;targetId?:string;rolls?:PartyRoll[]}
export interface AdventurePartySnapshot {id:string;version:number;leaderId:string;status:string;dungeonId:string;teamKills:number;players:PartyCombatant[];enemies:PartyCombatant[];wave:number;round:number;phase:string;roundSeconds:number;actionOrder:string[];endsAt:string;events:{id:string;sequence:number;kind:string;payload:{round?:number;events?:PartyAction[];actionOrder?:string[]}}[]}
