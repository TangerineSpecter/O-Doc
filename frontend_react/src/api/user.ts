import request from '../utils/request';
import type { LoginParams, LoginResult, UserInfo } from '../types/api/user';

// 重新导出类型以便其他组件使用
export type { LoginParams, LoginResult, UserInfo };

// 登录接口
export const login = (data: LoginParams) => {
    return request.post<any, LoginResult>('/auth/login', data);
};

// 获取用户信息
export const getUserInfo = () => {
    return request.get<any, UserInfo>('/user/profile');
};
