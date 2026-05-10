import { FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, LockKeyhole, Mail, ShieldCheck, UserRound, X } from 'lucide-react';
import { changePassword, updateUserProfile, uploadUserAvatar } from '../api/user';
import type { UserInfo } from '../types/api/user';
import { useToast } from './common/ToastProvider';

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
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">个人中心</h2>
                        <p className="mt-1 text-sm text-slate-500">管理头像、基础资料和账号安全</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="grid md:grid-cols-[190px_1fr] min-h-[420px]">
                    <aside className="border-r border-slate-100 bg-slate-50/70 p-4">
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
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                    onChange={(e) => handleAvatarChange(e.target.files?.[0])}
                                />
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

                    <main className="p-6">
                        {activeTab === 'profile' ? (
                            <form className="space-y-5" onSubmit={handleProfileSubmit}>
                                <div>
                                    <label htmlFor="profile-username" className="block text-sm font-medium text-slate-700">
                                        登录账号
                                    </label>
                                    <input
                                        id="profile-username"
                                        value={userInfo.username}
                                        disabled
                                        className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 text-slate-500 sm:text-sm py-2.5 px-3"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="profile-nickname" className="block text-sm font-medium text-slate-700">
                                        昵称
                                    </label>
                                    <div className="mt-1 relative">
                                        <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            id="profile-nickname"
                                            value={profileForm.nickname}
                                            onChange={(e) => setProfileForm({ ...profileForm, nickname: e.target.value })}
                                            className="block w-full rounded-lg border-slate-300 pl-10 sm:text-sm py-2.5 focus:ring-orange-500 focus:border-orange-500"
                                            placeholder="请输入昵称"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="profile-email" className="block text-sm font-medium text-slate-700">
                                        邮箱
                                    </label>
                                    <div className="mt-1 relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            id="profile-email"
                                            type="email"
                                            value={profileForm.email}
                                            onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                                            className="block w-full rounded-lg border-slate-300 pl-10 sm:text-sm py-2.5 focus:ring-orange-500 focus:border-orange-500"
                                            placeholder="name@company.com"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end pt-2">
                                    <button
                                        type="submit"
                                        disabled={isSavingProfile}
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {isSavingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                                        保存资料
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form className="space-y-5" onSubmit={handlePasswordSubmit}>
                                <div>
                                    <label htmlFor="old-password" className="block text-sm font-medium text-slate-700">
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
                                            className="block w-full rounded-lg border-slate-300 pl-10 sm:text-sm py-2.5 focus:ring-orange-500 focus:border-orange-500"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">
                                        新密码
                                    </label>
                                    <input
                                        id="new-password"
                                        type="password"
                                        autoComplete="new-password"
                                        value={passwordForm.newPassword}
                                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                        className="mt-1 block w-full rounded-lg border-slate-300 sm:text-sm py-2.5 px-3 focus:ring-orange-500 focus:border-orange-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">
                                        确认新密码
                                    </label>
                                    <input
                                        id="confirm-password"
                                        type="password"
                                        autoComplete="new-password"
                                        value={passwordForm.confirmPassword}
                                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                        className="mt-1 block w-full rounded-lg border-slate-300 sm:text-sm py-2.5 px-3 focus:ring-orange-500 focus:border-orange-500"
                                        required
                                    />
                                </div>

                                <div className="flex justify-end pt-2">
                                    <button
                                        type="submit"
                                        disabled={isChangingPassword}
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
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
