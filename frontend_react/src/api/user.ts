import request from '../utils/request';

// 定义登录参数类型
interface LoginParams {
    email: string;
    password: string;
}

// 定义登录返回数据类型
interface LoginResult {
    token: string;
    username: string;
    avatar: string;
}

// 登录接口
export const login = (data: LoginParams) => {
    return request.post<any, LoginResult>('/auth/login', data);
};

// 获取用户信息
export const getUserInfo = () => {
    return request.get<any, any>('/user/profile');
};