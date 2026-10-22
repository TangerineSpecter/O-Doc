import rawCatalog from './catalog.json?raw';
import type {FarmRules} from '../../types/api/farm';
import type {CombatCatalog} from '../../types/api/combat';
import type {FishingRules} from '../../types/api/fishing';

interface LocalCatalog {
    farm: FarmRules;
    cooking: [string, string, number, number, Record<string, number>][];
    alchemy: {id: string; name: string; requiredLevel: number; salePrice: string; experience: number; energyCost: number; ingredients: [string, number][]}[];
    materials: Record<string, [string, number, string]>;
    dungeons: Record<string, string>;
    combat: CombatCatalog;
    fishing: FishingRules;
}

// Raw JSON avoids asking TypeScript to infer a union of thousands of content rows.
export default JSON.parse(rawCatalog) as LocalCatalog;
