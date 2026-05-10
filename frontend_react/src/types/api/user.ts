// --- 用户相关类型定义 ---

export interface LoginParams {
    email: string;
    password: string;
}

export interface LoginResult {
    token: string;
    username: string;
    nickname: string;
    email: string;
    avatar: string;
    role: 'admin' | 'user';
    roleName: string;
    isAdmin: boolean;
}

export interface UserInfo {
    username: string;
    nickname: string;
    email: string;
    avatar: string;
    role: 'admin' | 'user';
    roleName: string;
    isAdmin: boolean;
    isSuperuser: boolean;
    isStaff: boolean;
}

export interface UpdateUserProfileParams {
    nickname: string;
    email: string;
}

export interface ChangePasswordParams {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
}
