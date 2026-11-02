import {diaryLibraryRoute} from './diaryLibrary';
import {diaryResourceRoute, diaryResourceItems} from './diaryResources';
import type {DiaryDraft, DiaryEntry} from '../types/api/diary';
const today = new Date();
const day = (offset: number) => {const date = new Date(today); date.setDate(date.getDate() - offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;};
export const entries: DiaryEntry[] = [
    {diaryId: 'diary-demo-1', title: '把平凡的日子，过得有声有色', content: '早上推开窗，阳光刚好落在书桌的一角。\n\n给自己泡了一杯茶，读完了搁置很久的那一章。没有特别的安排，却觉得今天过得很充实。原来生活的答案，常常藏在这些细小的瞬间里。', entryDate: day(0), coverUrl: '', coverAssetId: null, imageAssetIds: [], mood: 'calm', weather: 'sunny', tags: ['日常'], createdAt: `${day(0)}T09:30:00+08:00`, updatedAt: `${day(0)}T09:30:00+08:00`},
    {diaryId: 'diary-demo-2', title: '傍晚，走一条没走过的路', content: '下班后没有直接回家，沿着河边多走了一站。风很轻，路灯还没亮，水面上是慢慢散开的晚霞。\n偶尔绕一点远路，也会遇到意料之外的好风景。', entryDate: day(1), coverUrl: '', coverAssetId: null, imageAssetIds: [], mood: 'calm', weather: 'sunny', tags: ['日常'], createdAt: `${day(1)}T18:20:00+08:00`, updatedAt: `${day(1)}T18:20:00+08:00`},
    {diaryId: 'diary-demo-3', title: '关于未来的一点小计划', content: '想养成每周读书和记录的习惯。不需要一下子改变很多，每天认真完成一件小事就好。\n下次回看这篇日记时，希望自己已经迈出第一步。', entryDate: day(2), coverUrl: '', coverAssetId: null, imageAssetIds: [], mood: 'calm', weather: 'sunny', tags: ['日常'], createdAt: `${day(2)}T21:10:00+08:00`, updatedAt: `${day(2)}T21:10:00+08:00`},
    {diaryId: 'diary-demo-4', title: '今晚早点休息', content: '睡前把手机放远了一点，听了半小时轻音乐。让今天停在这里，剩下的事情留给明天。', entryDate: day(3), coverUrl: '', coverAssetId: null, imageAssetIds: [], mood: 'calm', weather: 'sunny', tags: ['日常'], createdAt: `${day(3)}T22:00:00+08:00`, updatedAt: `${day(3)}T22:00:00+08:00`},
];
export async function resolveDiaryRoute(request: Request, empty: boolean) {
    const library = diaryLibraryRoute(new URL(request.url), empty);
    if (library !== undefined) return library;
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/diary/')) return diaryResourceRoute(request, entries);
    const id = path.slice('/api/diary/'.length);
    if (request.method === 'GET') return id ? entries.find(e => e.diaryId === id) : empty ? [] : entries;
    if (request.method === 'DELETE') {const index = entries.findIndex(e => e.diaryId === id); if (index >= 0) entries.splice(index, 1); return null;}
    const draft = await request.json() as DiaryDraft;
    const existing = entries.find(e => e.diaryId === id);
    const imageAssetIds = draft.imageAssetIds ?? ('coverAssetId' in draft ? draft.coverAssetId ? [draft.coverAssetId] : [] : existing?.imageAssetIds || []);
    if (imageAssetIds.length > 15 || new Set(imageAssetIds).size !== imageAssetIds.length) return Response.json({code: 400, msg: '每篇日记最多 15 张不重复图片', data: null}, {status: 400});
    const entry: DiaryEntry = {...draft, imageAssetIds, coverAssetId: imageAssetIds[0] || null, coverUrl: imageAssetIds.length ? `/api/resource/view/${imageAssetIds[0]}` : draft.imageAssetIds !== undefined ? '' : draft.coverUrl || existing?.coverUrl || '', diaryId: id || `diary-${Date.now()}`, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()};
    if (existing) Object.assign(existing, entry); else entries.push(entry);
    return entry;
}

export const diaryMockResources = (empty: boolean) => diaryResourceItems(entries, empty);
