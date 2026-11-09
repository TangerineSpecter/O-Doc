import JSZip from 'jszip';
import type {PerformanceDetail, PerformanceEvent, PerformanceKind, PerformanceMetrics, PerformanceOverview, PerformancePolicy, PerformanceSample} from '@/types/performance';

type Kind = Exclude<PerformanceKind, ''>;
const initialPolicy: PerformancePolicy = {enabled: true, version: 1, generation: 1, requestMs: 1000, sqlMs: 200, sqlTotalMs: 500, sqlCount: 50, streamMs: 120000, firstChunkMs: 5000, aiMs: 60000, firstOutputMs: 10000, taskMs: 60000, httpMs: 3000, sampleDays: 7, aggregateDays: 30, maxMb: 200};
let policy = {...initialPolicy};
const names: Record<Kind, string> = {request: 'api/settings/agent-world/residents/', stream: 'api/ai/chat/', sql: 'SELECT local-structure-fingerprint', ai: 'utils.ai_service.AIService.chat', task: 'agent_world.execute_item', http: 'httpx.AsyncHTTPTransport.handle_async_request'};
const kinds = Object.keys(names) as Kind[];
const bounds = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000, 600000, 1800000];
const records = new Map<string, PerformanceEvent>();
let nextIndex = 0;
let running: PerformanceOverview['inflight'] = [];

function createEvent(kind: Kind, index: number, started: number): PerformanceEvent {
    const kindIndex = kinds.indexOf(kind);
    const id = policy.generation === 1 && index === 0 ? 'abcdef'[kindIndex].repeat(32)
        : policy.generation.toString(16).padStart(8, '0') + kindIndex.toString(16).padStart(8, '0') + index.toString(16).padStart(16, '0');
    const base = {request: 1840, stream: 125000, sql: 480, ai: 64000, task: 65000, http: 3500}[kind];
    const durationMs = base + index * 10;
    const row: PerformanceEvent = {id, rootId: id, parentId: null, kind, operation: names[kind], started,
        durationMs, status: index === 3 ? 'failed' : 'success', sqlCount: ['request', 'task'].includes(kind) ? 54 : 0,
        sqlMs: ['request', 'task'].includes(kind) ? 1280 : 0, firstOutputMs: kind === 'ai' ? 12000 : undefined,
        slow: false, policyVersion: policy.version, truncated: 0, build: {version: 'local-mock', commit: null},
        source: [{file: 'system_settings/agent_world/life_runner.py', function: 'execute_item', line: 89}],
        ...(kind === 'sql' ? {sql: {statement: 'SELECT', fingerprint: 'local-structure-fingerprint', template: null, templateReason: '本地样例只含结构指纹'}} : {}),
        children: [],
    };
    if (kind !== 'sql') row.children = [{id: (BigInt('0x' + id) ^ BigInt('0x' + 'f'.repeat(32))).toString(16).padStart(32, '0'),
        rootId: id, parentId: id, kind: 'sql', operation: names.sql, started, durationMs: 480, status: 'success', sqlCount: 0, sqlMs: 0,
        build: row.build, sql: {statement: 'SELECT', fingerprint: 'local-structure-fingerprint', template: null}}];
    const threshold = {request: policy.requestMs, stream: policy.streamMs, sql: policy.sqlMs, ai: policy.aiMs, task: policy.taskMs, http: policy.httpMs}[kind];
    row.slow = durationMs >= threshold || (row.firstOutputMs ?? 0) >= policy.firstOutputMs
        || (['request', 'task'].includes(kind) && (row.sqlCount >= policy.sqlCount || row.sqlMs >= policy.sqlTotalMs));
    return row;
}

function addEvents(count: number, initial = false) {
    for (let i = 0; i < count; i++) {
        const index = nextIndex++;
        const started = Date.now() / 1000 - (initial ? 60 + i * 10 : 0);
        for (const kind of kinds) {
            const row = createEvent(kind, index, started);
            records.set(row.id, row);
        }
    }
}
export function resetPerformanceMock() {
    policy = {...initialPolicy}; records.clear(); nextIndex = 0;
    const started = Date.now() / 1000 - 70;
    running = [
        {id: 'live-1', operation: 'agent_world.execute_item', kind: 'task', started, status: 'running', elapsedMs: 70000},
        {id: 'live-2', operation: 'agent_world.execute_item', kind: 'task', started: started + 20, status: 'running', elapsedMs: 50000},
        {id: 'live-3', operation: 'unmatched', kind: 'request', started: started + 40, status: 'running', elapsedMs: 30000},
    ];
    addEvents(24, true);
}
resetPerformanceMock();

/** Explicit replay, never a timer or a side effect of reading monitor data. */
export function simulatePerformanceActivity(): boolean {
    if (!policy.enabled) return false;
    addEvents(1);
    return true;
}

function metrics(rows: PerformanceEvent[]): PerformanceMetrics {
    const count = rows.length;
    const sorted = rows.map(row => row.durationMs).sort((a, b) => a - b);
    const quantile = (q: number) => {
        if (!count) return null;
        const value = sorted[Math.ceil(count * q) - 1];
        const upper = bounds.findIndex(bound => bound >= value);
        return {lowerMs: upper < 0 ? bounds[bounds.length - 1] : upper === 0 ? 0 : bounds[upper - 1], upperMs: upper < 0 ? null : bounds[upper]};
    };
    const errors = rows.filter(row => ['failed', 'timeout'].includes(row.status)).length;
    const slow = rows.filter(row => row.slow).length;
    const totalMs = rows.reduce((sum, row) => sum + row.durationMs, 0);
    return {count, errors, slow, totalMs, maxMs: count ? sorted[count - 1] : null,
        averageMs: count ? totalMs / count : null, errorRatio: count ? errors / count : null, slowRatio: count ? slow / count : null,
        p95: quantile(.95), p99: quantile(.99), histogramStatus: count ? 'available' : 'empty',
        sqlCount: rows.reduce((sum, row) => sum + row.sqlCount, 0), sqlMs: rows.reduce((sum, row) => sum + row.sqlMs, 0)};
}

export async function resolvePerformanceRoute(request: Request, state: string | null): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/api/system/performance/')) return undefined;
    if (state === 'error') return Response.json({code: 503, msg: '本地模拟性能接口失败', data: null}, {status: 503});
    if (path.endsWith('/clear/')) {
        records.clear(); running = []; nextIndex = 0; policy = {...policy, generation: policy.generation + 1};
        return policy;
    }
    if (path.endsWith('/policy/')) {
        if (request.method === 'PUT') policy = {...policy, ...await request.json(), version: policy.version + 1};
        return policy;
    }
    const kind = (url.searchParams.get('kind') || 'request') as Kind;
    const all = state === 'empty' ? [] : [...records.values()];
    const selected = all.filter(row => row.kind === kind).sort((a, b) => b.started - a.started);
    if (path.endsWith('/overview/')) {
        const trend = kinds.flatMap(name => {
            const groups = new Map<number, PerformanceEvent[]>();
            for (const row of all.filter(item => item.kind === name)) {
                const at = Math.floor(row.started / 60) * 60;
                groups.set(at, [...(groups.get(at) || []), row]);
            }
            return [...groups].sort((a, b) => a[0] - b[0]).map(([at, rows]) => ({...metrics(rows), at, kind: name}));
        });
        const result: PerformanceOverview = {start: new Date(Date.now() - Number(url.searchParams.get('hours') || 24) * 3600000).toISOString(), end: new Date().toISOString(),
            truncated: false, policy, inflight: state === 'empty' ? [] : running.map(item => ({...item, elapsedMs: Math.max(0, Date.now() - item.started * 1000)})), trendStepSeconds: 60, trend,
            health: {dropped: 0, failedBatches: 0, lastFlush: all.length ? Math.max(...all.map(row => row.started)) : null, error: null, queueSize: 0, processId: 0},
            byKind: Object.fromEntries(kinds.map(name => [name, metrics(all.filter(row => row.kind === name))]))};
        return result;
    }
    if (path.endsWith('/database/')) return {status: 'disabled', rows: [], intervalRows: [], reason: '本地样例：pg_stat_statements 未启用，应用侧 SQL 仍可查看'};
    if (path.endsWith('/rankings/')) {
        const versions = [...new Set(selected.map(row => row.policyVersion))];
        return {rows: versions.map(version => ({operation: names[kind], policyVersion: version, build: selected[0].build, ...metrics(selected.filter(row => row.policyVersion === version))})), truncated: false};
    }
    if (path.endsWith('/samples/')) {
        const page = Number(url.searchParams.get('page') || 1);
        const rows: PerformanceSample[] = selected.slice((page - 1) * 20, page * 20).map(row => ({id: row.id, created: new Date(row.started * 1000).toISOString(), kind: row.kind, operation: row.operation, durationMs: row.durationMs, status: row.status}));
        return {rows, total: selected.length, page};
    }
    if (!/\/samples\/[^/]+\/(report\/)?$/.test(path)) return undefined;
    const id = path.match(/\/samples\/([a-f0-9]{32})\//)?.[1];
    const row = id ? all.find(item => item.id === id) : undefined;
    if (!row) return Response.json({code: 404, msg: '诊断样本已清理或不存在', data: null}, {status: 404});
    const comparable = all.filter(item => item.kind === row.kind && item.policyVersion === row.policyVersion);
    const detail: PerformanceDetail = {event: row, baseline: {durationComparison: metrics(comparable.filter(item => item.status === row.status)), allResults: metrics(comparable), truncated: false, note: '耗时对照按同结果筛选，错误率以全部结果为分母；本地模拟数据。'}};
    if (path.endsWith('/report/')) {
        const zip = new JSZip();
        const evidence = JSON.stringify({reportVersion: 1, ...detail}, null, 2);
        zip.file('report.md', '# 本地样例性能诊断报告\n\n' + evidence); zip.file('evidence.json', evidence);
        zip.file('manifest.json', JSON.stringify({reportVersion: 1, source: 'local-mock'}));
        const bytes = await zip.generateAsync({type: 'uint8array'});
        return new Response(new Blob([bytes as BlobPart], {type: 'application/zip'}), {headers: {'Content-Disposition': `attachment; filename="performance-${row.id}.zip"`, 'Cache-Control': 'no-store'}});
    }
    return detail;
}
