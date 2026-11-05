import request from '../utils/request';

const base = (collection: string) => `/quant/${encodeURIComponent(collection)}/`;
export const quantShare = {
    export: (collection: string, entry: string) => request.get<never, {packageJson: string}>(`${base(collection)}entries/${encodeURIComponent(entry)}/report-export/`),
    read: (collection: string, entry: string, signal?: AbortSignal) => request.get<never, {packageJson: string | null}>(`${base(collection)}entries/${encodeURIComponent(entry)}/imported-report/`, {signal}),
    import: (collection: string, packageJson: string) => request.post<never, {entryId: string}>(`${base(collection)}report-import/`, {packageJson}),
};
