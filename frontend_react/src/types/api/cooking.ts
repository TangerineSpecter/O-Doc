export interface CookingSkill {
    actorId?: string; level: number; experience: number; levelExperience: number;
    nextLevelExperience: number | null; progress: number;
}
export interface RecipeRule {
    ingredients: {sku: string; quantity: number}[]; requiredLevel: number;
    salePrice: string; experience: number; energyCost: number;
}
export interface CookingRecipe extends RecipeRule {
    id: string; sku: string; name: string; description: string;
    ingredients: {sku: string; quantity: number; name: string; owned: number}[];
    state: 'unselected' | 'locked' | 'missing' | 'tired' | 'ready'; maxPortions: number;
    qualityPreviews?: CookingQualityPreview[];
    timesMade: number; ingredientValue: string; processingGain: string;
    iconAssetId: string | null; iconUrl: string;
}
export interface CookingRecipes {
    recipes: CookingRecipe[]; skill: CookingSkill | null;
    ingredientOptions: {sku: string; name: string}[];
}
export interface CookingOperation {
    id: string; recipeId: string; snapshot: RecipeRule & {name: string; ingredientStrategy?: IngredientStrategy; materials?: CookingMaterial[]; baseValues?: Record<string, string>; qualityRules?: CookingQualityRules};
    result: {experienceGained: number; levelBefore: number; levelAfter: number; stars?: number;
        unitPrice?: string; materialStars?: string; ingredientValue?: string; processingGain?: string};
    reason: string; createdAt: string;
}
export interface CookingHistory {list: CookingOperation[]; total: number; page: number; pageSize: number}
export type IngredientStrategy = 'low_stars_first' | 'high_stars_first';
export interface CookingMaterial {
    inventoryId: string; sku: string; stars: number; quantity: number;
    lots: {quantity: number; price: string}[];
}
export interface CookingQualityEstimate {
    materials: CookingMaterial[]; materialStars: string; starProbabilities: number[];
    starValues: string[]; starExperiences: number[]; ingredientValue: string;
    expectedRevenue: string; expectedExperience: number; expectedProcessingGain: string;
}
export interface CookingQualityPreview {
    ingredientStrategy: IngredientStrategy; portions: CookingQualityEstimate[];
}
export interface CookingQualityRules {
    version: number; baseP: number; skillBonus: number; skillPower: number; materialBonus: number;
    valueMultipliers: string[]; experienceMultipliers: string[];
}
