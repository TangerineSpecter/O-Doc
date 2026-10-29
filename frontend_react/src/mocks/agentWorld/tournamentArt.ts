import type {ArtMoment, ArtTask} from '../../api/tournamentArt';
import {tournamentEvents, tournamentReports} from './tournament';

const images = new Map<string, Blob>();
const artwork = new Map<string, {assetId: string; task: ArtTask | null}>();
let nextId = 0;

export async function resolveTournamentArtRoute(request: Request): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname;
    if (path === '/api/resource/upload' && request.method === 'POST') {
        const form = await request.clone().formData();
        if (form.get('source_type') !== 'agent_art') return undefined;
        const file = form.get('file');
        if (!(file instanceof File) || !file.type.startsWith('image/')) return Response.json({code: 400, msg: '请选择图片'}, {status: 400});
        const id = `local-art-upload-${++nextId}`; images.set(id, file);
        return {id, name: file.name, type: 'image', size: file.size};
    }
    const download = path.match(/^\/api\/resource\/download\/(local-art-[^/]+)$/);
    if (download && request.method === 'GET') {
        const blob = images.get(download[1]);
        return blob ? new Response(blob, {headers: {'Content-Type': blob.type}}) : Response.json({code: 404}, {status: 404});
    }
    const match = path.match(/^\/api\/settings\/agent-world\/tournaments\/([^/]+)\/illustration\/$/);
    if (!match) return undefined;
    const id = decodeURIComponent(match[1]);
    const event = tournamentEvents.find(row => row.id === id && row.status === 'completed');
    if (!event) return Response.json({code: 404, msg: '已结束的赛事不存在'}, {status: 404});
    const state = artwork.get(id) || {assetId: '', task: null};
    const final = event.rounds.find(row => row.phase === 'final')?.matches.find(row => row.kind === 'main');
    const report = final && tournamentReports.get(final.id)?.report;
    const moments: ArtMoment[] = (report?.rounds || []).flatMap((round, ri) => round.events.flatMap((entry, ei) =>
        entry.kind === 'damage' && entry.target && entry.damage ? [{id: `${ri}:${ei}`, round: round.number, actor: entry.actor, target: entry.target, action: entry.action, damage: entry.damage, critical: !!entry.critical}] : []));
    if (request.method === 'GET') return {...state, moments, canGenerate: moments.length > 0,
        options: {configured: true, modelId: 'local-art-model', supportsReferenceImages: true, models: [{value: 'local-art-model', label: '本地生图样例'}]}};
    if (request.method === 'POST') {
        const assetId = `local-art-generated-${++nextId}`;
        images.set(assetId, new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="100%" height="100%" fill="#fff3df"/><text x="50%" y="48%" text-anchor="middle" font-size="38" fill="#9a4d15">决战纪念图</text><text x="50%" y="58%" text-anchor="middle" font-size="22" fill="#9a4d15">本地生成预览样例</text></svg>'], {type: 'image/svg+xml'}));
        state.task = {taskId: `local-task-${nextId}`, assetId, status: 'succeeded'}; artwork.set(id, state); return state.task;
    }
    if (request.method === 'PUT') {
        const body = await request.json() as {assetId?: string; taskId?: string};
        const assetId = body.assetId || (body.taskId === state.task?.taskId ? state.task?.assetId : '');
        if (!assetId || !images.has(assetId)) return Response.json({code: 400, msg: '图片不存在'}, {status: 400});
        state.assetId = assetId; artwork.set(id, state); return {assetId};
    }
    if (request.method === 'DELETE') {state.task = null; artwork.set(id, state); return {};}
    return undefined;
}
