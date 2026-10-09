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
    timesMade: number; ingredientValue: string; processingGain: string;
    iconAssetId: string | null; iconUrl: string;
}
export interface CookingRecipes {
    recipes: CookingRecipe[]; skill: CookingSkill | null;
    ingredientOptions: {sku: string; name: string}[];
}
export interface CookingOperation {
    id: string; recipeId: string; snapshot: RecipeRule & {name: string};
    result: {experienceGained: number; levelBefore: number; levelAfter: number};
    reason: string; createdAt: string;
}
export interface CookingHistory {list: CookingOperation[]; total: number; page: number; pageSize: number}
