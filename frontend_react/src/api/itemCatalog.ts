import request from '../utils/request';
import type {CatalogItem} from '../types/api/itemCatalog';
export const getItemCatalog = (signal?: AbortSignal) => request.get<never, CatalogItem[]>('/settings/agent-world/item-catalog/', {signal});
