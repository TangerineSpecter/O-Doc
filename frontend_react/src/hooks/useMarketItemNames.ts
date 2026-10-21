import {useEffect, useRef, useState} from 'react';
import {getAlchemyRecipes} from '../api/alchemy';
import {getCombatCatalog} from '../api/combat';
import {getItemCatalog} from '../api/itemCatalog';

type MarketItemNames = Record<string, string>;

function addName(names: MarketItemNames, sku: string | undefined, name: string | undefined) {
    if (sku && name?.trim()) names[sku] = name.trim();
}

function collectMarketItemNames(
    itemCatalog: Awaited<ReturnType<typeof getItemCatalog>> | null,
    combatCatalog: Awaited<ReturnType<typeof getCombatCatalog>> | null,
    alchemyCatalog: Awaited<ReturnType<typeof getAlchemyRecipes>> | null,
): MarketItemNames {
    const names: MarketItemNames = {};
    itemCatalog?.forEach(item => addName(names, item.sku, item.name));

    Object.values(combatCatalog?.tables || {}).flat().forEach(row => {
        addName(names, row.id, row.name);
        if (row.id.startsWith('material.') || row.id.startsWith('potion.')) {
            addName(names, `combat.${row.id}`, row.name);
        }
    });

    alchemyCatalog?.materials.forEach(item => addName(names, item.sku, item.name));
    alchemyCatalog?.recipes.forEach(item => addName(names, item.sku, item.name));
    return names;
}

export function useMarketItemNames(enabled: boolean): MarketItemNames {
    const [names, setNames] = useState<MarketItemNames>({});
    const namesRef = useRef<MarketItemNames | null>(null);

    useEffect(() => {
        if (!enabled || namesRef.current) return;
        const controller = new AbortController();
        let live = true;

        Promise.allSettled([
            getItemCatalog(controller.signal),
            getCombatCatalog(controller.signal),
            getAlchemyRecipes(undefined, controller.signal),
        ]).then(([items, combat, alchemy]) => {
            if (!live) return;
            const result = collectMarketItemNames(
                items.status === 'fulfilled' ? items.value : null,
                combat.status === 'fulfilled' ? combat.value : null,
                alchemy.status === 'fulfilled' ? alchemy.value : null,
            );
            if (Object.keys(result).length) {
                namesRef.current = result;
                setNames(result);
            }
        });

        return () => {
            live = false;
            controller.abort();
        };
    }, [enabled]);

    return names;
}
