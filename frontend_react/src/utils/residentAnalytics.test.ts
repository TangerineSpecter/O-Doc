import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    analyticsRange,
    analyticsRangeError,
    analyticsMoney,
    sortAnalyticsResidents,
    sortLotteryResidents,
    sortFishingResidents,
} from './residentAnalytics.ts';
import type {
    AnalyticsComparison,
    FishingAnalyticsResident,
    LotteryAnalyticsResident,
} from '../types/api/residentAnalytics.ts';

test('Shanghai range includes both endpoints across UTC midnight', () => {
    assert.deepEqual(analyticsRange(7, new Date('2026-10-10T17:00:00Z')), {start_date: '2026-10-05', end_date: '2026-10-11'});
    assert.equal(analyticsRangeError('2026-01-01', '2027-01-01'), '');
    assert.match(analyticsRangeError('2026-01-01', '2027-01-02'), /366/);
    assert.ok(analyticsRangeError('2026-10-02', '2026-10-01'));
    assert.ok(analyticsRangeError('', '2026-10-01'));
});

test('currency display and sorting retain cents beyond Number precision', () => {
    assert.equal(analyticsMoney('-123456789.01'), '¥-123,456,789.01');
    const base = {name: '居民', avatar: '', departed: false, activeDays: 0, publications: 0, interactions: 0, received: 0, expense: '0.00', net: '0.00'};
    const rows: AnalyticsComparison[] = [{...base, id: 'a', income: '99999999999999.01'}, {...base, id: 'b', income: '99999999999999.02'}];
    assert.deepEqual(sortAnalyticsResidents(rows, 'income', true).map(row => row.id), ['b', 'a']);
    assert.deepEqual(sortAnalyticsResidents(rows, 'income', false).map(row => row.id), ['a', 'b']);
    assert.deepEqual(rows.map(row => row.id), ['a', 'b']);
});

test('lottery ranking sorts by net, win rate, null safety, and tie breakers', () => {
    const base: LotteryAnalyticsResident = {
        id: '1', name: '小橘', avatar: '', departed: false,
        purchases: 1, tickets: 5, rounds: 1, settledTickets: 4, pendingTickets: 1,
        winningTickets: 2, firstTickets: 0, secondTickets: 1, thirdTickets: 1, unwonTickets: 2,
        winningRounds: 1, unknownTickets: 0, winRate: 50,
        expense: '25.00', prizes: '50.00', net: '25.00', maxPrize: '40.00',
        firstAwards: 0, secondAwards: 1, thirdAwards: 1,
        firstPrize: '0.00', secondPrize: '40.00', thirdPrize: '10.00',
    };
    const rowA: LotteryAnalyticsResident = {...base, id: 'a', net: '100.00', winRate: 80, firstTickets: 1};
    const rowB: LotteryAnalyticsResident = {...base, id: 'b', net: '200.00', winRate: null, firstTickets: 0};
    const rowC: LotteryAnalyticsResident = {...base, id: 'c', net: '-10.00', winRate: 20, firstTickets: 0};

    // 默认按净收支降序
    assert.deepEqual(sortLotteryResidents([rowA, rowB, rowC], 'net', true).map(r => r.id), ['b', 'a', 'c']);
    // 按中奖率排序，null 始终在尾部
    assert.deepEqual(sortLotteryResidents([rowA, rowB, rowC], 'winRate', true).map(r => r.id), ['a', 'c', 'b']);
    assert.deepEqual(sortLotteryResidents([rowA, rowB, rowC], 'winRate', false).map(r => r.id), ['c', 'a', 'b']);
    // 按一等奖排序
    assert.deepEqual(sortLotteryResidents([rowA, rowB, rowC], 'firstTickets', true).map(r => r.id), ['a', 'b', 'c']);
});

test('fishing ranking sorts by catches, kings, rate and tie breakers', () => {
    const base: FishingAnalyticsResident = {
        id: '1', name: '钓客', avatar: '', departed: false,
        trips: 2, casts: 10, catches: 5, kings: 0, escaped: 1, empty: 2, junk: 2,
        experience: 100, ordinaryCatches: 5, ordinaryCatchRate: 50,
    };
    const rowA: FishingAnalyticsResident = {...base, id: 'a', catches: 8, kings: 1, ordinaryCatchRate: 80, experience: 200};
    const rowB: FishingAnalyticsResident = {...base, id: 'b', catches: 12, kings: 0, ordinaryCatchRate: 60, experience: 300};
    const rowC: FishingAnalyticsResident = {...base, id: 'c', catches: 0, kings: 0, ordinaryCatchRate: null, experience: 0};

    // 按捕获数降序
    assert.deepEqual(sortFishingResidents([rowA, rowB, rowC], 'catches', true).map(r => r.id), ['b', 'a', 'c']);
    // 按鱼王降序
    assert.deepEqual(sortFishingResidents([rowA, rowB, rowC], 'kings', true).map(r => r.id), ['a', 'b', 'c']);
    // 按普通鱼捕获率排序，null 在末尾
    assert.deepEqual(sortFishingResidents([rowA, rowB, rowC], 'ordinaryCatchRate', true).map(r => r.id), ['a', 'b', 'c']);
});
