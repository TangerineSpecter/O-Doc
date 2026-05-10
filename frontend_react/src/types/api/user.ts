// --- 用户相关类型定义 ---

export interface LoginParams {
    email: string;
    password: string;
}

export interface LoginResult {
    token: string;
    username: string;
    avatar: string;
    role: 'admin' | 'user';
    roleName: string;
    isAdmin: boolean;
}

export interface UserInfo {
    username: string;
    email: string;
    avatar: string;
    role: 'admin' | 'user';
    roleName: string;
    isAdmin: boolean;
    isSuperuser: boolean;
    isStaff: boolean;
}
