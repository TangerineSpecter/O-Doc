export interface TravelConfig {
    collectionId: string; categoryId: string; searchServerId: string;
    nodeMinutes: number; recentCities: number; energyCost: number; photoEnabled: boolean;
    imageModelId?: string;
    imageAspectRatio?: string; imageSize?: string;
}
export const emptyTravelConfig = (): TravelConfig => ({collectionId: '', categoryId: '', searchServerId: '', nodeMinutes: 1, recentCities: 3, energyCost: 20, photoEnabled: true, imageModelId: '', imageAspectRatio: '16:9', imageSize: '1K'});
interface Destination {id: string; country: string; city: string; region: string; price: string}
export interface TravelJourney {
    id: string; actorId: string; status: string; phase: string; articleId: string;
    departedAt: string | null; returnedAt: string | null; createdAt: string;
    snapshot: {
        config?: TravelConfig;
        destinationNote?: string;
        debugPurchase?: {items: {id: string; name: string; quantity: number; value: string}[]};
        agentName: string; selected?: Destination; candidates: Destination[];
        selection?: {reason: string; shoppingBudget: string}; skipReason?: string;
        visits?: {site: {name: string}; choice: string; reaction: string}[];
        encounters?: {description: string; choice: string; reaction: string}[];
        food?: {choice: string; reaction: string}; shopping?: {reason: string; basket: {id: string; quantity: number}[]};
        goods?: {id: string; name: string; price: string}[];
        draft?: {title: string; content: string; reflection: string};
        photo?: {status: string; error?: string; imageUrl?: string};
        sources?: {url: string; title: string}[];
    };
    nodes?: {id: string; kind: string; status: string; error: string}[];
}
export interface InventoryItem {kind?: string; id: string; actorId: string; actorName: string; originActorId: string; originActorName: string; rarity: string; value: string; name: string; quantity: number; iconAssetId?: string | null; iconUrl?: string; source: {sku?: string; quality?: string; destination?: Destination; unitPrice?: string; debug?: boolean; description?: string}}
export type TravelOperation = 'pause' | 'resume' | 'end' | 'query_image' | 'regenerate_image' | 'use_image' | 'abandon_image';
