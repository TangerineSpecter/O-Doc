import request from '../utils/request';
import type {
    QuantAIRun,
    QuantAttachment,
    QuantBacktest,
    QuantBacktestInput,
    QuantEntry,
    QuantEntryDetail,
    QuantEntryInput,
    QuantImplementation,
    QuantImplementationInput,
    QuantModels,
    QuantRunInput,
    QuantVerificationInput,
    QuantVersionInput,
    QuantCodeVersion,
    QuantLanguage,
} from '../types/api/quant';
const base = (collection: string) => `/quant/${encodeURIComponent(collection)}/`;
const entry = (collection: string, id: string) => `${base(collection)}entries/${encodeURIComponent(id)}/`;
export const quantApi = {
    entries: (collection: string, signal?: AbortSignal, language = '') =>
        request.get<never, QuantEntry[]>(`${base(collection)}entries/`, {
            signal,
            params: language ? { language } : undefined,
        }),
    detail: (collection: string, id: string, signal?: AbortSignal) =>
        request.get<never, QuantEntryDetail>(entry(collection, id), { signal }),
    create: (collection: string, data: QuantEntryInput) =>
        request.post<never, QuantEntry>(`${base(collection)}entries/`, data),
    update: (collection: string, id: string, data: QuantEntryInput) =>
        request.patch<never, QuantEntry>(entry(collection, id), data),
    remove: (collection: string, id: string) => request.delete<never, void>(entry(collection, id)),
    implementation: (collection: string, id: string, data: QuantImplementationInput) =>
        request.post<never, QuantImplementation>(`${entry(collection, id)}implementations/`, data),
    rename: (collection: string, id: string, implementation: string, name: string) =>
        request.patch(`${entry(collection, id)}implementations/${encodeURIComponent(implementation)}/`, { name }),
    version: (collection: string, id: string, implementation: string, data: QuantVersionInput) =>
        request.post<never, QuantCodeVersion>(
            `${entry(collection, id)}implementations/${encodeURIComponent(implementation)}/versions/`,
            data,
        ),
    verification: (collection: string, id: string, version: string, data: QuantVerificationInput) =>
        request.patch<never, QuantCodeVersion>(
            `${entry(collection, id)}versions/${encodeURIComponent(version)}/verification/`,
            data,
        ),
    backtest: (collection: string, id: string, data: QuantBacktestInput, backtest?: string) =>
        backtest
            ? request.patch<never, QuantBacktest>(
                  `${entry(collection, id)}backtests/${encodeURIComponent(backtest)}/`,
                  data,
              )
            : request.post<never, QuantBacktest>(`${entry(collection, id)}backtests/`, data),
    removeBacktest: (collection: string, id: string, backtest: string) =>
        request.delete(`${entry(collection, id)}backtests/${encodeURIComponent(backtest)}/`),
    attach: (
        collection: string,
        id: string,
        data: { assetId: string; implementationId?: string; versionId?: string; backtestId?: string },
    ) => request.post<never, QuantAttachment>(`${entry(collection, id)}attachments/`, data),
    detach: (collection: string, id: string, attachment: string) =>
        request.delete(`${entry(collection, id)}attachments/${encodeURIComponent(attachment)}/`),
    text: (collection: string, id: string, attachment: string) =>
        request.get<never, { code: string; language: QuantLanguage; name: string }>(
            `${entry(collection, id)}attachments/${encodeURIComponent(attachment)}/text/`,
        ),
    models: (signal?: AbortSignal) =>
        request.get<never, QuantModels>('/quant/models/', { signal }),
    run: (collection: string, id: string, data: QuantRunInput) =>
        request.post<never, QuantAIRun>(`${entry(collection, id)}runs/`, data),
    runs: (collection: string, id: string, signal?: AbortSignal) =>
        request.get<never, QuantAIRun[]>(`${entry(collection, id)}runs/`, { signal }),
    poll: (collection: string, id: string, run: string, signal?: AbortSignal) =>
        request.get<never, QuantAIRun>(`${entry(collection, id)}runs/${encodeURIComponent(run)}/`, { signal }),
    cancel: (collection: string, id: string, run: string) =>
        request.post<never, QuantAIRun>(`${entry(collection, id)}runs/${encodeURIComponent(run)}/cancel/`),
    adopt: (collection: string, id: string, run: string) =>
        request.post<never, { implementation?: QuantImplementation; explanation?: string }>(
            `${entry(collection, id)}runs/${encodeURIComponent(run)}/adopt/`,
        ),
};
