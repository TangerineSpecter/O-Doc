import {HttpResponse} from 'msw';
import type {QuantAttachment, QuantBacktest, QuantBacktestInput, QuantEntryDetail, QuantEntryInput, QuantImplementationInput, QuantRunInput, QuantVersionInput, QuantVerificationInput} from '../../types/api/quant';
import {quantModels} from './fixtures';
import {resolveQuantAnthology} from './anthology';
import {resolveQuantResources} from './resources';
import {adoptRun, advanceRun, createRun, newImplementation, newVersion} from './runs';
import {mockScenario, persistQuantState, quantId, quantState} from './state';
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const findVersion = (entry: QuantEntryDetail, id?: string | null) => entry.implementations.flatMap(row => row.versions).find(row => row.id === id);
const touch = (entry: QuantEntryDetail) => {entry.updatedAt = new Date().toISOString(); persistQuantState();};
const languages = ['python', 'pine', 'mql4'];

export async function resolveQuantRoute(request: Request): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/api/quant/')) {
        const resources = await resolveQuantResources(request);
        if (resources !== undefined) return resources;
        return resolveQuantAnthology(request);
    }
    if (!request.headers.get('Authorization')) return fail(403, '请先登录后访问量化研究');
    if (mockScenario() === 'error') return fail(503, '本地模拟量化接口失败，请切回样例状态重试');
    if (path === '/api/quant/models/' && request.method === 'GET') return quantModels;
    const route = path.slice('/api/quant/'.length).split('/').filter(Boolean).map(decodeURIComponent);
    const [collId, domain, entryId, section, id, action] = route;
    const state = quantState();
    const collection = state.collections.find(row => row.collId === collId && row.type === 'quant');
    if (!collection) return fail(404, '量化文集不存在或无权访问');
    if (domain !== 'entries') return undefined;
    const writing = !['GET', 'HEAD', 'DELETE'].includes(request.method);
    const rawBody = writing ? await request.text() : '';
    const body: Record<string, unknown> = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
    if (!entryId) {
        if (request.method === 'GET') {
            const query = (url.searchParams.get('q') || '').toLowerCase();
            const kind = url.searchParams.get('kind'), language = url.searchParams.get('language');
            return state.entries.filter(row => row.collId === collId && row.isValid && (!kind || row.kind === kind) && (!language || row.implementations.some(impl => impl.language === language)) && (!query || `${row.title} ${row.tags.join(' ')}`.toLowerCase().includes(query))).map(({implementations: _implementations, backtests: _backtests, attachments: _attachments, runs: _runs, ...entry}) => entry);
        }
        if (request.method === 'POST') {
            if (typeof body.title !== 'string' || !body.title.trim()) return fail(400, '请填写研究标题');
            const input = body as Partial<QuantEntryInput>;
            const now = new Date().toISOString();
            const entry: QuantEntryDetail = {id: quantId('entry'), collId, title: input.title!.trim(), kind: input.kind || 'factor', content: input.content || '', sourceUrl: input.sourceUrl || '', tags: input.tags || [], isValid: true, createdAt: now, updatedAt: now, implementations: [], backtests: [], attachments: [], runs: []};
            state.entries.unshift(entry); touch(entry); return entry;
        }
        return undefined;
    }
    const entry = state.entries.find(row => row.collId === collId && row.id === entryId && row.isValid);
    if (!entry) return fail(404, '研究条目不存在或已删除');
    if (!section) {
        if (request.method === 'GET') {entry.runs.forEach(advanceRun); return entry;}
        if (request.method === 'DELETE') {entry.isValid = false; touch(entry); return null;}
        if (request.method === 'PATCH') {
            if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) return fail(400, '请填写研究标题');
            for (const key of ['title', 'kind', 'content', 'sourceUrl', 'tags'] as const) if (body[key] !== undefined) Object.assign(entry, {[key]: body[key]});
            touch(entry); return entry;
        }
    }
    if (section === 'implementations') {
        if (!id && request.method === 'POST') {
            if (!languages.includes(String(body.language)) || !String(body.code || '').trim()) return fail(400, '请选择语言并填写代码');
            const implementation = newImplementation(entry, body as unknown as QuantImplementationInput); touch(entry); return implementation;
        }
        const implementation = entry.implementations.find(row => row.id === id);
        if (!implementation) return fail(404, '代码实现不存在');
        if (!action && request.method === 'PATCH') {implementation.name = String(body.name || implementation.name); touch(entry); return implementation;}
        if (action === 'versions' && request.method === 'POST') {
            if (!String(body.code || '').trim()) return fail(400, '代码内容不能为空');
            if (body.sourceVersionId && !findVersion(entry, String(body.sourceVersionId))) return fail(400, '来源版本必须属于当前研究');
            const version = newVersion(implementation, body as unknown as QuantVersionInput); touch(entry); return version;
        }
    }
    if (section === 'versions' && action === 'verification' && request.method === 'PATCH') {
        const version = findVersion(entry, id); if (!version) return fail(404, '代码版本不存在');
        const input = body as Partial<QuantVerificationInput>;
        for (const key of ['compileCheck', 'runCheck', 'resultCheck'] as const) {
            if (input[key] !== undefined && !['pending', 'passed', 'failed'].includes(input[key]!)) return fail(400, '验证状态无效');
            if (input[key]) version[key] = input[key];
        }
        if (input.verificationNotes !== undefined) version.verificationNotes = input.verificationNotes;
        touch(entry); return version;
    }
    if (section === 'backtests') {
        if (!id && request.method === 'GET') return entry.backtests;
        const existing = entry.backtests.find(row => row.id === id);
        if (id && !existing) return fail(404, '回测记录不存在');
        if (id && request.method === 'DELETE') {entry.backtests = entry.backtests.filter(row => row.id !== id); touch(entry); return null;}
        if (request.method === 'POST' || request.method === 'PATCH') {
            const input = body as Partial<QuantBacktestInput>;
            if (input.versionId && !findVersion(entry, input.versionId)) return fail(400, '回测代码版本必须属于当前研究');
            if (input.versionId && existing && entry.attachments.some(row => row.backtestId === existing.id
                && row.versionId && row.versionId !== input.versionId)) {
                return fail(400, '该回测的附件已关联其他代码版本，请先移除冲突的附件关联');
            }
            if (!input.name?.trim() && !existing) return fail(400, '请填写回测名称');
            const now = new Date().toISOString();
            const backtest: QuantBacktest = existing || {id: quantId('backtest'), entryId, name: '', versionId: null, symbol: '', timeframe: '', startDate: '', endDate: '', parameters: '', fees: '', metrics: [], conclusion: '', createdAt: now, updatedAt: now};
            for (const key of ['name', 'versionId', 'symbol', 'timeframe', 'startDate', 'endDate', 'parameters', 'fees', 'metrics', 'conclusion'] as const) if (input[key] !== undefined) Object.assign(backtest, {[key]: input[key]});
            backtest.updatedAt = now; if (!existing) entry.backtests.unshift(backtest); touch(entry); return backtest;
        }
    }
    if (section === 'attachments') {
        if (!id && request.method === 'POST') {
            const asset = state.assets.find(row => row.id === body.assetId); if (!asset) return fail(400, '附件资源不存在或不属于当前用户');
            const implementationId = body.implementationId ? String(body.implementationId) : null;
            const versionId = body.versionId ? String(body.versionId) : null;
            const backtestId = body.backtestId ? String(body.backtestId) : null;
            if (implementationId && !entry.implementations.some(row => row.id === implementationId)) return fail(400, '代码实现不属于当前研究');
            const version = versionId ? findVersion(entry, versionId) : null;
            if (versionId && (!version || (implementationId && version.implementationId !== implementationId))) return fail(400, '代码版本与关联实现不匹配');
            if (backtestId && !entry.backtests.some(row => row.id === backtestId)) return fail(400, '回测记录不属于当前研究');
            const ref: QuantAttachment = {id: quantId('reference'), entryId, assetId: asset.id, name: asset.name, fileType: asset.type, fileExtension: `.${asset.name.split('.').pop() || ''}`, mimeType: asset.mimeType, fileSize: asset.size, url: asset.dataUrl || `/api/resource/download/${asset.id}`, downloadUrl: `/api/resource/download/${asset.id}`, implementationId, versionId, backtestId, createdAt: new Date().toISOString()};
            entry.attachments.push(ref); touch(entry); return ref;
        }
        const attachment = entry.attachments.find(row => row.id === id); if (!attachment) return fail(404, '附件引用不存在');
        if (!action && request.method === 'DELETE') {entry.attachments = entry.attachments.filter(row => row.id !== id); touch(entry); return null;}
        if (action === 'text' && request.method === 'GET') {
            const asset = state.assets.find(row => row.id === attachment.assetId);
            const ext = attachment.fileExtension.toLowerCase().replace(/^\./, '');
            if (!asset || !['py', 'pine', 'mq4', 'mqh'].includes(ext) || asset.size > 1024 * 1024) return fail(400, '仅支持读取不超过 1MiB 的 Python、Pine、MQL4 文本脚本');
            return {code: asset.text, language: ext === 'py' ? 'python' : ext === 'pine' ? 'pine' : 'mql4', name: asset.name};
        }
    }
    if (section === 'runs') {
        if (!id && request.method === 'GET') {entry.runs.forEach(advanceRun); return entry.runs;}
        if (!id && request.method === 'POST') {
            const input = body as unknown as QuantRunInput;
            if (!findVersion(entry, input.sourceVersionId)) return fail(400, '请选择当前研究的来源代码版本');
            if (!['explain', 'convert'].includes(input.kind) || !input.requestKey) return fail(400, 'AI 任务参数不完整');
            if (input.kind === 'convert' && !languages.includes(input.targetLanguage || '')) return fail(400, '请选择目标语言');
            if (input.modelId && !quantModels.models.some(row => row.id === input.modelId)) return fail(400, '模型不存在');
            const key = `${entry.id}:${input.requestKey}`, previous = state.requestKeys[key];
            if (previous) {
                if (JSON.stringify(previous.input) !== JSON.stringify(input)) return fail(409, '请求键已用于其他任务');
                return entry.runs.find(row => row.id === previous.runId);
            }
            const run = createRun(entry, input); state.requestKeys[key] = {input, runId: run.id}; touch(entry); return run;
        }
        const run = entry.runs.find(row => row.id === id); if (!run) return fail(404, 'AI 任务不存在');
        if (!action && request.method === 'GET') {advanceRun(run); return run;}
        if (action === 'cancel' && request.method === 'POST') {
            if (run.status === 'pending' || run.status === 'running') {run.status = 'cancelled'; run.preview = ''; run.updatedAt = new Date().toISOString(); touch(entry);} return run;
        }
        if (action === 'adopt' && request.method === 'POST') {
            advanceRun(run);
            if (run.status !== 'completed' || (run.kind === 'convert' && !run.result.code)) return fail(409, '只有完整完成的任务结果可以采用');
            const adopted = adoptRun(entry, run); touch(entry); return adopted;
        }
    }
    return undefined;
}
