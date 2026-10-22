export const recipeArtNames = {
    baked_potato: '烤土豆',
    smashed_cucumber: '拍黄瓜',
    roasted_corn: '烤玉米',
    radish_stir_fry: '萝卜小炒',
    tomato_eggs: '番茄炒蛋',
    cabbage_stir_fry: '醋溜卷心菜',
    spiced_peanuts: '五香花生',
    peanut_soymilk: '花生豆浆',
    eggplant_rice: '茄子焖饭',
    garden_fried_rice: '田园炒饭',
    pumpkin_soup: '南瓜浓汤',
    onion_pancake: '葱香薄饼',
    strawberry_pudding: '草莓布丁',
    spicy_eggplant: '香辣茄子',
    vegetable_rice: '蔬菜烩饭',
    milk_corn_cake: '奶香玉米饼',
    sunflower_crisp: '瓜子酥',
    strawberry_cake: '草莓蛋糕',
    pumpkin_pie: '南瓜奶香派',
    harvest_platter: '丰收拼盘',
} as const;

export type RecipeArtId = keyof typeof recipeArtNames;
export interface RecipeArtProfile {
    id: RecipeArtId;
    name: string;
}

/** Atlas IDs and inventory SKUs share the same built-in food artwork. */
export function getRecipeArtProfile(recipeId: string): RecipeArtProfile | undefined {
    const id = recipeId.startsWith('dish.') ? recipeId.slice(5) : recipeId;
    if (!Object.prototype.hasOwnProperty.call(recipeArtNames, id)) return undefined;
    const knownId = id as RecipeArtId;
    return {id: knownId, name: recipeArtNames[knownId]};
}
