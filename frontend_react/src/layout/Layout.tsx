import { type ReactNode, useEffect, useState } from 'react';
import { Bot, MessageCircle } from 'lucide-react';
import FloatingActionMenu from '../components/FloatingActionMenu';
import { AIChatWindow } from '../components/AIChatWindow';
import { getUserInfo } from '../api/user';
import type { UserInfo } from '../types/api/user';
import Navbar from './Navbar';
import SearchModal from '../components/SearchModal';
import ProfileCenterModal from '../components/ProfileCenterModal';
import { AuthProvider } from '../contexts/AuthContext';
import {clearAuthToken, getAuthToken} from '../utils/authStorage';

interface LayoutProps {
    children: ReactNode;
    onNavigate?: (viewName: string, params?: any) => void;
}

export default function Layout({ children, onNavigate }: LayoutProps) {
    // --- 状态管理 ---
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

    // --- 用户信息获取 ---
    useEffect(() => {
        const token = getAuthToken();
        if (token) {
            getUserInfo().then(res => {
                setUserInfo(res);
            }).catch(() => {
                clearAuthToken();
                setUserInfo(null);
            });
        }
    }, []);

    // --- 事件处理 ---
    const handleLogout = () => {
        clearAuthToken();
        setUserInfo(null);
        setIsProfileOpen(false);
        if (onNavigate) onNavigate('login');
    };

    // --- 键盘快捷键 (⌘K) ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen((prev) => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const isAuthenticated = Boolean(userInfo);

    return (
        <AuthProvider value={{ userInfo, isAuthenticated }}>
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-orange-100 selection:text-orange-900">

            <AIChatWindow isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

            {!isChatOpen && (
                <button
                    type="button"
                    onClick={() => setIsChatOpen(true)}
                    className="fixed right-0 top-1/2 -translate-y-1/2 z-[80] bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 rounded-l-xl shadow-lg cursor-pointer hover:w-20 transition-all w-12 flex flex-col items-center gap-3 group border-y border-l border-white/20"
                    title="打开小橘 AI助手"
                >
                    <Bot className="w-6 h-6"/>
                    <div className="flex flex-col items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-bold writing-vertical-rl tracking-widest">AI</span>
                        <MessageCircle className="w-3 h-3 mt-1"/>
                    </div>
                </button>
            )}

            <SearchModal
                isOpen={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                onNavigate={onNavigate}
                onChatStart={() => setIsChatOpen(true)}
            />

            <Navbar
                onNavigate={onNavigate}
                onOpenSearch={() => setIsSearchOpen(true)}
                userInfo={userInfo}
                onLogout={handleLogout}
                onOpenProfile={() => setIsProfileOpen(true)}
            />

            <ProfileCenterModal
                isOpen={isProfileOpen}
                userInfo={userInfo}
                onClose={() => setIsProfileOpen(false)}
                onUserInfoChange={setUserInfo}
                onLogout={handleLogout}
            />

            {children}

            {isAuthenticated && <FloatingActionMenu />}

            {/* 背景装饰 */}
            <div className="fixed inset-0 pointer-events-none z-[-1] opacity-40">
                <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-orange-50/50 to-transparent"></div>
                <div className="absolute right-0 top-20 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl"></div>
                <div className="absolute left-10 top-40 w-72 h-72 bg-orange-100/30 rounded-full blur-3xl"></div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
                <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)'
                }}></div>
            </div>
        </div>
        </AuthProvider>
    );
}
