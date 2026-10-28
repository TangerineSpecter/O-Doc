import assert from 'node:assert/strict';
import test from 'node:test';
import {localImageCollectionId, localImageSecondaryCollectionId, localImageGroupId, resetImageGalleryMock, resolveImageGalleryRoute} from './groupRoutes.ts';
import type {Image} from '../../api/image.ts';

const request = (path: string, method = 'GET', body?: unknown) => new Request(`http://localhost${path}`, {
    method, headers: {Authorization: 'Token local-demo-token', ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
});
const listPath = `/api/article/image/list/${localImageCollectionId}`;
const groupPath = `/api/article/image/group/${localImageGroupId}`;

test('local group list, detail and invalid edits preserve the original images', async () => {
    resetImageGalleryMock();
    const original = await resolveImageGalleryRoute(request(listPath), false) as Image[];
    assert.equal(original.length, 3);
    assert.equal((await resolveImageGalleryRoute(request('/api/article/image/detail/local-photo-1'), false) as Image).title, '本地拍摄组');
    for (const photos of [
        [{imageId: 'local-photo-missing'}],
        [{imageId: 'local-photo-1'}, {imageId: 'local-photo-foreign'}],
        [{imageId: 'local-photo-1'}, {imageId: 'local-photo-1'}],
    ]) {
        const response = await resolveImageGalleryRoute(request(groupPath, 'PUT', {photos}), false) as Response;
        assert.equal(response.status, 400);
        assert.equal((await response.json()).code, 400);
        assert.deepEqual(await resolveImageGalleryRoute(request(listPath), false), original);
    }
    assert.deepEqual(await resolveImageGalleryRoute(request(listPath), true), []);
    assert.equal((await resolveImageGalleryRoute(request('/api/article/image/detail/local-photo-1'), true) as Response).status, 404);
});

test('local valid edit can remove and add photos; groups reject unauthenticated requests', async () => {
    resetImageGalleryMock();
    const updated = await resolveImageGalleryRoute(request(groupPath, 'PUT', {title: '更新',
        placeName: '街角', locationId: 'local-shanghai', tags: '旅行, 城市', photos: [
        {imageId: 'local-photo-1', imageUrl: '/favicon.svg', focalLength: '50', groupIndex: 0},
        {imageUrl: '/favicon.svg', focalLength: '85', groupIndex: 1},
    ]}), false) as Image[];
    assert.deepEqual(updated.map(image => image.focalLength), ['50', '85']);
    assert.equal(updated[0].imageId, 'local-photo-1');
    assert.equal(updated[0].locationDetail?.city, '上海');
    assert.equal(updated[0].placeName, '街角');
    assert.deepEqual(updated[0].tagsList, ['旅行', '城市']);
    const rows = await resolveImageGalleryRoute(request(listPath), false) as Image[];
    assert.equal(rows.some(image => image.imageId === 'local-photo-2'), false);
    assert.equal(rows.some(image => image.imageId === 'local-photo-foreign'), true);
    const unauthorized = new Request(`http://localhost${groupPath}`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({photos: []})});
    assert.equal((await resolveImageGalleryRoute(unauthorized, false) as Response).status, 403);
    const invalid = await resolveImageGalleryRoute(request(groupPath, 'PUT', {photos: [
        {imageId: 'local-photo-1', imageUrl: '/favicon.svg', focalLength: 'not-a-number', groupIndex: 0},
    ]}), false) as Response;
    assert.equal(invalid.status, 200);
    assert.equal((await invalid.json()).code, 400);
});

test('local upload and new group stay in memory, with no fallback for unrelated routes', async () => {
    resetImageGalleryMock();
    const form = new FormData();
    form.append('source_type', 'image');
    form.append('file', new File(['fake image'], 'sample.png', {type: 'image/png'}));
    const upload = new Request('http://localhost/api/resource/upload', {method: 'POST', headers: {Authorization: 'Token local-demo-token'}, body: form});
    const asset = await resolveImageGalleryRoute(upload, false) as {id: string};
    assert.equal(await (await resolveImageGalleryRoute(request(`/api/resource/view/${asset.id}`), false) as Response).text(), 'fake image');
    const created = await resolveImageGalleryRoute(request('/api/article/image/group/create', 'POST', {
        collId: localImageCollectionId, title: '新组', photos: [{imageUrl: `/api/resource/view/${asset.id}`, groupIndex: 0}],
    }), false) as Image[];
    assert.equal(created.length, 1);
    assert.equal(created[0].photoGroupId, '');
    assert.equal(await resolveImageGalleryRoute(request('/api/article/image/list/other-collection'), false), undefined);
});

test('local group creation can include an existing photo and group deletion updates the list', async () => {
    resetImageGalleryMock();
    const created = await resolveImageGalleryRoute(request('/api/article/image/group/create', 'POST', {
        collId: localImageCollectionId, title: '转换', photos: [
            {imageId: 'local-photo-1', imageUrl: '/favicon.svg', groupIndex: 0},
            {imageUrl: '/favicon.svg', groupIndex: 1},
        ],
    }), false) as Image[];
    assert.equal(created[0].imageId, 'local-photo-1');
    assert.ok(created[0].photoGroupId);
    let rows = await resolveImageGalleryRoute(request(listPath), false) as Image[];
    assert.equal(rows.filter(image => image.imageId === 'local-photo-1').length, 1);
    assert.equal(rows.find(image => image.imageId === 'local-photo-2')?.photoGroupId, '');
    assert.equal(await resolveImageGalleryRoute(request(`/api/article/image/group/${created[0].photoGroupId}/delete`, 'DELETE'), false), null);
    rows = await resolveImageGalleryRoute(request(listPath), false) as Image[];
    assert.equal(rows.some(image => image.imageId === 'local-photo-1'), false);
    assert.equal(rows.some(image => image.imageId === 'local-photo-2'), true);
});

test('converting an existing photo retains its URL even if the request omits or changes it', async () => {
    for (const imageUrl of [undefined, '/outdated.png']) {
        resetImageGalleryMock();
        const created = await resolveImageGalleryRoute(request('/api/article/image/group/create', 'POST', {
            collId: localImageCollectionId, title: '转换', photos: [
                {imageId: 'local-photo-1', imageUrl}, {imageUrl: '/new.png'},
            ],
        }), false) as Image[];
        assert.equal(created[0].imageUrl, '/favicon.svg');
        const rows = await resolveImageGalleryRoute(request(listPath), false) as Image[];
        assert.equal(rows.find(image => image.imageId === 'local-photo-1')?.imageUrl, '/favicon.svg');
    }
});

test('replacing a group with one new photo returns the ungrouped survivor', async () => {
    resetImageGalleryMock();
    const result = await resolveImageGalleryRoute(request(groupPath, 'PUT', {
        title: '替换', photos: [{imageUrl: '/favicon.svg', focalLength: '35', groupIndex: 0}],
    }), false) as Image[];
    assert.equal(result.length, 1);
    assert.equal(result[0].photoGroupId, '');
    assert.equal(result[0].focalLength, '35');
    const list = await resolveImageGalleryRoute(request(listPath), false) as Image[];
    assert.equal(list.some(image => image.imageId === result[0].imageId), true);
    assert.equal(list.some(image => image.imageId === 'local-photo-1'), false);
});

test('removing one local photo keeps the other photo and clears its group', async () => {
    resetImageGalleryMock();
    assert.equal(await resolveImageGalleryRoute(request('/api/article/image/delete/local-photo-1', 'DELETE'), false), null);
    const rows = await resolveImageGalleryRoute(request(listPath), false) as Image[];
    assert.equal(rows.some(image => image.imageId === 'local-photo-1'), false);
    assert.equal(rows.find(image => image.imageId === 'local-photo-2')?.photoGroupId, '');
    assert.equal((await resolveImageGalleryRoute(request('/api/article/image/delete/local-photo-1', 'DELETE'), false) as Response).status, 404);
});

test('single photo local creation, editing and missing IDs match the interface', async () => {
    resetImageGalleryMock();
    const created = await resolveImageGalleryRoute(request('/api/article/image/create', 'POST', {
        collId: localImageCollectionId, title: '单张', imageUrl: '/favicon.svg', focalLength: '35',
    }), false) as Image;
    const updated = await resolveImageGalleryRoute(request(`/api/article/image/update/${created.imageId}`, 'PUT', {
        title: '修改', focalLength: '50', tags: '城市, 旅行',
    }), false) as Image;
    assert.equal(updated.title, '修改');
    assert.equal(updated.focalLength, '50');
    assert.deepEqual(updated.tagsList, ['城市', '旅行']);
    const reread = await resolveImageGalleryRoute(request(`/api/article/image/detail/${created.imageId}`), false) as Image;
    assert.equal(reread.title, '修改');
    for (const [path, method] of [
        ['/api/article/image/detail/local-photo-missing', 'GET'],
        ['/api/article/image/update/local-photo-missing', 'PUT'],
        ['/api/article/image/delete/local-photo-missing', 'DELETE'],
    ]) {
        const result = await resolveImageGalleryRoute(request(path, method, method === 'PUT' ? {title: '不存在'} : undefined), false) as Response;
        assert.equal(result.status, 404);
        assert.equal((await result.json()).code, 404);
    }
});

test('moving a local grouped photo updates both collections and detaches singleton groups', async () => {
    resetImageGalleryMock();
    const moved = await resolveImageGalleryRoute(request('/api/article/image/update/local-photo-1', 'PUT', {
        collId: localImageSecondaryCollectionId,
    }), false) as Image;
    assert.equal(moved.collId, localImageSecondaryCollectionId);
    assert.equal(moved.photoGroupId, '');
    const source = await resolveImageGalleryRoute(request(listPath), false) as Image[];
    const target = await resolveImageGalleryRoute(request(`/api/article/image/list/${localImageSecondaryCollectionId}`), false) as Image[];
    assert.equal(source.some(image => image.imageId === moved.imageId), false);
    assert.equal(source.find(image => image.imageId === 'local-photo-2')?.photoGroupId, '');
    assert.equal(target.length, 1);
    assert.equal(target[0].imageId, moved.imageId);
});

test('invalid collection IDs fail before changing local photos', async () => {
    resetImageGalleryMock();
    const before = await resolveImageGalleryRoute(request(listPath), false);
    for (const collId of [null, [], {}, true, '', ' '.repeat(3), 'x'.repeat(33)]) {
        const response = await resolveImageGalleryRoute(request('/api/article/image/update/local-photo-1', 'PUT',
            {collId, title: '不应保存'}), false) as Response;
        assert.equal(response.status, 400);
        assert.equal((await response.json()).code, 400);
        assert.deepEqual(await resolveImageGalleryRoute(request(listPath), false), before);
    }
});
