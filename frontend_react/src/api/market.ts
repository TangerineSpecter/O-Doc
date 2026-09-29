import request from '../utils/request';
import type {MarketConfig, MarketListing, MarketPage, MarketSession, MarketShop, MarketTransaction} from '../types/api/market';
const base = '/settings/agent-world/market';
export const getMarketShop = (signal?: AbortSignal) => request.get<never, MarketShop>(`${base}/shop/`, {signal});
export const getMarketListings = (page: number, search: string, sellerId: string, signal?: AbortSignal) => request.get<never, MarketPage<MarketListing>>(`${base}/listings/`, {signal, params: {page, search, seller_id: sellerId || undefined}});
export const getMarketTransactions = (page: number, actorId: string, signal?: AbortSignal) => request.get<never, MarketPage<MarketTransaction>>(`${base}/transactions/`, {signal, params: {page, actor_id: actorId || undefined}});
export const getMarketSessions = (page: number, actorId: string, signal?: AbortSignal) => request.get<never, MarketPage<MarketSession>>(`${base}/sessions/`, {signal, params: {page, actor_id: actorId || undefined}});
export const getMarketConfig = (signal?: AbortSignal) => request.get<never, MarketConfig>(`${base}/config/`, {signal});
export const saveMarketConfig = (slotCount: number) => request.patch<never, MarketConfig>(`${base}/config/`, {slotCount});
