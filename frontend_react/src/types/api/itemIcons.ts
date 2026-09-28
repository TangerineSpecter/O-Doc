import type {InventoryItem} from './travel';

export interface ItemIcon {
    id: string; name: string; url: string; size: number;
    width: number; height: number; usageCount: number; recommended: boolean; fileExists: boolean;
    duplicate?: boolean;
}
export interface ItemImagePage<T> {list: T[]; total: number; page: number; pageSize: number}
export interface ManagedInventoryPage extends ItemImagePage<InventoryItem> {agents: {id: string; name: string}[]}
export type PictureFilter = 'all' | 'missing' | 'set';
