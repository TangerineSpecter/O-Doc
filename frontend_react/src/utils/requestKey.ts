/** 128-bit request keys also work on LAN HTTP, where randomUUID is unavailable. */
export function createRequestKey(): string {
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
        throw new Error('当前环境不支持 Web Crypto，无法生成幂等请求键');
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
