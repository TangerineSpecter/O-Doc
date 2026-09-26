import { getAuthToken } from './authStorage';

const nativeFetch = window.fetch.bind(window);
const reported = new WeakSet<object>();
export const createDiagnosticId = () => {
    // getRandomValues also works on LAN HTTP deployments where randomUUID is unavailable.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
};
const safePath = (url: string) => {
    try { return new URL(url, window.location.origin).pathname.slice(0, 500); } catch { return ''; }
};
export const stackFrames = (stack?: string) => (stack || '').split('\n').filter(line => /^\s*at\s/.test(line)).map(line => line.replace(/\?[^\s):]+/g, '?[REDACTED]')).join('\n').slice(0, 12000);

export function reportDiagnostic(input: { errorType: string; module?: string; path?: string; operation?: string; requestId?: string; httpStatus?: number; stack?: string }, error?: unknown) {
    if (error && typeof error === 'object') {
        if (reported.has(error)) return;
        reported.add(error);
        if ('name' in error && (error.name === 'AbortError' || error.name === 'CanceledError')) return;
    }
    const token = getAuthToken();
    if (!token || input.path?.startsWith('/api/system/logs/')) return;
    // Dedicated transport: never feeds its own failures back into collection.
    void nativeFetch('/api/system/logs/report/', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
        body: JSON.stringify({ ...input, eventId: createDiagnosticId(), module: input.module || 'frontend', path: safePath(input.path || window.location.href), stack: stackFrames(input.stack) }),
        signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
}

export async function diagnosticFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : String(input);
    const path = safePath(url);
    if (!path.startsWith('/api/') || path.startsWith('/api/system/logs/')) return nativeFetch(input, init);
    const requestId = createDiagnosticId();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('X-Request-ID', requestId);
    try {
        const response = await nativeFetch(input, { ...init, headers });
        if (response.status >= 500) reportDiagnostic({ errorType: 'http', module: 'network', path, requestId: response.headers.get('X-Request-ID') || requestId, httpStatus: response.status, operation: init?.method || 'GET' });
        return response;
    } catch (error) {
        reportDiagnostic({ errorType: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network', module: 'network', path, requestId, operation: init?.method || 'GET' }, error);
        throw error;
    }
}

export function installRuntimeDiagnostics() {
    const onError = (event: ErrorEvent) => reportDiagnostic({ errorType: 'runtime', stack: event.error?.stack }, event.error);
    const onRejection = (event: PromiseRejectionEvent) => {
        // Request failures already collected by transports; expected business failures are marked there.
        if (event.reason && typeof event.reason === 'object' && 'diagnosticHandled' in event.reason) return;
        reportDiagnostic({ errorType: 'runtime', stack: event.reason instanceof Error ? event.reason.stack : undefined }, event.reason);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
}

export function diagnosticReader(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) return undefined;
    return {
        async read() {
            try { return await reader.read(); }
            catch (error) {
                reportDiagnostic({ errorType: 'stream', module: 'stream', path: response.url || '/api/ai/chat/', requestId: response.headers.get('X-Request-ID') || '' }, error);
                throw error;
            }
        },
        cancel: (reason?: unknown) => reader.cancel(reason),
        releaseLock: () => reader.releaseLock(),
    };
}
