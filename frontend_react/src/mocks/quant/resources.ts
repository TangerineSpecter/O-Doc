import {HttpResponse} from 'msw';
import type {ResourceUploadResponse, ResourceItem, ResourceListResponse} from '../../types/api/resources';
import {mockScenario, persistQuantState, quantId, quantState} from './state';
import type {MockQuantAsset} from './fixtures';
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
export const mockAssetDownload = (asset: MockQuantAsset) => {
    const headers = {'Content-Type': asset.mimeType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`, 'X-Content-Type-Options': 'nosniff'};
    if (asset.dataUrl) {
        const encoded = asset.dataUrl.slice(asset.dataUrl.indexOf(',') + 1);
        const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
        return new HttpResponse(bytes, {headers});
    }
    return new HttpResponse(asset.text, {headers});
};
export async function resolveQuantResources(request: Request): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
    if (path === '/api/resource/list' && request.method === 'GET') {
        if (!request.headers.get('Authorization')) return fail(403, '请先登录后查看资源');
        if (mockScenario() === 'error') return fail(503, '本地模拟资源接口失败');
        const state = quantState();
        const allRows: ResourceItem[] = state.assets.map(asset => {
            const entry = state.entries.find(row => row.attachments.some(ref => ref.assetId === asset.id));
            return {id: asset.id, name: asset.name, type: asset.type, size: asset.size, date: entry?.updatedAt || new Date().toISOString(), linked: Boolean(entry), fileExists: true, sourceArticle: null, sourceType: 'quant', sourceQuant: entry ? {id: entry.id, title: entry.title, collId: entry.collId} : null};
        });
        const rows = allRows.filter(row => (!url.searchParams.get('type') || url.searchParams.get('type') === 'all' || row.type === url.searchParams.get('type')) && (!url.searchParams.get('searchQuery') || row.name.toLowerCase().includes(url.searchParams.get('searchQuery')!.toLowerCase())) && (!url.searchParams.has('linked') || row.linked === (url.searchParams.get('linked') === 'true')) && url.searchParams.get('missing') !== 'true');
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1), pageSize = Math.max(1, Number(url.searchParams.get('pageSize')) || 24);
        const totalSize = rows.reduce((size, row) => size + row.size, 0);
        return {list: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, hasMore: page * pageSize < rows.length, totalSize, formattedTotalSize: {size: totalSize, unit: 'B'}, typeSizes: Object.fromEntries([...new Set(allRows.map(row => row.type))].map(type => [type, {size: allRows.filter(row => row.type === type).reduce((size, row) => size + row.size, 0), unit: 'B'}]))} satisfies ResourceListResponse;
    }
    if (path === '/api/resource/upload' && request.method === 'POST') {
        const form = await request.clone().formData();
        if (form.get('source_type') !== 'quant') return undefined;
        if (!request.headers.get('Authorization')) return fail(403, '请先登录后上传');
        if (mockScenario() === 'error') return fail(503, '本地模拟上传失败，请切回样例状态重试');
        const file = form.get('file');
        if (!(file instanceof File)) return fail(400, '请选择上传文件');
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const type = ['py', 'pine', 'mq4', 'mqh', 'mq5', 'ipynb', 'html'].includes(ext) ? 'code' : ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? 'image' : ext === 'zip' ? 'archive' : ['pdf', 'txt', 'md', 'csv'].includes(ext) ? 'document' : 'other';
        const bytes = file.size <= 1024 * 1024 ? new Uint8Array(await file.arrayBuffer()) : null;
        const text = bytes && type !== 'image' ? new TextDecoder().decode(bytes) : '';
        const encoded = bytes && type === 'image' ? btoa(Array.from(bytes, value => String.fromCharCode(value)).join('')) : '';
        const asset: MockQuantAsset = {id: quantId('asset'), name: file.name, type, mimeType: file.type || 'application/octet-stream', size: file.size, text, ...(encoded ? {dataUrl: `data:${file.type};base64,${encoded}`} : {})};
        quantState().assets.push(asset); persistQuantState();
        return {id: asset.id, name: asset.name, type: asset.type, size: asset.size, date: new Date().toISOString(), linked: false, sourceArticle: null, sourceType: 'quant'} satisfies ResourceUploadResponse;
    }
    const download = path.match(/^\/api\/resource\/download\/([^/]+)$/);
    const remove = path.match(/^\/api\/resource\/delete\/([^/]+)$/);
    if (download || remove) {
        const state = quantState();
        const asset = state.assets.find(row => row.id === decodeURIComponent((download || remove)![1]));
        if (!asset) return undefined;
        if (!request.headers.get('Authorization')) return fail(403, '无权访问研究附件');
        if (mockScenario() === 'error') return fail(503, '本地模拟附件接口失败');
        if (download) return mockAssetDownload(asset);
        if (state.entries.some(row => row.attachments.some(ref => ref.assetId === asset.id))) return fail(409, '附件仍被量化研究引用，请先解除引用');
        state.assets = state.assets.filter(row => row.id !== asset.id); persistQuantState(); return null;
    }
    return undefined;
}
