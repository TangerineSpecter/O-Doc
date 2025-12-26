// --- 用户相关类型定义 ---

export interface LoginParams {
    email: string;
    password: string;
}

export interface LoginResult {
    token: string;
    username: string;
    avatar: string;
}