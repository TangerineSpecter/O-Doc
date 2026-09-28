import request from '../utils/request';
import type {InventoryItem} from '../types/api/travel';
import type {ItemIcon, ItemImagePage, ManagedInventoryPage, PictureFilter} from '../types/api/itemIcons';

const base = '/settings/agent-world';
export const getItemIcons = (params: {search?: string; itemId?: string; page?: number}, signal?: AbortSignal) =>
    request.get<never, ItemImagePage<ItemIcon>>(`${base}/item-icons/`, {params, signal});
export const uploadItemIcon = (file: File, name: string) => {
    const data = new FormData(); data.append('file', file); data.append('name', name);
    return request.post<never, ItemIcon>(`${base}/item-icons/`, data, {timeout: 60000});
};
export const renameItemIcon = (id: string, name: string) => request.patch<never, ItemIcon>(`${base}/item-icons/${encodeURIComponent(id)}/`, {name});
export const deleteItemIcon = (id: string) => request.delete<never, void>(`${base}/item-icons/${encodeURIComponent(id)}/`);
export const getManagedInventory = (params: {search?: string; agentId?: string; picture?: PictureFilter; page?: number}, signal?: AbortSignal) =>
    request.get<never, ManagedInventoryPage>(`${base}/inventory/manage/`, {params, signal});
export const setInventoryIcon = (id: string, assetId: string | null) =>
    request.patch<never, InventoryItem>(`${base}/inventory/${encodeURIComponent(id)}/icon/`, {assetId});
