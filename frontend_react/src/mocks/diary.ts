import {diaryLibraryIds, diaryLibraryRoute} from './diaryLibrary';
import {diaryResourceRoute, diaryResourceItems} from './diaryResources';
import type {DiaryDraft, DiaryEntry} from '../types/api/diary';

const today = new Date();
const day = (offset: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const entries: DiaryEntry[] = [
    {
        diaryId: 'diary-demo-1',
        title: '把平凡的日子，过得有声有色',
        content:
            '早上推开窗，阳光刚好落在书桌的一角。微风把纱帘轻轻吹起，空气里有一点秋日微凉的草木气息。\n\n给自己泡了一杯热茶，读完了搁置很久的那一章。没有特别的安排，却觉得今天过得格外充实。\n\n原来生活的答案，从来不在远方的喧嚣里，而是常常藏在这些被认真对待的细小瞬间里。',
        entryDate: day(0),
        coverUrl: `/api/resource/view/${diaryLibraryIds[0]}`,
        coverAssetId: diaryLibraryIds[0],
        imageAssetIds: [diaryLibraryIds[0], diaryLibraryIds[1]],
        mood: 'calm',
        weather: 'sunny',
        tags: ['日常', '阅读', '茶事'],
        createdAt: `${day(0)}T09:30:00+08:00`,
        updatedAt: `${day(0)}T09:30:00+08:00`,
    },
    {
        diaryId: 'diary-demo-2',
        title: '傍晚，走一条没走过的路',
        content:
            '下班后没有直接回家，沿着河边多走了一站。风很轻，路灯还没亮，水面上是慢慢散开的橘色晚霞。\n\n路过一家转角的旧书店，橱窗里亮着一盏暖黄的台灯。偶尔绕一点远路，也会遇到意料之外的好风景。',
        entryDate: day(1),
        coverUrl: `/api/resource/view/${diaryLibraryIds[2]}`,
        coverAssetId: diaryLibraryIds[2],
        imageAssetIds: [diaryLibraryIds[2]],
        mood: 'happy',
        weather: 'windy',
        tags: ['散步', '晚霞', '日常'],
        createdAt: `${day(1)}T18:20:00+08:00`,
        updatedAt: `${day(1)}T18:20:00+08:00`,
    },
    {
        diaryId: 'diary-demo-3',
        title: '关于未来的一点小计划',
        content:
            '想养成每周读书和记录的习惯。不需要一下子改变很多，每天认真完成一件小事就好。\n\n把桌上的笔记本重新整理了一遍，写下这个月想读完的三本书。下次回看这篇日记时，希望自己已经从容地迈出了第一步。',
        entryDate: day(2),
        coverUrl: '',
        coverAssetId: null,
        imageAssetIds: [],
        mood: 'excited',
        weather: 'cloudy',
        tags: ['思考', '计划', '阅读'],
        createdAt: `${day(2)}T21:10:00+08:00`,
        updatedAt: `${day(2)}T21:10:00+08:00`,
    },
    {
        diaryId: 'diary-demo-4',
        title: '听雨的夜晚，宜早点休息',
        content:
            '窗外下起了淅淅沥沥的小雨，敲在玻璃上有一种安宁的节奏。\n\n睡前把手机放远了一点，点了一支木质香调的蜡烛，听了半小时轻音乐。让今天停在这里，剩下的事情留给明天。',
        entryDate: day(3),
        coverUrl: '',
        coverAssetId: null,
        imageAssetIds: [],
        mood: 'calm',
        weather: 'rainy',
        tags: ['夜读', '日常'],
        createdAt: `${day(3)}T22:00:00+08:00`,
        updatedAt: `${day(3)}T22:00:00+08:00`,
    },
];

export async function resolveDiaryRoute(request: Request, empty: boolean) {
    const library = diaryLibraryRoute(new URL(request.url), empty);
    if (library !== undefined) return library;
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/diary/')) return diaryResourceRoute(request, entries);
    const id = path.slice('/api/diary/'.length);
    if (request.method === 'GET') return id ? entries.find(e => e.diaryId === id) : empty ? [] : entries;
    if (request.method === 'DELETE') {
        const index = entries.findIndex(e => e.diaryId === id);
        if (index >= 0) entries.splice(index, 1);
        return null;
    }
    const draft = (await request.json()) as DiaryDraft;
    if (typeof draft.content !== 'string' || !draft.content.trim()) {
        return Response.json({code: 400, msg: '正文不能为空', data: null}, {status: 400});
    }
    const existing = entries.find(e => e.diaryId === id);
    const imageAssetIds =
        draft.imageAssetIds ??
        ('coverAssetId' in draft
            ? draft.coverAssetId
                ? [draft.coverAssetId]
                : []
            : existing?.imageAssetIds || []);
    if (imageAssetIds.length > 15 || new Set(imageAssetIds).size !== imageAssetIds.length) {
        return Response.json({code: 400, msg: '每篇日记最多 15 张不重复图片', data: null}, {status: 400});
    }
    const entry: DiaryEntry = {
        ...draft,
        imageAssetIds,
        coverAssetId: imageAssetIds[0] || null,
        coverUrl: imageAssetIds.length
            ? `/api/resource/view/${imageAssetIds[0]}`
            : draft.imageAssetIds !== undefined
              ? ''
              : draft.coverUrl || existing?.coverUrl || '',
        diaryId: id || `diary-${Date.now()}`,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, entry);
    else entries.push(entry);
    return entry;
}

export const diaryMockResources = (empty: boolean) => diaryResourceItems(entries, empty);
