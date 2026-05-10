import request from '../utils/request';
import type { ChangePasswordParams, LoginParams, LoginResult, UpdateUserProfileParams, UserInfo } from '../types/api/user';

// 重新导出类型以便其他组件使用
export type { ChangePasswordParams, LoginParams, LoginResult, UpdateUserProfileParams, UserInfo };

// 登录接口
export const login = (data: LoginParams) => {
    return request.post<any, LoginResult>('/auth/login', data);
};

// 获取用户信息
export const getUserInfo = () => {
    return request.get<any, UserInfo>('/user/profile');
};

// 更新用户资料
export const updateUserProfile = (data: UpdateUserProfileParams) => {
    return request.patch<any, UserInfo>('/user/profile', data);
};

// 上传头像
export const uploadUserAvatar = (avatar: File) => {
    const formData = new FormData();
    formData.append('avatar', avatar);
    return request.post<any, UserInfo>('/user/avatar', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
};

// 修改密码
export const changePassword = (data: ChangePasswordParams) => {
    return request.post<any, null>('/user/change-password', data);
};
