import { FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, LockKeyhole, Mail, ShieldCheck, UserRound, X } from 'lucide-react';
import { changePassword, updateUserProfile, uploadUserAvatar } from '../api/user';
import type { UserInfo } from '../types/api/user';
import { useToast } from './common/ToastProvider';
import {useEscapeDismissal} from '../hooks/useEscapeDismissal';

interface ProfileCenterModalProps {
    isOpen: boolean;
    userInfo: UserInfo | null;
    onClose: () => void;
    onUserInfoChange: (userInfo: UserInfo) => void;
    onLogout: () => void;
}

type ActiveTab = 'profile' | 'security';

export default function ProfileCenterModal({
    isOpen,
    userInfo,
    onClose,
    onUserInfoChange,
    onLogout
}: ProfileCenterModalProps) {
    const { success, error } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<ActiveTab>('profile');
    const [profileForm, setProfileForm] = useState({ nickname: '', email: '' });
    const [passwordForm, setPasswordForm] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    useEscapeDismissal(isOpen && Boolean(userInfo), onClose);

    useEffect(() => {
        if (userInfo) {
            setProfileForm({
                nickname: userInfo.nickname || userInfo.username,
                email: userInfo.email || ''
            });
        }
    }, [userInfo]);

    if (!isOpen || !userInfo) return null;

    const handleAvatarChange = async (file?: File) => {
        if (!file) return;
        setIsUploadingAvatar(true);
        try {
            const nextUserInfo = await uploadUserAvatar(file);
            onUserInfoChange(nextUserInfo);
            success('头像已更新');
        } catch (err: any) {
            error(err.message || '头像上传失败');
        } finally {
            setIsUploadingAvatar(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleProfileSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSavingProfile(true);
        try {
            const nextUserInfo = await updateUserProfile(profileForm);
            onUserInfoChange(nextUserInfo);
            success('个人资料已更新');
        } catch (err: any) {
            error(err.message || '保存失败');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handlePasswordSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsChangingPassword(true);
        try {
            await changePassword(passwordForm);
            success('密码已修改，请重新登录');
            setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(onLogout, 600);
        } catch (err: any) {
            error(err.message || '密码修改失败');
        } finally {
            setIsChangingPassword(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>

            {/* 隐藏的头像文件上传 input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => handleAvatarChange(e.target.files?.[0])}
            />

            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 flex flex-col max-h-[88vh]">
                {/* 弹窗头部 */}
                <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 shrink-0">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900">个人中心</h2>
                        <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-slate-500">管理头像、基础资料和账号安全</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                        title="关闭"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 移动端专属：横向分段胶囊 Tab (小于 md 屏幕展示) */}
                <div className="md:hidden px-4 pt-3 pb-2 border-b border-slate-100 shrink-0 bg-slate-50/50">
                    <div className="grid grid-cols-2 p-1 bg-slate-200/70 rounded-xl text-xs font-medium">
                        <button
                            type="button"
                            onClick={() => setActiveTab('profile')}
                            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                                activeTab === 'profile'
                                    ? 'bg-white text-orange-600 font-semibold shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <UserRound className="w-3.5 h-3.5" /> 资料设置
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('security')}
                            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                                activeTab === 'security'
                                    ? 'bg-white text-orange-600 font-semibold shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <ShieldCheck className="w-3.5 h-3.5" /> 账号安全
                        </button>
                    </div>
                </div>

                {/* 主体内容网格 */}
                <div className="flex-1 min-h-0 grid md:grid-cols-[190px_1fr] overflow-hidden">
                    {/* PC 端侧边栏 (仅在 md 及以上屏幕展示) */}
                    <aside className="hidden md:flex flex-col border-r border-slate-100 bg-slate-50/70 p-4 shrink-0">
                        <div className="flex flex-col items-center text-center px-2 py-4">
                            <div className="relative">
                                <img
                                    src={userInfo.avatar}
                                    alt="头像"
                                    className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md bg-slate-100"
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploadingAvatar}
                                    className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-lg hover:bg-orange-700 disabled:opacity-70 transition-colors"
                                    title="上传头像"
                                >
                                    {isUploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="mt-3 text-sm font-semibold text-slate-900">{userInfo.nickname || userInfo.username}</p>
                            <p className="mt-1 text-xs text-slate-500">身份：{userInfo.roleName}</p>
                        </div>

                        <div className="mt-2 space-y-1">
                            <button
                                type="button"
                                onClick={() => setActiveTab('profile')}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left ${activeTab === 'profile' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}
                            >
                                <UserRound className="w-4 h-4" /> 资料设置
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('security')}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left ${activeTab === 'security' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}
                            >
                                <ShieldCheck className="w-4 h-4" /> 账号安全
                            </button>
                        </div>
                    </aside>

                    {/* 表单内容区 (移动端与 PC 端自适应) */}
                    <main className="p-4 sm:p-6 overflow-y-auto">
                        {activeTab === 'profile' ? (
                            <form className="space-y-4 sm:space-y-5" onSubmit={handleProfileSubmit}>
                                {/* 移动端专属：紧凑横排头像卡片 */}
                                <div className="md:hidden flex items-center gap-3.5 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="relative shrink-0">
                                        <img
                                            src={userInfo.avatar}
                                            alt="头像"
                                            className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm bg-slate-100"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isUploadingAvatar}
                                            className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center shadow hover:bg-orange-700 disabled:opacity-70 transition-colors"
                                            title="上传头像"
                                        >
                                            {isUploadingAvatar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-sm font-bold text-slate-900 truncate">
                                                {userInfo.nickname || userInfo.username}
                                            </span>
                                            {userInfo.roleName && (
                                                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                                                    {userInfo.roleName}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-400 mt-1">点击右下角相机更换头像</p>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="profile-username" className="block text-xs sm:text-sm font-medium text-slate-700">
                                        登录账号
                                    </label>
                                    <input
                                        id="profile-username"
                                        value={userInfo.username}
                                        disabled
                                        className="mt-1 block w-full rounded-xl sm:rounded-lg border-slate-200 bg-slate-50 text-slate-500 text-xs sm:text-sm py-2.5 px-3"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="profile-nickname" className="block text-xs sm:text-sm font-medium text-slate-700">
                                        昵称
                                    </label>
                                    <div className="mt-1 relative">
                                        <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            id="profile-nickname"
                                            value={profileForm.nickname}
                                            onChange={(e) => setProfileForm({ ...profileForm, nickname: e.target.value })}
                                            className="block w-full rounded-xl sm:rounded-lg border-slate-300 pl-10 text-xs sm:text-sm py-2.5 focus:ring-orange-500 focus:border-orange-500"
                                            placeholder="请输入昵称"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="profile-email" className="block text-xs sm:text-sm font-medium text-slate-700">
                                        邮箱
                                    </label>
                                    <div className="mt-1 relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            id="profile-email"
                                            type="email"
                                            value={profileForm.email}
                                            onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                                            className="block w-full rounded-xl sm:rounded-lg border-slate-300 pl-10 text-xs sm:text-sm py-2.5 focus:ring-orange-500 focus:border-orange-500"
                                            placeholder="name@company.com"
                                        />
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={isSavingProfile}
                                        className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-xl sm:rounded-lg shadow-sm disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                                    >
                                        {isSavingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                                        保存资料
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form className="space-y-4 sm:space-y-5" onSubmit={handlePasswordSubmit}>
                                {/* 移动端专属：轻量安全提示 */}
                                <div className="md:hidden p-3 bg-orange-50/60 rounded-xl border border-orange-100 text-xs text-orange-800 flex items-start gap-2">
                                    <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                                    <span>修改密码后，所有已登录设备将需要重新登录。</span>
                                </div>

                                <div>
                                    <label htmlFor="old-password" className="block text-xs sm:text-sm font-medium text-slate-700">
                                        当前密码
                                    </label>
                                    <div className="mt-1 relative">
                                        <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            id="old-password"
                                            type="password"
                                            autoComplete="current-password"
                                            value={passwordForm.oldPassword}
                                            onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                                            className="block w-full rounded-xl sm:rounded-lg border-slate-300 pl-10 text-xs sm:text-sm py-2.5 focus:ring-orange-500 focus:border-orange-500"
                                            placeholder="请输入当前密码"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="new-password" className="block text-xs sm:text-sm font-medium text-slate-700">
                                        新密码
                                    </label>
                                    <input
                                        id="new-password"
                                        type="password"
                                        autoComplete="new-password"
                                        value={passwordForm.newPassword}
                                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                        className="mt-1 block w-full rounded-xl sm:rounded-lg border-slate-300 text-xs sm:text-sm py-2.5 px-3 focus:ring-orange-500 focus:border-orange-500"
                                        placeholder="6-20位字符"
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="confirm-password" className="block text-xs sm:text-sm font-medium text-slate-700">
                                        确认新密码
                                    </label>
                                    <input
                                        id="confirm-password"
                                        type="password"
                                        autoComplete="new-password"
                                        value={passwordForm.confirmPassword}
                                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                        className="mt-1 block w-full rounded-xl sm:rounded-lg border-slate-300 text-xs sm:text-sm py-2.5 px-3 focus:ring-orange-500 focus:border-orange-500"
                                        placeholder="再次输入新密码"
                                        required
                                    />
                                </div>

                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={isChangingPassword}
                                        className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-xl sm:rounded-lg shadow-sm disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                                    >
                                        {isChangingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                                        修改密码
                                    </button>
                                </div>
                            </form>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}
