/** Session memory only. Versions are part of keys; oversized bodies are not cached. */
export class QuantReadingCache {
    private records = new Map<string, {value: unknown; bytes: number}>();
    private bytes = 0;
    private maxCount: number;
    private maxBytes: number;
    constructor(maxCount = 20, maxBytes = 5 * 1024 * 1024) {this.maxCount=maxCount;this.maxBytes=maxBytes;}
    get<T>(key: string): T | undefined {
        const row = this.records.get(key);
        if (!row) return undefined;
        this.records.delete(key); this.records.set(key, row);
        return row.value as T;
    }
    put<T>(key: string, value: T): T {
        this.delete(key);
        const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
        if (bytes > this.maxBytes) return value;
        this.records.set(key, {value, bytes}); this.bytes += bytes;
        while (this.records.size > this.maxCount || this.bytes > this.maxBytes) this.delete(this.records.keys().next().value!);
        return value;
    }
    delete(key: string) {const old=this.records.get(key);if(old){this.bytes-=old.bytes;this.records.delete(key);}}
    clear() {this.records.clear();this.bytes=0;}
    get size() {return this.records.size;}
    get byteSize() {return this.bytes;}
}
