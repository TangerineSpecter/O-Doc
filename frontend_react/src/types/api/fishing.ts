export interface FishingFish {
    name: string; spot: string; level: number; preferred: string[]; accepted: string[];
    hours: [number, number][]; weightRange: [number, number]; value: string; king: boolean; weight: number;
}
export interface FishingRules {
    version: string; spots: Record<string, {name: string; requiredLevel: number}>;
    baits: Record<string, {name: string; price: string}>; fish: Record<string, FishingFish>;
    rod: {id: string; name: string; bonus: number}; intervalSeconds: number; energyCost: number;
    durations: number[]; maxLevel: number;
    emptyProbability: number; junkProbability: number; kingProbability: number;
}
export interface FishingDiscovery {count: number; maxWeight: number; firstCaughtAt: string; recordActor: string}
export interface FishingCatalog {rules: FishingRules; discovery: Record<string, FishingDiscovery>}
export interface FishingResident {
    id: string; name: string; level: number; experience: number; progress: number; needed: number;
    baits: {id: string; name: string; quantity: number}[];
    spots: {id: string; name: string; requiredLevel: number}[]; recentCatches: string[];
}
export interface FishingCatch {fishId: string; name: string; king: boolean; weight: number; experience: number; caughtAt: string}
export interface FishingEvent {
    id: string; kind: string; createdAt: string;
    data: {key?: string; value?: string; bait?: string; outcome?: {kind: string; fishId?: string; name?: string};
        catch?: FishingCatch; probability?: number; experience?: number; player?: string; king?: string;
        result?: string; wins?: number; losses?: number; reason?: string; fishId?: string};
}
export interface FishingTrip {
    id: string; actorId: string; actorName: string;
    status: 'preparing' | 'active' | 'duel' | 'paused' | 'completed' | 'cancelled';
    plan: {spot?: string; minutes?: number; baits: string[]; complete?: boolean};
    casts: number; carried: {name: string; quantity: number; sku: string}[];
    duel: {fishId: string; wins: number; losses: number; round: number} | null;
    error: string; reason: string; catches: {name: string; quantity: number}[]; experience: number;
    authorized: boolean; departedAt: string | null; deadline: string | null; createdAt: string; endedAt: string | null;
}
export interface FishingDetail extends FishingTrip {events: FishingEvent[]; eventTotal: number; eventPage: number; rules: FishingRules}
export interface FishingOverview {enabled: boolean; active: FishingTrip[]; items: FishingTrip[]; total: number; page: number; residents: FishingResident[]}
