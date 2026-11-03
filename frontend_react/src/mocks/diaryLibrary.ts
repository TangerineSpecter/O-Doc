import type {DiaryLibraryGroup, DiaryLibraryResponse} from '../types/api/diary';

export const diaryLibraryIds = Array.from({length: 18}, (_, index) => `diary-library-${index + 1}`);

export const diaryLibraryImage =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="800" height="520"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F4F4F5"/><stop offset="100%" stop-color="#E4E4E7"/></linearGradient></defs><rect width="800" height="520" fill="url(#sky)"/><circle cx="600" cy="140" r="54" fill="#FFFFFF"/><path d="M0 400 L190 210 L370 330 L560 175 L800 340 L800 520 L0 520 Z" fill="#A1A1AA" opacity="0.45"/><path d="M0 430 L140 280 L320 390 L500 240 L730 430 L800 390 L800 520 L0 520 Z" fill="#52525B" opacity="0.65"/><rect y="425" width="800" height="95" fill="#27272A"/></svg>';

const photo = (index: number) => ({
    imageId: `library-photo-${index}`,
    assetId: diaryLibraryIds[index - 1],
    title: `周末散步 · 照片 ${index}`,
    selectable: true,
    reason: '',
});

const groups: DiaryLibraryGroup[] = [
    {id: 'diary-group-3', title: '周末散步', photos: [1, 2, 3].map(photo)},
    {
        id: 'diary-group-16',
        title: '旅行相册（16 张）',
        photos: Array.from({length: 16}, (_, index) => ({
            ...photo(index + 3),
            imageId: `trip-photo-${index + 3}`,
        })),
    },
    {
        id: 'diary-group-unavailable',
        title: '历史外链',
        photos: [
            {
                imageId: 'library-external',
                assetId: null,
                title: '外链照片',
                selectable: false,
                reason: '外链或历史图片需先导入资源库',
            },
        ],
    },
    ...Array.from({length: 12}, (_, index) => ({
        id: `diary-group-extra-${index + 1}`,
        title: `散步片段 ${index + 1}`,
        photos: [photo(index + 1)],
    })),
];

export function diaryLibraryRoute(url: URL, empty: boolean): DiaryLibraryResponse | undefined {
    if (url.pathname !== '/api/diary/photo-library') return undefined;
    const collId = url.searchParams.get('collId') || url.searchParams.get('coll_id');
    const keyword = url.searchParams.get('keyword') || '';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const filtered = empty || !collId ? [] : groups.filter(group =>
        `${group.title} ${group.photos.map(photo => photo.title).join(' ')}`.includes(keyword));
    const start = (page - 1) * 12;
    return {
        collections: empty ? [] : [{id: 'diary-local-album', title: '我的照片文集', count: 20}],
        groups: filtered.slice(start, start + 12),
        page: collId ? page : 1,
        hasMore: start + 12 < filtered.length,
    };
}
