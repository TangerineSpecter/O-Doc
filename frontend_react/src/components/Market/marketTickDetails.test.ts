import assert from 'node:assert/strict';
import test from 'node:test';
import {marketTickIssues} from './marketTickDetails';
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
