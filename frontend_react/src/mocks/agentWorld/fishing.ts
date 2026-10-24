import catalog from './catalog';
import {residents, at} from './residents';
import {fishingGrowthFor} from './fishingGrowth';
import type {FishingCatalog, FishingOverview, FishingDetail} from '../../types/api/fishing';
import type {InventoryItem} from '../../types/api/travel';

export const fishingCatalog: FishingCatalog = {
    rules: catalog.fishing,
    discovery: Object.fromEntries(Object.entries(catalog.fishing.fish).filter(([, fish], i) => i < 8 || fish.king).map(([id, fish]) => [id, {
        count: fish.king ? 1 : 6, maxWeight: fish.weightRange[1], firstCaughtAt: at(9), recordActor: residents[3].name,
    }])),
};
export const fishingTrip: FishingDetail = {
    id: 'local-fishing', actorId: residents[3].id, actorName: residents[3].name, status: 'completed',
    plan: {spot: 'pond', minutes: 120, baits: ['worm', 'minnow', 'shrimp'], complete: true}, casts: 12,
    carried: ['worm', 'minnow', 'shrimp'].map(id => ({name: catalog.fishing.baits[id].name, quantity: 20, sku: `bait.${id}`})), duel: null, error: '',
    reason: '本地样例：完成今日垂钓', catches: [{name: '鲫鱼', quantity: 2}, {name: '金鳞鲤王', quantity: 1}], experience: 194,
    authorized: true, departedAt: at(17), deadline: at(19), createdAt: at(17), endedAt: at(19), eventTotal: 3, eventPage: 1, rules: fishingCatalog.rules,
    events: ['crucian', 'crucian', 'golden_carp'].map((fishId, i) => {
        const fish = catalog.fishing.fish[fishId];
        const experience = (10 + fish.level * 2) * (fish.king ? 5 : 1);
        return {id: `fishing-event-${i}`, kind: fish.king ? 'duel_end' : 'cast', createdAt: at(18), data: {
            experience, catch: {fishId, name: fish.name, king: fish.king, weight: fish.weightRange[1], experience, caughtAt: at(18)},
        }};
    }),
};

const hours = [6, 22, 18, 12, 6, 18, 22];
export const fishingTrips: FishingDetail[] = [fishingTrip, ...Object.keys(catalog.fishing.spots).slice(3).map((spot, index) => {
    const hour = hours[index];
    const fishRows = Object.entries(catalog.fishing.fish).filter(([, fish]) => fish.spot === spot && fish.hours.some(([start, end]) => start < end ? hour >= start && hour < end : hour >= start || hour < end));
    const events = fishRows.map(([fishId, fish], i) => {
        const experience = (10 + fish.level * 2) * (fish.king ? 5 : 1);
        return {id: `local-${spot}-event-${i}`, kind: fish.king ? 'duel_end' : 'cast', createdAt: at(hour), data: {
            experience, catch: {fishId, name: fish.name, king: fish.king, weight: Math.round((fish.weightRange[0] + fish.weightRange[1]) * 50) / 100, experience, caughtAt: at(hour)},
        }};
    });
    const baits = [...new Set(fishRows.map(([, fish]) => fish.preferred[0]))].slice(0, 3);
    return {...fishingTrip, id: `local-fishing-${spot}`, plan: {spot, minutes: 120, baits, complete: true},
        carried: baits.map(id => ({name: catalog.fishing.baits[id].name, quantity: 20, sku: `bait.${id}`})),
        departedAt: at(hour - 1), createdAt: at(hour - 1), deadline: at(hour + 1), endedAt: at(hour + 1),
        catches: fishRows.map(([, fish]) => ({name: fish.name, quantity: 1})),
        experience: events.reduce((sum, event) => sum + event.data.experience, 0), events, eventTotal: events.length};
})];

export const fishingOverview: FishingOverview = {
    enabled: true, active: [], items: fishingTrips, total: fishingTrips.length, page: 1,
    residents: residents.map((r, i) => {
        const growth = fishingGrowthFor(i);
        return {id: r.id, name: r.name, ...growth,
            baits: Object.entries(catalog.fishing.baits).map(([id, bait]) => ({id, name: bait.name, quantity: 20})),
            spots: Object.entries(catalog.fishing.spots).filter(([, spot]) => spot.requiredLevel <= growth.level).map(([id, row]) => ({id, ...row})),
            recentCatches: i === 3 ? ['幽蓝鳕', '星灯渊王'] : ['鲫鱼', '鲤鱼']};
    }),
};

export const fishingInventory: InventoryItem[] = Object.entries(catalog.fishing.fish).slice(15).map(([id, fish]) => ({
    id: `local-inventory-fish-${id}`, actorId: residents[3].id, actorName: residents[3].name,
    originActorId: residents[3].id, originActorName: residents[3].name,
    kind: 'fish', name: fish.name, quantity: 1, rarity: fish.king ? 'rare' : 'normal', value: fish.value, iconUrl: '',
    source: {sku: `fish.${id}`, description: `${catalog.fishing.spots[fish.spot].name}钓获 · ${fish.weightRange[1]} kg`},
}));
