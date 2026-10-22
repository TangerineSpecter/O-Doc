import {useRef, useState} from 'react';
import {uploadItemIcon} from '../api/itemIcons';
import {setCatalogItemIcon} from '../api/itemCatalog';
import type {CookingRecipe} from '../types/api/cooking';

/** 菜品换图与移除共用互斥入口，防止两个请求乱序覆盖同一 SKU 的关联。 */
export function useRecipeImage(recipe: CookingRecipe, onReload?: () => void) {
    const pending = useRef(false);
    const [operation, setOperation] = useState<'upload' | 'remove' | null>(null);
    const [failure, setFailure] = useState<{sku: string; message: string} | null>(null);

    const update = async (kind: 'upload' | 'remove', action: () => Promise<unknown>) => {
        if (pending.current) return;
        pending.current = true;
        setOperation(kind);
        setFailure(null);
        try {
            await action();
            onReload?.();
        } catch (error) {
            setFailure({sku: recipe.sku, message: error instanceof Error ? error.message : '设置图片失败，请重试'});
        } finally {
            pending.current = false;
            setOperation(null);
        }
    };

    const upload = (file: File) => update('upload', async () => {
        const uploaded = await uploadItemIcon(file, recipe.name);
        await setCatalogItemIcon(recipe.sku, uploaded.id);
    });
    const remove = () => update('remove', () => setCatalogItemIcon(recipe.sku, null));

    return {upload, remove, busy: operation !== null, operation, error: failure?.sku === recipe.sku ? failure.message : ''};
}
