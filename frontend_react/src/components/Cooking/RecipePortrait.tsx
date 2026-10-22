import type {CookingRecipe} from '../../types/api/cooking';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {RecipePixelPortrait} from './RecipePixelPortrait';

/** 用户配图优先；未设置或资源读取失败时显示同一菜品的内置像素图。 */
export function RecipePortrait({recipe, className = ''}: {
    recipe: Pick<CookingRecipe, 'sku' | 'name' | 'iconUrl'>;
    className?: string;
}) {
    const builtin = <RecipePixelPortrait recipeId={recipe.sku} name={recipe.name} decorative className={className}/>;
    return recipe.iconUrl
        ? <ItemIconImage src={recipe.iconUrl} alt={recipe.name} className={className} fallback={builtin}/>
        : builtin;
}
