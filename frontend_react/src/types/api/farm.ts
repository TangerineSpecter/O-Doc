export interface PlantingSkill {level: number; experience: number; levelFloor: number; nextLevelExperience: number | null; progress: number}
export interface FertilizerRule {name: string; basePrice: number; fluctuation: number; qualityBonus: number; yieldPercentage: number}
export const cropKinds = ['radish', 'potato', 'corn', 'peanut', 'soybean', 'strawberry', 'pumpkin', 'sunflower', 'wheat', 'rice', 'tomato', 'cabbage', 'cucumber', 'eggplant', 'chili', 'onion'] as const;
export type CropKind = typeof cropKinds[number];
export type AnimalKind = 'chicken' | 'cow' | 'sheep';
export type BuildingKind = 'coop' | 'barn';
export interface CropRule {name: string; growthSeconds: number; seedPrice: number; yield: number; salePrice: number}
export interface AnimalRule {name: string; product: string; periodSeconds: number; price: number; salePrice: number; building: BuildingKind}
export interface FarmRules {fertilizers: Record<'quality' | 'yield', FertilizerRule>; crops: Record<CropKind, CropRule>; animals: Record<AnimalKind, AnimalRule>; buildings: Record<BuildingKind, {name: string; prices: number[]; capacities: number[]}>; landPrices: number[]; feedPrice: number; itemIcons?: Record<string, string>}
export interface FarmAppearance {style: number; palette: number}
export interface FarmSummary {id: string; actorName: string; appearance: FarmAppearance; avatar?: string; professionName?: string | null}
export interface FarmPlot {id: string; wateredUntil: number; wet?: boolean; crop: null | {kind: CropKind; grown: number; checkedAt: number; plantedAt: number; rules: CropRule; qualityVersion?: number; cycleId?: string; plantingOrigin?: {planId: string; entryId: string; revision: number; day: string}; randomSeed?: string; plantingLevel?: number; fertilizerRules?: Record<'quality' | 'yield', FertilizerRule>; fertilizer?: (FertilizerRule & {kind: string; operationId?: string; cost?: string}) | null; result?: {stars: number; event: string; eventName: string; fertilizerExtra: number; unitPrice: number; experience: number}; starProbabilities?: number[]}}
export interface FarmAnimal {id: string; kind: AnimalKind; building: BuildingKind; halfHearts: number; fedUntil: number; lastFedDay: string; cycle: {number: number; grown: number; checkedAt: number; rules: AnimalRule; result?: {quality: 'normal' | 'gold'; quantity: number; halfHearts: number; completedAt: number}}}
export interface FarmAction {kind: string; targets?: string[]; building?: BuildingKind; animal?: AnimalKind; crop?: CropKind; sku?: string; quantity?: number; fertilizer?: 'quality' | 'yield'}
export interface FarmAutomation {
    version: 1;
    id: string;
    taskId: string;
    reviewedAt: number;
    expiresAt: number;
    signature: string;
    lastWindow: string;
    status: 'active' | 'completed' | 'blocked';
    plots: {id: string; crop: CropKind; cycleId: string; replantsLeft: number; status: 'growing' | 'empty' | 'done' | 'blocked'}[];
    animalIds: string[];
}
export interface PlantingQueueEntry {id: string; sku: string; quantity: number; priority: number; fertilizerMode: 'none' | 'optional' | 'required'; fertilizer: 'quality' | 'yield' | null}
export interface PlantingPlan {version: 2; id: string; revision: number; day: string; itemId: string; taskId: string; startsAt: number; cutoff: number; activatedAt: number | null; status: 'pending' | 'active' | 'completed' | 'expired' | 'cancelled'; entries: PlantingQueueEntry[]; progress: Record<string, number>; procurementLimit: string; purchases: {id: string; sku: string; amount: string}[]; reason: string; events: {id: string; at: number; code: string; detail: string; entryId: string}[]; waitStates: Record<string, string>; estimate?: {entries: {entryId: string; sowable: number; harvestable: number; unplanted: number}[]; assumptions: string}; versions: {id: string; version: 2; revision: number; day: string; itemId: string; taskId: string; cutoff: number; entries: PlantingQueueEntry[]; procurementLimit: string; reason: string; marketSource?: {sessionId: string; requestKey: string}}[]}
export interface FarmProductionBonus {sku: string; name: string; baseQuantity: number; quantity: number; extraQuantity: number; stars?: number; event?: string; fertilizerExtra?: number; professionQuantity?: number; remainderBefore: string; remainderAfter: string; percentage: string; professionId: string | null; professionName: string}
export interface FarmOperation {id: string; operation: FarmAction; result: {executionMode?: 'queue'; plantingPlanId?: string; plantingEntryId?: string; planRevision?: number; sourcePlans?: {planId: string; entryId: string; revision: number; day: string}[]; automaticPlanId?: string; label: string; amount: string; energyCost: number; experienceBefore?: number; experienceGained?: number; experienceAfter?: number; fertilizer?: string; costs?: string[]; cycles?: Array<string | NonNullable<FarmPlot['crop']>>; productionBonus?: FarmProductionBonus[]; products?: {name: string; quantity: number; quality: string}[]}; reason: string; createdAt: string}
export interface FarmState extends FarmSummary {planting?: PlantingSkill;farmBonus?: {professionId: string | null; professionName: string; percentage: string};balance: string | null; revision: number; serverTime: string; weather: 'rain' | 'sun'; hour: number; currentAction: string | null; state: {plantingPlans?: Record<string, PlantingPlan>; plantingPlanId?: string; plantingLastTick?: number; automation?: FarmAutomation; plantingExperience?: number; cropSchemaVersion?: number; yieldRemainders?: Record<string, string>; plots: FarmPlot[]; buildings: Partial<Record<BuildingKind, {level: number; capacity: number}>>; animals: FarmAnimal[]; lastOperation?: {id: string; operation: FarmAction; result: FarmOperation['result']; at: number}}; inventory: {id: string; name: string; quantity: number; value: string; sku: string; stars?: number | null; quality: string}[]}
export type FarmSelection = {kind: 'plot' | 'animal' | 'building'; id: string};
