import assert from 'node:assert/strict';
import { test } from 'node:test';

const reports: Record<string, unknown>[] = [];
let mode = 'ok';
const listeners = new Map<string, (event: any) => void>();
Object.assign(globalThis, {
    localStorage: { getItem: (key: string) => key === 'token' ? 'isolated-test-token' : null },
    window: {
        location: { origin: 'http://localhost', href: 'http://localhost/article/123?secret=value' },
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes('/system/logs/report/')) { reports.push(JSON.parse(String(init?.body))); return new Response('{}'); }
            if (mode === 'abort') throw new DOMException('cancelled', 'AbortError');
            if (mode === 'timeout') throw new DOMException('timeout', 'TimeoutError');
            return new Response('{}', { status: mode === '502' ? 502 : mode === '400' ? 400 : 200, headers: { 'X-Request-ID': 'a'.repeat(32) } });
        },
        addEventListener: (name: string, callback: (event: any) => void) => listeners.set(name, callback),
        removeEventListener: (name: string) => listeners.delete(name),
    },
});
const { createDiagnosticId, diagnosticFetch, reportDiagnostic, installRuntimeDiagnostics, stackFrames, diagnosticReader } = await import('./diagnostics.ts');

test('collect HTTP 502 with correlation; ignore expected HTTP errors and cancellation', async () => {
    mode = '502'; reports.length = 0;
    assert.equal((await diagnosticFetch('/api/article/123')).status, 502);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].requestId, 'a'.repeat(32));
    mode = '400'; await diagnosticFetch('/api/article/123'); assert.equal(reports.length, 1);
    mode = 'abort'; await assert.rejects(diagnosticFetch('/api/article/123')); assert.equal(reports.length, 1);
    mode = 'timeout'; await assert.rejects(diagnosticFetch('/api/article/123')); assert.equal(reports[1].errorType, 'timeout');
});

test('deduplicate errors, omit messages and request contents, redact stack query', () => {
    reports.length = 0;
    const error = new Error('private article secret');
    reportDiagnostic({ errorType: 'runtime', stack: error.stack, path: '/article/123?token=secret' }, error);
    reportDiagnostic({ errorType: 'runtime' }, error);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].path, '/article/123');
    assert.ok(!JSON.stringify(reports).includes('private article'));
    assert.ok(!stackFrames('Error: private\n    at call (http://host/a.js?token=secret:1:2)').includes('token=secret'));
    reportDiagnostic({ errorType: 'runtime', path: '/api/system/logs/' });
    assert.equal(reports.length, 1);
});

test('runtime listeners ignore marked business errors and clean up', () => {
    reports.length = 0;
    const dispose = installRuntimeDiagnostics();
    listeners.get('unhandledrejection')!({ reason: Object.assign(new Error(), { diagnosticHandled: true }) });
    assert.equal(reports.length, 0);
    listeners.get('error')!({ error: new Error('private') });
    assert.equal(reports.length, 1);
    dispose(); assert.equal(listeners.size, 0);
});

test('stream read failure is collected and rethrown', async () => {
    reports.length = 0;
    const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error('connection')); } }), { headers: { 'X-Request-ID': 'b'.repeat(32) } });
    await assert.rejects(diagnosticReader(response)!.read());
    assert.equal(reports[0].errorType, 'stream');
    assert.equal(reports[0].requestId, 'b'.repeat(32));
});


test('request IDs work without secure-context randomUUID', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try { assert.match(createDiagnosticId(), /^[a-f0-9]{32}$/); }
    finally { Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true }); }
});
