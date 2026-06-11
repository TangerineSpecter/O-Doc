import request from '../utils/request';
import type {GlobalSearchResponse, GlobalSearchType} from '../types/api/search';

export type {GlobalSearchResponse, GlobalSearchItem, GlobalSearchType} from '../types/api/search';

export interface GlobalSearchParams {
    keyword: string;
    types?: GlobalSearchType[];
    limit?: number;
}

export const globalSearch = (params: GlobalSearchParams) => {
    return request.get<any, GlobalSearchResponse>('/search/global', {
        params: {
            keyword: params.keyword,
            types: params.types?.join(','),
            limit: params.limit,
        },
    });
};
