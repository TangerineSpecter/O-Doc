import {useEffect, useState} from 'react';
import {getTokenRequestContent, getTokenRequests} from '../api/tokenUsage';
import type {FlowStep, TokenFilters, TokenRequest, TokenRequestContent} from '../types/api/tokenUsage';
import {flowStepsFromRequests} from '../utils/executionFlow';

/** 正文请求的并发上限，避免一次执行打出过多并行请求。 */
const CONCURRENCY = 4;
/** 单条执行最多回翻的请求分页数（每页 50 条），防止异常游标造成死循环。 */
const MAX_PAGES = 20;

interface FlowState {
    steps: FlowStep[];
    loaded: number;
    loading: boolean;
    error: string;
}

const EMPTY: FlowState = {steps: [], loaded: 0, loading: false, error: ''};

/** 读取一条执行记录的全部模型请求正文，并逐条解析成流程步骤。 */
export function useExecutionFlow(recordId: string | null) {
    const [refresh, setRefresh] = useState(0);
    const [state, setState] = useState<FlowState>(EMPTY);

    useEffect(() => {
        const id = recordId;
        if (!id) {
            setState(EMPTY);
            return;
        }
        const controller = new AbortController();
        const contents: Record<string, TokenRequestContent | null> = {};
        let requests: TokenRequest[] = [];
        let loaded = 0;

        setState({steps: [], loaded: 0, loading: true, error: ''});

        const publish = (loading: boolean) => {
            setState({steps: flowStepsFromRequests(requests, contents), loaded, loading, error: ''});
        };

        const run = async () => {
            let cursor: string | undefined;
            for (let page = 0; page < MAX_PAGES; page += 1) {
                const filters: TokenFilters & {cursor?: string} = {all: '1', record_id: id};
                if (cursor) filters.cursor = cursor;
                const result = await getTokenRequests(filters, controller.signal);
                requests = [...requests, ...result.items];
                if (!result.hasMore || !result.nextCursor) break;
                cursor = result.nextCursor;
            }
            if (controller.signal.aborted) return;
            publish(true);

            let index = 0;
            const worker = async () => {
                while (index < requests.length) {
                    if (controller.signal.aborted) return;
                    const current = requests[index];
                    index += 1;
                    try {
                        contents[current.id] = await getTokenRequestContent(current.id, controller.signal);
                    } catch {
                        contents[current.id] = null;
                    }
                    loaded += 1;
                    if (controller.signal.aborted) return;
                    publish(true);
                }
            };
            await Promise.all(Array.from({length: Math.min(CONCURRENCY, requests.length)}, worker));
            if (controller.signal.aborted) return;
            publish(false);
        };

        run().catch(() => {
            if (controller.signal.aborted) return;
            setState(current => ({...current, loading: false, error: '执行流程加载失败，请重试'}));
        });

        return () => controller.abort();
    }, [recordId, refresh]);

    return {state, reload: () => setRefresh(value => value + 1)};
}
