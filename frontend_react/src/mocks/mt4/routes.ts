import {HttpResponse} from 'msw';
import {mockScenario, persistQuantState, quantId, quantState} from '../quant/state';
import type {MT4Attachment, MT4Expert, MT4ExpertInput, MT4Report, MT4Test} from '../../types/api/mt4Archive';
import {preserveHiddenMT4Parameters, projectMT4Report} from './reportProjection';

export type MT4MockRow = {collection: string; expert: MT4Expert; tests: MT4Test[]; attachments: MT4Attachment[]};
const fail = (code: number, msg: string) => HttpResponse.json({code, msg, data: null}, {status: code});
const now = () => new Date().toISOString();
const sample: MT4Report = {title: '本地演示报告', source: 'local-demo', fields: {symbol: 'EURUSD（演示）', period: 'M5 · 2023.01.01 – 2024.01.01', model: '每个即时价格（演示）'}, parameters: [{name: 'comm2', value: '"Max spread:"'}, {name: 'MaxSpread', value: '5'}, {name: 'Trade_Lot_Settings', value: '"Trade lot:"'}, {name: 'start_lot', value: '0.01'}, {name: 'increment', value: '0.02'}, {name: 'tp_in_money', value: '3'}, {name: 'Comments', value: '"LOCAL DEMO"'}, {name: 'magic', value: '999222'}], metrics: [['起始资金', '10000.00', '总净盈利', '3.55'], ['交易单总计', '2', '盈利交易', '1 (50.00%)', '亏损交易', '1 (50.00%)'], ['最大', '获利交易', '10.00', '亏损交易', '-6.45'], ['平均', '获利交易', '10.00', '亏损交易', '-6.45'], ['最大', '连续获利金额', '1 (10.00)', '连续亏损金额', '1 (-6.45)'], ['最多', '连续获利次数', '10.00 (1)', '连续亏损次数', '-6.45 (1)'], ['平均', '连续获利', '1', '连续亏损', '1']], events: [{sequence: '1', time: '2023.01.03 08:45', type: 'buy', order: '1', lots: '0.01', price: '1.05686', stopLoss: '0', takeProfit: '0', profit: '', balance: ''}, {sequence: '2', time: '2023.01.04 07:45', type: 'close', order: '1', lots: '0.01', price: '1.06047', stopLoss: '0', takeProfit: '0', profit: '10.00', balance: '10010.00'}, {sequence: '3', time: '2023.01.05 08:45', type: 'buy', order: '2', lots: '0.01', price: '1.06047', stopLoss: '0', takeProfit: '0', profit: '', balance: ''}, {sequence: '4', time: '2023.01.06 07:45', type: 'close', order: '2', lots: '0.01', price: '1.05686', stopLoss: '0', takeProfit: '0', profit: '-6.45', balance: '10003.55'}], hasChart: false};

export function sampleMT4Row(): MT4MockRow {
    const stamp = '2026-10-27T10:00:00Z';
    const expert: MT4Expert = {id: 'local-mt4-expert', name: 'Driver-EURUSD（本地演示）', category: '马丁EA', version: '演示版本', sourceUrl: '', forumUrl: '', minimumCapital: '500', timeframe: '5M', accountRequirement: '无要求', requirements: '示例：最低资金待核对', notes: '这里是本地样例，数据仅供界面演示。', tradingLogic: '示例：分批开仓。', parameters: [{name: 'start_lot', label: '首单手数', value: '0.01'}], parameterSets: [], createdAt: stamp, updatedAt: stamp};
    const test: MT4Test = {id: 'local-mt4-test', expertId: expert.id, title: 'EURUSD 2023（本地演示）', description: '示例数据，不代表真实回测。', conclusion: '', data: structuredClone(sample), reportHash: 'local-demo', createdAt: stamp, updatedAt: stamp};
    return {collection: 'local-mt4', expert, tests: [test], attachments: []};
}

export async function resolveMT4Route(request: Request, collection: string, route: string[]): Promise<unknown> {
    const rows = quantState().mt4Records;
    const book = quantState().collections.find(item => item.collId === collection && item.type === 'backtest');
    if (!book) return fail(404, '回测文集不存在');
    if (route[0] !== 'experts') return fail(404, '路径不存在');
    const [, id, section, testId, action, refId] = route;
    const row = rows.find(item => item.collection === collection && item.expert.id === id);
    const body = !['GET', 'DELETE'].includes(request.method) ? await request.json() as Record<string, unknown> : {};
    if (!id && request.method === 'GET') return rows.filter(item => item.collection === collection).map(item => item.expert);
    if (!id && request.method === 'POST') {
        const expert = {...body as unknown as MT4ExpertInput, id: quantId('mt4-expert'), createdAt: now(), updatedAt: now()};
        rows.push({collection, expert, tests: [], attachments: []}); book.count = rows.filter(item => item.collection === collection).length; persistQuantState(); return expert;
    }
    if (!row) return fail(404, 'EA 不存在');
    if (!section && request.method === 'GET') return {expert: row.expert, backtests: row.tests.map(test => ({...test, data: {...projectMT4Report(test.data), events: undefined}})), attachments: row.attachments.filter(item => !item.backtestId).map(item => ({...item, note: item.note || ''}))};
    if (!section && request.method === 'PATCH') {Object.assign(row.expert, body, {updatedAt: now()}); persistQuantState(); return row.expert;}
    if (!section && request.method === 'DELETE') {rows.splice(rows.indexOf(row), 1); book.count = rows.filter(item => item.collection === collection).length; persistQuantState(); return null;}
    if (section === 'preview') {
        const asset = quantState().assets.find(item => item.id === body.assetId);
        if (!asset) return fail(404, '报告附件不存在');
        return {report: projectMT4Report(structuredClone(sample)), reportHash: 'local-demo', hasChart: asset.name.toLowerCase().endsWith('.zip'), duplicates: row.tests.filter(item => item.reportHash === 'local-demo').map(item => ({id: item.id, title: item.title}))};
    }
    if (section === 'recognize') return {metrics: [{name: '总净盈利（本地演示）', value: '3.55'}], modelName: '本地样例，未调用识图模型'};
    if (section === 'tests' && !testId && request.method === 'POST') {
        if (body.reportAssetId && !body.allowDuplicate && row.tests.some(item => item.reportHash === 'local-demo')) return fail(400, '报告已导入');
        const test: MT4Test = {id: quantId('mt4-test'), expertId: row.expert.id, title: String(body.title || ''), description: String(body.description || ''), conclusion: String(body.conclusion || ''), data: body.data as MT4Report, reportHash: body.reportAssetId ? 'local-demo' : '', createdAt: now(), updatedAt: now()};
        row.tests.unshift(test);
        for (const [assetId, role] of [[body.reportAssetId, 'report'], [body.imageAssetId, body.reportAssetId ? 'chart' : 'screenshot']] as const) {
            const asset = quantState().assets.find(item => item.id === assetId);
            if (asset) row.attachments.push({id: quantId('mt4-ref'), assetId: asset.id, backtestId: test.id, role, note: '', name: asset.name, fileType: asset.type, url: `/api/resource/download/${asset.id}`});
        }
        persistQuantState(); return {...test, data: projectMT4Report(test.data)};
    }
    if (section === 'tests' && testId) {
        const test = row.tests.find(item => item.id === testId);
        if (!test) return fail(404, '回测不存在');
        if (action === 'zip-chart' && request.method === 'GET') {
            // A tiny local placeholder, never a claim that the supplied ZIP was parsed.
            const bytes = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='), ch => ch.charCodeAt(0));
            return new HttpResponse(bytes, {headers: {'Content-Type': 'image/gif'}});
        }
        if (!action && request.method === 'GET') return {backtest: {...test, data: projectMT4Report(test.data)}, attachments: row.attachments.filter(item => item.backtestId === testId).map(item => ({...item, note: item.note || ''}))};
        if (!action && request.method === 'PATCH') {const data = body.data ? preserveHiddenMT4Parameters(test.data, body.data as MT4Report) : test.data; Object.assign(test, body, {data}); persistQuantState(); return {...test, data: projectMT4Report(test.data)};}
        if (!action && request.method === 'DELETE') {row.tests.splice(row.tests.indexOf(test), 1); persistQuantState(); return null;}
    }
    if (section === 'attachments' || action === 'attachments') {
        const attachmentId = section === 'attachments' ? testId : refId;
        if (request.method === 'PATCH') {
            if (mockScenario() === 'note-error') return fail(503, '本地模拟备注保存失败');
            const ref = row.attachments.find(item => item.id === attachmentId && item.backtestId === (section === 'tests' ? testId : null));
            if (!ref) return fail(404, '附件不存在');
            if (Object.keys(body).length !== 1 || typeof body.note !== 'string' || [...body.note].length > 500) return fail(400, '备注必须是 500 字以内的文本');
            ref.note = body.note; persistQuantState(); return ref;
        }
        if (request.method === 'DELETE') {row.attachments = row.attachments.filter(item => item.id !== attachmentId); persistQuantState(); return null;}
        const asset = quantState().assets.find(item => item.id === body.assetId);
        if (!asset) return fail(404, '附件不存在');
        const attachment: MT4Attachment = {id: quantId('mt4-ref'), assetId: asset.id, backtestId: section === 'tests' ? testId : null, role: String(body.role), note: '', name: asset.name, fileType: asset.type, url: `/api/resource/download/${asset.id}`};
        row.attachments.push(attachment); persistQuantState(); return attachment;
    }
    return fail(404, mockScenario() === 'empty' ? '暂无回测资料' : '本地样例没有此路径');
}
