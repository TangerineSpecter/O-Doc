import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {GlobalSearchItem} from '../types/api/search.ts';
import {mergeGlobalSearchResults, visibleImageCount} from './globalSearchMerge.ts';

const item = (id: string, type: GlobalSearchItem['type'], subtitle: string): GlobalSearchItem => ({
    id, type, title: id, subtitle, route: {view: type === 'image' ? 'image' : 'article'},
});

test('all filter adds semantic images without replacing other categories or duplicating keyword images', () => {
    const keyword = [item('article:a', 'article', '文章命中'), item('image:x', 'image', '旧关键词说明')];
    const smart = [item('image:x', 'image', '标签命中'), item('image:y', 'image', '视觉描述相关')];
    const merged = mergeGlobalSearchResults(keyword, smart, 'all');
    assert.deepEqual(merged.map(result => result.id), ['article:a', 'image:x', 'image:y']);
    assert.equal(merged[1].subtitle, '标签命中');
    assert.equal(visibleImageCount(0, merged, true), 2);
});

test('non-image filter and disabled switch preserve original keyword results', () => {
    const keyword = [item('article:a', 'article', '文章命中')];
    const smart = [item('image:y', 'image', '视觉描述相关')];
    assert.equal(mergeGlobalSearchResults(keyword, smart, 'article'), keyword);
    assert.equal(mergeGlobalSearchResults(keyword, null, 'all'), keyword);
    assert.equal(visibleImageCount(3, keyword, false), 3);
});
