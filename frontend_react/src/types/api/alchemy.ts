export type AlchemyRecipeState = 'unselected' | 'locked' | 'missing' | 'tired' | 'ready';

export interface AlchemySkill {
    actorId?: string; level: number; experience: number; levelExperience: number;
    nextLevelExperience: number | null; progress: number; bottlesMade: number;
}

export interface AlchemyRule {
    ingredients: {sku: string; quantity: number}[]; requiredLevel: number;
    salePrice: string; experience: number; energyCost: number;
}

export interface AlchemyEffectTier {
    stars: number;
    effects: Record<string, number>;
    summary: string;
}

export interface AlchemyIngredient {
    sku: string; quantity: number; name: string; tier: number; source: string; owned: number;
}

export interface AlchemyQualityEstimate {
    materialTier: string; starProbabilities: number[]; starValues: string[];
    starExperiences: number[]; expectedExperience: number;
}

export interface AlchemyRecipe extends AlchemyRule {
    id: string; sku: string; name: string; description: string;
    effects: AlchemyEffectTier[]; ingredients: AlchemyIngredient[];
    state: AlchemyRecipeState; maxBottles: number; timesMade: number;
    ownedBottles: number; ownedByStars: Record<string, number>;
    ingredientValue: string; dungeonLabels: string[];
    qualityPreviews: AlchemyQualityEstimate[];
    iconAssetId: string | null; iconUrl: string;
}

export interface AlchemyMaterialRow {
    sku: string; name: string; level: number; salePrice: string; dungeon: string;
}

export interface AlchemyRecipes {
    recipes: AlchemyRecipe[]; skill: AlchemySkill | null;
    materials: AlchemyMaterialRow[]; carryCap: number;
}

export interface AlchemyMaterial {
    inventoryId: string; sku: string; quantity: number; price: string;
}

export interface AlchemyOperation {
    id: string; recipeId: string;
    snapshot: AlchemyRule & {name: string; materials?: AlchemyMaterial[]; qualityRules?: {version: number}};
    result: {
        stars?: number; unitPrice?: string; experienceGained: number; levelBefore: number;
        levelAfter: number; materialTier?: string; ingredientValue?: string; processingGain?: string;
    };
    reason: string; createdAt: string;
}

export interface AlchemyHistory {list: AlchemyOperation[]; total: number; page: number; pageSize: number}
