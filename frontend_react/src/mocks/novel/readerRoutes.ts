import type {Anthology} from '../../types/api/anthology';
import type {ReaderBook} from '../../types/api/novel';

const collectionId = 'local-novel-reader';
const chapters = [
    {id: 'local-novel-chapter-1', position: 1, publishedId: 'local-novel-revision-1'},
    {id: 'local-novel-broken', position: 2, publishedId: 'local-novel-missing'},
    {id: 'local-novel-wrong-owner', position: 3, publishedId: 'local-novel-revision-1'},
    {id: 'local-novel-chapter-2', position: 4, publishedId: 'local-novel-revision-2'},
];
const revisions = [
    {id: 'local-novel-revision-1', chapterId: 'local-novel-chapter-1', title: '第一章 · 相遇', volume: '第一卷', content: '这是已发布的本地阅读样例。'},
    {id: 'local-novel-revision-2', chapterId: 'local-novel-chapter-2', title: '第二章 · 出发', volume: '第一卷', content: '旅程从这里开始。'},
];
const visible = chapters.flatMap(chapter => {
    const revision = revisions.find(item => item.id === chapter.publishedId && item.chapterId === chapter.id);
    return revision ? [{id: chapter.id, title: revision.title, volume: revision.volume,
        position: chapter.position, content: revision.content}] : [];
});
const notFound = () => Response.json({code: 404, msg: '资源不存在', data: null}, {status: 404});

export function novelReaderSample(empty: boolean, authenticated: boolean): Anthology | null {
    const owner = authenticated && empty;
    if (empty && !owner) return null;
    const available = empty ? [] : visible;
    return {collId: collectionId, title: '远行的故事', type: 'novel', permission: 'public',
        count: available.length, iconId: 'book', isTop: false, hideCoverContent: false,
        // This fixture covers reading; management APIs are not mocked.
        description: '一个关于旅途的公开故事。', canManage: false,
        articles: available.slice(0, 3).map(chapter => ({chapterId: chapter.id, title: chapter.title, date: '10-28'}))};
}

export async function resolveNovelReaderRoute(request: Request, empty: boolean): Promise<unknown> {
    if (request.method !== 'GET') return undefined;
    const path = new URL(request.url).pathname;
    const book = novelReaderSample(empty, Boolean(request.headers.get('Authorization')));
    const available = empty ? [] : visible;
    const read = path.match(/^\/api\/novel\/([^/]+)\/read\/(?:([^/]+)\/)?$/);
    if (!read) return undefined;
    if (decodeURIComponent(read[1]) !== collectionId) return notFound();
    if (!book) return notFound();
    const selected = read[2] ? available.find(chapter => chapter.id === decodeURIComponent(read[2])) : available[0];
    if (read[2] && !selected) return notFound();
    const result: ReaderBook = {id: collectionId, title: book.title, synopsis: book.description, canManage: Boolean(book.canManage),
        chapters: available.map(({id, title, volume, position}) => ({id, title, volume, position})),
        chapter: selected ? {id: selected.id, title: selected.title, content: selected.content} : null};
    return result;
}
