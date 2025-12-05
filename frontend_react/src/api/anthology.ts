import request from '../utils/request';

// 定义创建文集参数类型
export interface CreateAnthologyParams {
    title: string;
    description: string;
    iconId: string;
    permission: 'public' | 'private';
}

// 定义文集返回数据类型
export interface Anthology {
    id: number;
    coll_id: string;
    title: string;
    count: number;
    icon: React.ReactNode;
    isTop: boolean;
    permission: 'public' | 'private';
    description: string;
    articles: any[];
}

// 创建文集接口
export const createAnthology = (data: CreateAnthologyParams) => {
    return request.post<any, Anthology>('/anthology/create', data);
};
