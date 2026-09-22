import { type ReactNode, useEffect, useState } from 'react';
import FloatingActionMenu from '../components/FloatingActionMenu';
import { AIChatWindow } from '../components/AIChatWindow';
import { PeekingBotButton } from '../components/AIChatWindow/PeekingBotButton';
import AgentContactPanel from '../components/AgentContactPanel';
import { getUserInfo } from '../api/user';
import type { UserInfo } from '../types/api/user';
import type { AgentConfig } from '../types/api/setting';
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
    const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);
    const [activeAgent, setActiveAgent] = useState<AgentConfig | null>(null);
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
        setIsAgentPanelOpen(false);
        setActiveAgent(null);
        if (onNavigate) onNavigate('login');
    };

    const handleOpenAIEntry = () => {
        if (isAuthenticated) {
            setIsAgentPanelOpen(true);
            return;
        }
        setActiveAgent(null);
        setIsChatOpen(true);
    };

    const handleStartPublicChat = () => {
        setActiveAgent(null);
        setIsAgentPanelOpen(false);
        setIsChatOpen(true);
    };

    const handleStartAgentChat = (agent: AgentConfig) => {
        setActiveAgent(agent);
        setIsAgentPanelOpen(false);
        setIsChatOpen(true);
    };

    const handleOpenContactsFromChat = () => {
        if (!isAuthenticated) return;
        setIsChatOpen(false);
        setIsAgentPanelOpen(true);
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

            <AIChatWindow
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                activeAgent={activeAgent}
                onOpenContacts={isAuthenticated ? handleOpenContactsFromChat : undefined}
                onSelectAgent={isAuthenticated ? setActiveAgent : undefined}
            />

            <AgentContactPanel
                isOpen={isAgentPanelOpen}
                onClose={() => setIsAgentPanelOpen(false)}
                onStartPublicChat={handleStartPublicChat}
                onStartAgentChat={handleStartAgentChat}
                onManageAgents={() => {
                    setIsAgentPanelOpen(false);
                    onNavigate?.('settings', {tab: 'agent'});
                }}
            />

            {!isChatOpen && !isAgentPanelOpen && (
                <PeekingBotButton
                    onClick={handleOpenAIEntry}
                    title={isAuthenticated ? '打开 AI 中心' : '打开小橘 AI助手'}
                    zIndexClass="z-[80]"
                />
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
