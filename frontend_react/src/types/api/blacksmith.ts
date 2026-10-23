import type {EquipmentSnapshot, EquipmentWearRules} from './combat';

export type BlacksmithState = 'unselected' | 'unavailable' | 'missing' | 'tired' | 'ready';
export interface BlacksmithBand {id: string; label: string; levelMin: number; levelMax: number}
export interface BlacksmithIngredient {
    sku: string; name: string; quantity: number; price: string;
    owned: number; available: number; reserved: number; source: string;
}
export interface BlacksmithType {
    id?: string; canEquip?: boolean;
    templateId: string; name: string; equipmentType: string; typeName: string;
    levelMin: number; levelMax: number; wearLevel: number; jobIds: string[];
}
export interface BlacksmithRecipe {
    id: string; bandId: string; bandLabel: string; levelMin: number; levelMax: number;
    slot: string; slotName: string; version: number; energyCost: number;
    ingredients: BlacksmithIngredient[]; types: BlacksmithType[];
    state: BlacksmithState; disabledReason: string; maxPieces: number;
    ingredientValue: string; timesMade: number;
}
export interface BlacksmithMaterialSource {
    monsterId: string; monsterName: string; rank: string; levelMin: number;
    levelMax: number; dungeonId: string; dungeonName: string;
    dungeonLevelMin?: number; dungeonLevelMax?: number;
}
export interface BlacksmithMaterial {
    sku: string; name: string; level: number; salePrice: string; source: string;
    sources: BlacksmithMaterialSource[];
}
export interface BlacksmithRecipes {
    recipes: BlacksmithRecipe[]; materials: BlacksmithMaterial[]; bands: BlacksmithBand[];
    qualityProbabilities: {quality: string; probability: number}[]; energyCost: number; maxPieces: number;
    actor: {id: string; name: string; level: number; jobId: string; jobName: string;
        energy: string | number; initialized: boolean} | null;
    goalState: {goals: BlacksmithGoal[]; invalidGoals: {id: string; recipeId: string; templateId: string; reason: string}[];
        freeSlots: number; readyCount: number; canRegister: boolean};
}
export interface BlacksmithGoal {
    id: string; recipeId: string; templateId: string; bandId: string; bandLabel: string;
    slot: string; slotName: string; typeName: string; ready: boolean;
    ingredients: {sku: string; name: string; required: number; available: number; missing: number}[];
}
export interface BlacksmithRulePatch {ingredients: {sku: string; quantity: number}[]}
export interface BlacksmithPiece {
    id: string; pieceIndex: number; recipeId: string;
    snapshot: Record<string, unknown>;
    result: {equipmentId: string; item: EquipmentSnapshot; rules: EquipmentWearRules;
        catalogId: string; quantity: number; energyCost: number; ingredientValue: string;
        value: string; level: number; quality: string; goalId?: string};
    reason: string; createdAt?: string;
}
export interface BlacksmithOperation extends BlacksmithPiece {
    ownerId: string; actorId: string; actorName: string; opportunityId: string; createdAt: string;
}
export interface BlacksmithActivity {
    id: string; actorId: string; actorName: string; status: string;
    createdAt: string; updatedAt: string; recordId: string;
    snapshot: Record<string, unknown>; result: Record<string, unknown>;
    stages: Record<string, unknown>[]; operations: BlacksmithPiece[];
}
export interface BlacksmithHistory {list: BlacksmithActivity[]; total: number; page: number; pageSize: number}
