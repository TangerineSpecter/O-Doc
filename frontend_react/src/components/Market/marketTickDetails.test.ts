import assert from 'node:assert/strict';
import test from 'node:test';
import {marketTickIssues, marketTickStock} from './marketTickDetails';
import {createMarketPlanPreview} from './marketPlanPreviewData';
test('partial failures remain visible on completed ticks', () => {
    const tick = createMarketPlanPreview().ticks[0];
    assert.equal(tick.status, 'done');
    assert.equal(marketTickIssues(tick)[0].quantity, 545);
    assert.match(marketTickIssues(tick)[0].reason, /批次/);
    assert.deepEqual(marketTickIssues({...tick, hits: {outcome: {failed: null}}}), []);
});
test('mock arithmetic and legal channels match the public contract', () => {
    for (const row of createMarketPlanPreview().dispositions) {
        assert.equal(row.sellRatio + row.listRatio, 100);
        const state = row.protection!;
        assert.equal(state.total, state.protected! + state.disposable);
        assert.equal(state.protected, Object.values(state.uses).reduce((sum, use) => sum + use.protected, 0));
        assert.equal(state.missing, Object.values(state.uses).reduce((sum, use) => sum + use.missing, 0));
        if (row.sku.startsWith('elixir.') || row.sku.startsWith('souvenir.')) assert.equal(row.sellRatio, 0);
    }
});
test('stock detail preserves SKU and distinguishes planned, blocked and settled totals', () => {
    const tick = createMarketPlanPreview().ticks[0];
    const [material, crop] = marketTickStock(tick);
    assert.deepEqual(material, {
        sku: 'combat.material.moss_cave.1', sell: 545, list: 0, expiredReturn: 500,
        blockedListing: 0, sold: 0, listed: 0,
    });
    assert.equal(crop.blockedListing, 8);
    assert.equal(crop.sold, 4);
    assert.deepEqual(marketTickStock({...tick, hits: {}}), []);
});
