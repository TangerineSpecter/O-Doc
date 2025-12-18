import { type ReactNode, useEffect, useState } from 'react';
import FloatingActionMenu from '../components/FloatingActionMenu';
import { AIChatWindow } from '../components/AIChatWindow';
import { getUserInfo } from '../api/user';
import Navbar from './Navbar';
import SearchModal from '../components/SearchModal';

interface LayoutProps {
    children: ReactNode;
    onNavigate?: (viewName: string, params?: any) => void;
}

export default function Layout({ children, onNavigate }: LayoutProps) {
    // --- 状态管理 ---
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [userInfo, setUserInfo] = useState<any>(null);

    // --- 用户信息获取 ---
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            getUserInfo().then(res => {
                setUserInfo(res);
            }).catch(() => {
                localStorage.removeItem('token');
                setUserInfo(null);
            });
        }
    }, []);

    // --- 事件处理 ---
    const handleLogout = () => {
        localStorage.removeItem('token');
        setUserInfo(null);
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

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-orange-100 selection:text-orange-900">

            <AIChatWindow isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

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
            />

            {children}

            <FloatingActionMenu />

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
    );
}