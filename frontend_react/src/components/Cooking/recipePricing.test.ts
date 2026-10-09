import assert from 'node:assert/strict';
import {test} from 'node:test';
import {recipeStarPrices} from './recipePricing.ts';

test('whole-value five-star prices do not gain a coin from floating point error', () => {
    assert.deepEqual(recipeStarPrices('90'), ['90', '108', '135', '162', '198']);
    assert.deepEqual(recipeStarPrices('450.00'), ['450.00', '540', '675', '810', '990']);
});

test('fractional values round upward while one-star prices keep their precision', () => {
    assert.deepEqual(recipeStarPrices('90.01'), ['90.01', '109', '136', '163', '199']);
    assert.deepEqual(recipeStarPrices('0.50'), ['0.50', '1', '1', '1', '2']);
    assert.deepEqual(recipeStarPrices('0.00'), ['0.00', '0', '0', '0', '0']);
});

test('complete backend previews take precedence and missing previews use exact fallback', () => {
    const preview = ['90.00', '108', '135', '162', '198'];
    assert.deepEqual(recipeStarPrices('450.00', preview), preview);
    assert.deepEqual(recipeStarPrices('90.00', []), ['90.00', '108', '135', '162', '198']);
    assert.deepEqual(recipeStarPrices('90.00', ['90.00']), ['90.00', '108', '135', '162', '198']);
});
