export type CropKind = 'radish' | 'potato' | 'corn';
export type AnimalKind = 'chicken' | 'cow' | 'sheep';
export type BuildingKind = 'coop' | 'barn';
export interface CropRule {name: string; growthSeconds: number; seedPrice: number; yield: number; salePrice: number}
export interface AnimalRule {name: string; product: string; periodSeconds: number; price: number; salePrice: number; building: BuildingKind}
export interface FarmRules {crops: Record<CropKind, CropRule>; animals: Record<AnimalKind, AnimalRule>; buildings: Record<BuildingKind, {name: string; prices: number[]; capacities: number[]}>; landPrices: number[]; feedPrice: number; itemIcons?: Record<string, string>}
export interface FarmAppearance {style: number; palette: number}
export interface FarmSummary {id: string; actorName: string; appearance: FarmAppearance; avatar?: string; professionName?: string | null}
export interface FarmPlot {id: string; wateredUntil: number; wet?: boolean; crop: null | {kind: CropKind; grown: number; checkedAt: number; plantedAt: number; rules: CropRule}}
export interface FarmAnimal {id: string; kind: AnimalKind; building: BuildingKind; halfHearts: number; fedUntil: number; lastFedDay: string; cycle: {number: number; grown: number; checkedAt: number; rules: AnimalRule; result?: {quality: 'normal' | 'gold'; quantity: number; halfHearts: number; completedAt: number}}}
export interface FarmAction {kind: string; targets?: string[]; building?: BuildingKind; animal?: AnimalKind; crop?: CropKind; sku?: string; quantity?: number}
export interface FarmProductionBonus {sku: string; name: string; baseQuantity: number; quantity: number; extraQuantity: number; remainderBefore: string; remainderAfter: string; percentage: string; professionId: string | null; professionName: string}
export interface FarmOperation {id: string; operation: FarmAction; result: {label: string; amount: string; energyCost: number; productionBonus?: FarmProductionBonus[]; products?: {name: string; quantity: number; quality: string}[]}; reason: string; createdAt: string}
export interface FarmState extends FarmSummary {farmBonus?: {professionId: string | null; professionName: string; percentage: string};balance: string | null; revision: number; serverTime: string; weather: 'rain' | 'sun'; hour: number; currentAction: string | null; state: {yieldRemainders?: Record<string, string>; plots: FarmPlot[]; buildings: Partial<Record<BuildingKind, {level: number; capacity: number}>>; animals: FarmAnimal[]; lastOperation?: {id: string; operation: FarmAction; result: FarmOperation['result']; at: number}}; inventory: {id: string; name: string; quantity: number; value: string; sku: string; quality: string}[]}
export type FarmSelection = {kind: 'plot' | 'animal' | 'building'; id: string};
