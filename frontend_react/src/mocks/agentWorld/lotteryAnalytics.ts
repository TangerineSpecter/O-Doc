import type {LotteryAnalyticsMetrics, LotteryAnalyticsResident, ResidentAnalytics} from '../../types/api/residentAnalytics';
import {day, residents} from './residents';

const counts = ['purchases', 'tickets', 'rounds', 'settledTickets', 'pendingTickets', 'winningTickets', 'firstTickets',
    'secondTickets', 'thirdTickets', 'unwonTickets', 'winningRounds', 'unknownTickets', 'firstAwards', 'secondAwards', 'thirdAwards'] as const;
const money = ['expense', 'prizes', 'net', 'maxPrize', 'firstPrize', 'secondPrize', 'thirdPrize'] as const;
function empty(): LotteryAnalyticsMetrics {
    return {...Object.fromEntries(counts.map(key => [key, 0])), ...Object.fromEntries(money.map(key => [key, '0.00'])), winRate: null} as LotteryAnalyticsMetrics;
}
const cents = (value: string) => BigInt(value.replace('.', ''));
const amount = (value: bigint) => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;

export function lotteryAnalyticsMock(url: URL, isEmpty: boolean): ResidentAnalytics['lotteryStatistics'] {
    const actor = url.searchParams.get('actor_id') || url.searchParams.get('actorId') || '';
    const start = url.searchParams.get('start_date') || day;
    const end = url.searchParams.get('end_date') || day;
    const inWindow = start <= day && day <= end;
    const rows: LotteryAnalyticsResident[] = isEmpty ? [] : residents.filter(r => !actor || r.id === actor).map(r => {
        const row = {...empty(), id: r.id, name: r.name, avatar: '', departed: false};
        if (!inWindow) return row;
        const first = r.id === residents[0].id;
        // Two purchase batches: four settled tickets (two duplicate second-prize tickets) and one pending ticket.
        Object.assign(row, {purchases: 2, tickets: 5, rounds: 2, settledTickets: 4, pendingTickets: 1,
            winningTickets: first ? 4 : 3, firstTickets: first ? 1 : 0, secondTickets: 2, thirdTickets: 1,
            unwonTickets: first ? 0 : 1, winningRounds: 1, winRate: first ? 100 : 75,
            expense: '250.00', prizes: first ? '1850.00' : '1200.00', net: first ? '1600.00' : '950.00',
            maxPrize: first ? '1150.00' : '500.00', firstAwards: first ? 1 : 0, secondAwards: 1, thirdAwards: 1,
            firstPrize: first ? '1150.00' : '0.00', secondPrize: '500.00', thirdPrize: '200.00'});
        return row;
    });
    rows.sort((a, b) => cents(a.net) > cents(b.net) ? -1 : cents(a.net) < cents(b.net) ? 1 : b.winningTickets - a.winningTickets || a.id.localeCompare(b.id));
    const overview = empty();
    for (const row of rows) {
        for (const key of counts) overview[key] += row[key];
        for (const key of money) overview[key] = amount(key === 'maxPrize'
            ? (cents(overview[key]) > cents(row[key]) ? cents(overview[key]) : cents(row[key]))
            : cents(overview[key]) + cents(row[key]));
    }
    // Residents share both rounds; world-level round counts are distinct, not summed.
    overview.rounds = rows.length && inWindow ? 2 : 0;
    overview.winningRounds = rows.length && inWindow ? 1 : 0;
    overview.winRate = overview.settledTickets ? Math.round(1000 * overview.winningTickets / overview.settledTickets) / 10 : null;
    return {overview, residents: rows};
}
