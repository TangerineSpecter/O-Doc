import type {Image, GroupPhotoPayload} from '../../api/image';
import type {ResourceUploadResponse} from '../../types/api/resources';

export const localImageCollectionId = 'local-photo-collection';
export const localImageSecondaryCollectionId = 'local-photo-secondary';
export const localImageGroupId = 'local-photo-group';
const localImageCollections = new Set([localImageCollectionId, localImageSecondaryCollectionId]);
const now = '2026-10-28T10:00:00';
const initial: Image[] = [0, 1].map(index => ({
    imageId: `local-photo-${index + 1}`, title: '本地拍摄组', description: '本地演示照片，不使用真实数据。',
    imageUrl: '/favicon.svg', collId: localImageCollectionId, photoGroupId: localImageGroupId,
    groupIndex: index, focalLength: index ? '50' : '35', country: '中国', city: '上海',
    author: 'local-user', authorNickname: '本地演示', createdAt: now, updatedAt: now, isValid: true,
}));
initial.push({...initial[0], imageId: 'local-photo-foreign', title: '另一拍摄组', photoGroupId: 'local-photo-other', groupIndex: 0});
let images = initial.map(image => ({...image}));
let sequence = 1;
const uploads = new Map<string, File>();

export function resetImageGalleryMock() {
    images = initial.map(image => ({...image}));
    sequence = 1;
    uploads.clear();
}

const failure = (status: number, code: number, data: string) =>
    Response.json({code, msg: code === 404 ? '资源不存在' : '参数错误', data}, {status});
const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export async function resolveImageGalleryRoute(request: Request, empty: boolean): Promise<unknown> {
    const path = new URL(request.url).pathname;
    if (path === '/api/settings/locations/' && request.method === 'GET') {
        return empty ? [] : [{id: 'local-shanghai', country: '中国', city: '上海', latitude: '31.230400', longitude: '121.473700'}];
    }
    const list = path.match(/^\/api\/article\/image\/list\/([^/]+)$/);
    if (list && request.method === 'GET' && localImageCollections.has(decodeURIComponent(list[1]))) {
        const collectionId = decodeURIComponent(list[1]);
        return empty ? [] : images.filter(image => image.collId === collectionId);
    }
    const detail = path.match(/^\/api\/article\/image\/detail\/(local-photo-[^/]+)$/);
    if (detail && request.method === 'GET') {
        const image = empty ? undefined : images.find(item => item.imageId === decodeURIComponent(detail[1]));
        return image || failure(404, 404, '照片不存在');
    }
    const removeImage = path.match(/^\/api\/article\/image\/delete\/(local-photo-[^/]+)$/);
    if (removeImage && request.method === 'DELETE') {
        if (!request.headers.get('Authorization')) return failure(403, 403, '请先登录');
        const image = empty ? undefined : images.find(item => item.imageId === decodeURIComponent(removeImage[1]));
        if (!image) return failure(404, 404, '照片不存在');
        images = images.filter(item => item.imageId !== image.imageId);
        const group = image.photoGroupId && images.filter(item => item.photoGroupId === image.photoGroupId);
        if (group && group.length === 1) Object.assign(group[0], {photoGroupId: '', groupIndex: 0});
        return null;
    }
    const updateImage = path.match(/^\/api\/article\/image\/update\/(local-photo-[^/]+)$/);
    const createImage = path === '/api/article/image/create' && request.method === 'POST';
    if (createImage || (updateImage && request.method === 'PUT')) {
        if (!request.headers.get('Authorization')) return failure(403, 403, '请先登录');
        const previous = updateImage && !empty ? images.find(item => item.imageId === decodeURIComponent(updateImage[1])) : undefined;
        if (updateImage && !previous) return failure(404, 404, '照片不存在');
        let body: unknown;
        try {body = await request.json();} catch {return failure(400, 400, '照片数据格式无效');}
        if (!record(body)) return failure(400, 400, '照片数据格式无效');
        const requestedCollId = 'collId' in body ? body.collId : 'coll_id' in body ? body.coll_id : previous?.collId ?? '';
        if (updateImage && ((typeof requestedCollId !== 'string' && typeof requestedCollId !== 'number')
            || !String(requestedCollId).trim() || String(requestedCollId).trim().length > 32)) {
            return failure(400, 400, '文集 ID 无效');
        }
        const collId = String(requestedCollId).trim();
        if (!localImageCollections.has(collId)) return failure(404, 404, '文集不存在');
        const title = String(body.title ?? previous?.title ?? '');
        const imageUrl = String(body.imageUrl ?? body.image_url ?? previous?.imageUrl ?? '');
        const focalLength = String(body.focalLength ?? body.focal_length ?? previous?.focalLength ?? '').trim();
        if (!title || !imageUrl || (focalLength && !/^\d+$/.test(focalLength))) return failure(200, 400, '照片数据无效');
        const locationId = body.locationId ?? body.location_id;
        if (locationId && locationId !== 'local-shanghai') return failure(200, 400, '拍摄地点不存在');
        const locationDetail = locationId === 'local-shanghai'
            ? {id: 'local-shanghai', country: '中国', city: '上海', latitude: '31.230400', longitude: '121.473700'} : null;
        const shootingTime = String(body.shootingTime ?? body.shooting_time ?? previous?.shootingTime ?? '');
        const tags = String(body.tags ?? previous?.tagsList?.join(', ') ?? '');
        const moving = Boolean(previous && previous.collId !== collId);
        const image: Image = {...previous, imageId: previous?.imageId || `local-photo-created-${sequence++}`, title,
            imageUrl, collId, focalLength, description: String(body.description ?? previous?.description ?? ''),
            ...(moving ? {photoGroupId: '', groupIndex: 0} : {}),
            country: locationDetail?.country || String(body.country ?? previous?.country ?? ''),
            city: locationDetail?.city || String(body.city ?? previous?.city ?? ''),
            placeName: String(body.placeName ?? body.place_name ?? previous?.placeName ?? ''),
            ...(locationId !== undefined ? {location: String(locationId || ''), locationDetail} : {}),
            shootingTime, shootingTimeStr: shootingTime ? shootingTime.slice(0, 10) : undefined,
            tagsList: tags.split(/[,，、;；\n]/).map(tag => tag.trim()).filter(Boolean),
            author: previous?.author || 'local-user', authorNickname: previous?.authorNickname || '本地演示',
            createdAt: previous?.createdAt || now, updatedAt: now, isValid: true};
        images = [...images.filter(item => item.imageId !== image.imageId), image];
        if (moving && previous?.photoGroupId) {
            const remaining = images.filter(item => item.collId === previous.collId && item.photoGroupId === previous.photoGroupId);
            if (remaining.length === 1) Object.assign(remaining[0], {photoGroupId: '', groupIndex: 0});
        }
        return image;
    }
    if (path === '/api/resource/upload' && request.method === 'POST') {
        const form = await request.clone().formData();
        if (form.get('source_type') !== 'image') return undefined;
        if (!request.headers.get('Authorization')) return failure(403, 403, '请先登录');
        const file = form.get('file');
        if (!(file instanceof File) || !file.type.startsWith('image/')) return failure(400, 400, '请选择图片');
        const id = `local-photo-upload-${sequence++}`;
        uploads.set(id, file);
        return {id, name: file.name, type: 'image', size: file.size, date: now, linked: false,
            sourceArticle: null, sourceType: 'image'} satisfies ResourceUploadResponse;
    }
    const asset = path.match(/^\/api\/resource\/view\/(local-photo-upload-\d+)$/);
    if (asset && request.method === 'GET') {
        const file = uploads.get(asset[1]);
        return file ? new Response(await file.arrayBuffer(), {headers: {'Content-Type': file.type}})
            : failure(404, 404, '图片资源不存在');
    }
    const remove = path.match(/^\/api\/article\/image\/group\/(local-photo-[^/]+)\/delete$/);
    if (remove && request.method === 'DELETE') {
        if (!request.headers.get('Authorization')) return failure(403, 403, '请先登录');
        const groupId = decodeURIComponent(remove[1]);
        if (empty || !images.some(image => image.photoGroupId === groupId)) return failure(404, 404, '拍摄组不存在');
        images = images.filter(image => image.photoGroupId !== groupId);
        return null;
    }
    const group = path.match(/^\/api\/article\/image\/group\/(local-photo-[^/]+)$/);
    const create = path === '/api/article/image/group/create' && request.method === 'POST';
    if (!(create || (group && request.method === 'PUT'))) return undefined;
    if (!request.headers.get('Authorization')) return failure(403, 403, '请先登录');
    let body: unknown;
    try {body = await request.json();} catch {return failure(400, 400, '照片数据格式无效');}
    if (!record(body)) return failure(400, 400, '照片数据格式无效');
    if (!Array.isArray(body.photos) || !body.photos.length) return failure(200, 400, '请至少保留一张照片');
    if (body.photos.some(photo => !record(photo))) return failure(create ? 200 : 400, 400, '照片数据格式无效');
    const photos = body.photos as Array<GroupPhotoPayload & {image_id?: string; image_url?: string; focal_length?: string; group_index?: number}>;
    const ids = photos.map(photo => String(photo.imageId || photo.image_id || '')).filter(Boolean);
    if (new Set(ids).size !== ids.length) return failure(create ? 200 : 400, 400, '同一张照片不能重复加入拍摄组');
    const groupId = create ? `local-photo-created-${sequence++}` : decodeURIComponent(group![1]);
    const collectionId = create ? String(body.collId || body.coll_id || '') : '';
    const existing = empty ? [] : images.filter(image => create
        ? ids.includes(image.imageId) && image.collId === collectionId : image.photoGroupId === groupId);
    if (!create && !existing.length) return failure(404, 404, '拍摄组不存在');
    if (create && !localImageCollections.has(collectionId)) return failure(404, 404, '文集不存在');
    if (create && ids.length !== existing.length) return failure(404, 404, '待转换的图片不存在');
    if (!create && ids.some(id => !existing.some(image => image.imageId === id))) {
        return failure(400, 400, '照片已不在此拍摄组，请刷新后重试');
    }
    const title = String(body.title || existing[0]?.title || '');
    if (!title.trim()) return failure(200, 400, '请输入照片标题');
    if (photos.some(photo => !photo.imageId && !photo.image_id && !(photo.imageUrl || photo.image_url))) {
        return failure(200, 400, '请选择照片');
    }
    if (photos.some(photo => {
        const focalLength = String(photo.focalLength ?? photo.focal_length ?? '').trim();
        const groupIndex = photo.groupIndex ?? photo.group_index;
        return (focalLength !== '' && !/^\d+$/.test(focalLength))
            || (groupIndex !== undefined && (!Number.isInteger(Number(groupIndex)) || Number(groupIndex) < 0));
    })) return failure(200, 400, '照片焦段或顺序无效');
    const locationId = body.locationId ?? body.location_id;
    if (locationId && locationId !== 'local-shanghai') return failure(200, 400, '拍摄地点不存在');
    const locationDetail = locationId === 'local-shanghai'
        ? {id: 'local-shanghai', country: '中国', city: '上海', latitude: '31.230400', longitude: '121.473700'} : null;
    const previousGroups = create ? new Set(existing.map(image => image.photoGroupId).filter(Boolean)) : new Set<string>();
    const updated = photos.map((photo, index): Image => {
        const id = String(photo.imageId || photo.image_id || '');
        const previous = existing.find(image => image.imageId === id);
        const shootingTime = String(body.shootingTime ?? body.shooting_time ?? previous?.shootingTime ?? '');
        const tags = String(body.tags ?? previous?.tagsList?.join(', ') ?? '');
        return {
            ...previous, imageId: id || `local-photo-created-${sequence++}`, title,
            description: String(body.description ?? previous?.description ?? ''),
            imageUrl: previous?.imageUrl || String(photo.imageUrl || photo.image_url), collId: create ? collectionId : existing[0].collId,
            focalLength: String(photo.focalLength ?? photo.focal_length ?? previous?.focalLength ?? ''),
            photoGroupId: photos.length === 1 ? '' : groupId, groupIndex: photos.length === 1 ? 0 : Number(photo.groupIndex ?? photo.group_index ?? index),
            shootingTime, shootingTimeStr: shootingTime ? shootingTime.slice(0, 10) : undefined,
            country: locationDetail?.country || String(body.country ?? previous?.country ?? ''),
            city: locationDetail?.city || String(body.city ?? previous?.city ?? ''),
            placeName: String(body.placeName ?? body.place_name ?? previous?.placeName ?? ''),
            ...(locationId !== undefined ? {location: String(locationId || ''), locationDetail} : {}),
            tagsList: tags.split(/[,，、;；\n]/).map(tag => tag.trim()).filter(Boolean),
            author: previous?.author || 'local-user', authorNickname: previous?.authorNickname || '本地演示',
            createdAt: previous?.createdAt || now, updatedAt: now, isValid: true,
        };
    });
    images = [...images.filter(image => image.photoGroupId !== groupId && !ids.includes(image.imageId)), ...updated];
    for (const previousGroup of previousGroups) {
        const remaining = images.filter(image => image.collId === collectionId && image.photoGroupId === previousGroup);
        if (remaining.length === 1) Object.assign(remaining[0], {photoGroupId: '', groupIndex: 0});
    }
    return updated;
}
