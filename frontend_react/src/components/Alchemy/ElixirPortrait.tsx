import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {PotionPortrait} from '../Combat/atlas/PotionPortrait';
import type {AlchemyRecipe} from '../../types/api/alchemy';

/** 炼金药水图标：居民上传图片优先，否则复用战斗药剂的像素绘制。 */
export function ElixirPortrait({recipe, className = ''}: {
    recipe: Pick<AlchemyRecipe, 'sku' | 'name' | 'iconUrl'>;
    className?: string;
}) {
    const builtin = <PotionPortrait potionId={recipe.sku} name={recipe.name} decorative className={className}/>;
    return recipe.iconUrl
        ? <ItemIconImage src={recipe.iconUrl} alt={recipe.name} className={className} fallback={builtin}/>
        : builtin;
}
