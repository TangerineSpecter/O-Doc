import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {DiaryDraft, DiaryEntry} from '../types/api/diary.ts';
import {resolveDiaryRoute} from './diary.ts';

test('local 日记保存保留首段缩进，同时拒绝纯空白正文', async () => {
    const content = '\u3000\u3000第一段\n\u3000\u3000第二段';
    const draft: DiaryDraft = {title: '日记', content, entryDate: '2026-11-03', coverUrl: '', coverAssetId: null,
        imageAssetIds: [], mood: '', weather: '', tags: []};
    const request = (body: DiaryDraft) => new Request('http://local/api/diary/', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
    });
    const entry = await resolveDiaryRoute(request(draft), false) as DiaryEntry;
    assert.equal(entry.content, content);
    const rejected = await resolveDiaryRoute(request({...draft, content: '\u3000\u3000\n'}), false) as Response;
    assert.equal(rejected.status, 400);
    await resolveDiaryRoute(new Request(`http://local/api/diary/${entry.diaryId}`, {method: 'DELETE'}), false);
});
