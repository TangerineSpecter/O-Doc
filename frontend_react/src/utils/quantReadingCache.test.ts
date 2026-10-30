import assert from 'node:assert/strict';
import {test} from 'node:test';
import {QuantReadingCache} from './quantReadingCache.ts';
test('reading cache enforces byte and count budgets with LRU access',()=>{
    const cache=new QuantReadingCache(2,100);
    cache.put('a','报告');cache.put('b','源码');assert.equal(cache.get('a'),'报告');
    cache.put('c','修订');assert.equal(cache.get('b'),undefined);assert.equal(cache.size,2);
    assert.ok(cache.byteSize<=100);
    cache.put('oversized','长'.repeat(100));assert.equal(cache.get('oversized'),undefined);
    assert.equal(cache.size,2);cache.clear();assert.equal(cache.byteSize,0);
});
test('scope and revision are part of cache identity and replacement does not leak bytes',()=>{
    const cache=new QuantReadingCache();cache.put('owner:entry:report:r1','原稿');
    assert.equal(cache.get('other:entry:report:r1'),undefined);
    assert.equal(cache.get('owner:entry:report:r2'),undefined);
    cache.put('owner:entry:report:r1','新');assert.equal(cache.size,1);
    assert.equal(cache.byteSize,new TextEncoder().encode(JSON.stringify('新')).length);
});
