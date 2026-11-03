import assert from 'node:assert/strict';
import {test} from 'node:test';
import {diaryLibraryRoute} from './diaryLibrary.ts';

test('图片文集样例按 12 个照片组分页，并可返回上一页', () => {
    const base = 'http://local/api/diary/photo-library?collId=diary-local-album';
    const first = diaryLibraryRoute(new URL(`${base}&page=1`), false)!;
    const second = diaryLibraryRoute(new URL(`${base}&page=2`), false)!;
    assert.equal(first.groups.length, 12);
    assert.equal(first.hasMore, true);
    assert.equal(second.page, 2);
    assert.equal(second.groups.length, 3);
    assert.equal(second.hasMore, false);
    assert.ok(second.groups.every(group => !first.groups.some(previous => previous.id === group.id)));
    assert.deepEqual(diaryLibraryRoute(new URL(`${base}&page=1`), false)?.groups, first.groups);
});
