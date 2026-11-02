import type {DiaryLibraryGroup, DiaryLibraryResponse} from '../types/api/diary';
export const diaryLibraryIds = Array.from({length: 18}, (_, index) => `diary-library-${index + 1}`);
export const diaryLibraryImage = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#d8e7e2"/><path d="M0 400 220 100 450 400" fill="#89a69d"/><circle cx="480" cy="80" r="45" fill="#fff2c9"/></svg>';
const photo = (index: number) => ({imageId: `library-photo-${index}`, assetId: diaryLibraryIds[index - 1], title: `周末散步 · 照片 ${index}`, selectable: true, reason: ''});
const groups: DiaryLibraryGroup[] = [
    {id: 'diary-group-3', title: '周末散步', photos: [1, 2, 3].map(photo)},
    {id: 'diary-group-16', title: '旅行相册（16 张）', photos: Array.from({length: 16}, (_, index) => ({...photo(index + 3), imageId: `trip-photo-${index + 3}`}))},
    {id: 'diary-group-unavailable', title: '历史外链', photos: [{imageId: 'library-external', assetId: null, title: '外链照片', selectable: false, reason: '外链或历史图片需先导入资源库'}]},
];
export function diaryLibraryRoute(url: URL, empty: boolean): DiaryLibraryResponse | undefined {
    if (url.pathname !== '/api/diary/photo-library') return undefined;
    const collId = url.searchParams.get('collId') || url.searchParams.get('coll_id');
    const keyword = url.searchParams.get('keyword') || '';
    return {collections: empty ? [] : [{id: 'diary-local-album', title: '我的照片文集', count: 20}], groups: empty || !collId ? [] : groups.filter(group => `${group.title} ${group.photos.map(photo => photo.title).join(' ')}`.includes(keyword)), page: 1, hasMore: false};
}
