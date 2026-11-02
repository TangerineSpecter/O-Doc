import {diaryLibraryIds, diaryLibraryImage} from './diaryLibrary';
import type {ResourceItem, ResourceUploadResponse} from '../types/api/resources';
import type {DiaryEntry} from '../types/api/diary';
const files = new Map<string, {file: File; item: ResourceItem}>();
export async function diaryResourceRoute(request: Request, entries: DiaryEntry[]): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname;
    if (path === '/api/resource/upload' && request.method === 'POST') {
        const data = await request.formData();
        if (data.get('source_type') !== 'diary') return undefined;
        const candidate = data.get('file');
        const mime = candidate instanceof File && !candidate.type ? ({png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp'} as Record<string, string>)[candidate.name.split('.').pop()!.toLowerCase()] : '';
        const file = candidate instanceof File && mime ? new File([candidate], candidate.name, {type: mime}) : candidate;
        if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) return Response.json({code: 400, msg: '图片类型或大小无效', data: null}, {status: 400});
        const id = `diary-image-${Date.now()}-${files.size}`;
        const item: ResourceItem = {id, name: file.name, type: 'image', size: file.size, date: new Date().toISOString(), linked: false, fileExists: true, sourceArticle: null, sourceType: 'diary'};
        files.set(id, {file, item});
        return {...item, duplicate: false} satisfies ResourceUploadResponse;
    }
    const match = path.match(/^\/api\/resource\/(view|download|delete)\/([^/]+)$/);
    if (match && ['download', 'view'].includes(match[1]) && diaryLibraryIds.includes(match[2])) return new Response(diaryLibraryImage, {headers: {'Content-Type': 'image/svg+xml'}});
    if (match && files.has(match[2])) {
        const id = match[2], saved = files.get(id)!;
        if (match[1] === 'delete') {
            if (entries.some(e => e.imageAssetIds.includes(id))) return Response.json({code: 409, msg: '图片已关联日记', data: null}, {status: 409});
            files.delete(id); return null;
        }
        return new Response(saved.file, {headers: {'Content-Type': saved.file.type}});
    }
    // Merge diary uploads into the normal resource sample list instead of hiding other resources.
    return undefined;
}
export function diaryResourceItems(entries: DiaryEntry[], empty: boolean): ResourceItem[] {
    if (empty) return [];
    const library = diaryLibraryIds.filter(id => entries.some(entry => entry.imageAssetIds.includes(id))).map(id => ({file: new File([diaryLibraryImage], `${id}.svg`, {type: 'image/svg+xml'}), item: {id, name: '图片文集照片', type: 'image', size: diaryLibraryImage.length, date: new Date().toISOString(), linked: true, fileExists: true, sourceArticle: null, sourceType: 'image'} satisfies ResourceItem}));
    return [...library, ...files.values()].map(({item}) => {const entry = entries.find(e => e.imageAssetIds.includes(item.id)); return {...item, linked: !!entry, sourceDiary: entry ? {id: entry.diaryId, title: entry.title} : null};});
}
