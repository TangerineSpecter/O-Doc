import { type ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import FloatingActionMenu from '../components/FloatingActionMenu';
import { AIChatWindow } from '../components/AIChatWindow';
import { PeekingBotButton } from '../components/AIChatWindow/PeekingBotButton';
import AgentWorldEdgeButton from '../components/AgentWorld/AgentWorldEdgeButton';
import AgentContactPanel from '../components/AgentContactPanel';
import { getUserInfo } from '../api/user';
import type { UserInfo } from '../types/api/user';
import type { AgentConfig } from '../types/api/setting';
import Navbar from './Navbar';
import SearchModal from '../components/SearchModal';
import ProfileCenterModal from '../components/ProfileCenterModal';
import MobileBottomBar from '../components/common/MobileBottomBar';
import { AuthProvider } from '../contexts/AuthContext';
import {clearAuthToken, getAuthToken} from '../utils/authStorage';
import { registerSwipeBackInterceptor } from '../utils/swipeBackRegistry';
import { useScrollDirection } from '../hooks/useScrollDirection';

/**
 * 判断当前路由是否属于文章或帖子的具体阅读详情页。
 * 仅对文章、帖子、图书导读等具体正文详情页开启移动端沉浸阅读滚动收起；
 * 专栏列表、文集目录、首页、备忘录等其他管理/列表页面不生效。
 */
function isReadingDetailPage(pathname: string): boolean {
    const segments = pathname.split('/').filter(Boolean);
    // 匹配 /article/:collId/:articleId（段数 >= 3 说明不是文集/专栏首页列表，而是单篇阅读详情）
    if (segments[0] === 'article' && segments.length >= 3) {
        return true;
    }
    // 匹配 /books/:collId/guide/:bookId（图书导读正文阅读）
    if (segments[0] === 'books' && segments[2] === 'guide' && segments.length >= 4) {
        return true;
    }
    return false;
}

interface LayoutProps {
    children: ReactNode;
    onNavigate?: (viewName: string, params?: any) => void;
}

export default function Layout({ children, onNavigate }: LayoutProps) {
    const location = useLocation();
    const isQuantWorkspace = location.pathname.startsWith('/quant/');
    const isReadingMode = isReadingDetailPage(location.pathname);
    const isArticleReadingMode = isReadingMode && location.pathname.startsWith('/article/');
    const isNavVisible = useScrollDirection({ enabled: isReadingMode });

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

    // --- 移动端边缘右滑拦截（优先关闭打开的浮层） ---
    useEffect(() => {
        if (!isChatOpen && !isAgentPanelOpen && !isSearchOpen && !isProfileOpen) {
            return;
        }

        const unregister = registerSwipeBackInterceptor(() => {
            if (isChatOpen) {
                setIsChatOpen(false);
                return true;
            }
            if (isAgentPanelOpen) {
                setIsAgentPanelOpen(false);
                return true;
            }
            if (isSearchOpen) {
                setIsSearchOpen(false);
                return true;
            }
            if (isProfileOpen) {
                setIsProfileOpen(false);
                return true;
            }
            return false;
        });

        return unregister;
    }, [isChatOpen, isAgentPanelOpen, isSearchOpen, isProfileOpen]);

    const isAuthenticated = Boolean(userInfo);

    return (
        <AuthProvider value={{ userInfo, isAuthenticated }}>
        <div className={`${isQuantWorkspace ? 'min-h-0' : 'min-h-screen'} bg-slate-50 text-slate-800 font-sans selection:bg-orange-100 selection:text-orange-900`}>

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
                    onNavigate?.('agentWorld', {settings: 'agents'});
                }}
            />

            {!isChatOpen && !isAgentPanelOpen && (
                <div className="hidden sm:block">
                    <PeekingBotButton
                        onClick={handleOpenAIEntry}
                        title={isAuthenticated ? '打开 AI 中心' : '打开小橘 AI助手'}
                        zIndexClass="z-[80]"
                    />
                    <AgentWorldEdgeButton />
                </div>
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
                onOpenAI={handleOpenAIEntry}
                userInfo={userInfo}
                onLogout={handleLogout}
                onOpenProfile={() => setIsProfileOpen(true)}
                isVisible={isNavVisible}
            />

            <ProfileCenterModal
                isOpen={isProfileOpen}
                userInfo={userInfo}
                onClose={() => setIsProfileOpen(false)}
                onUserInfoChange={setUserInfo}
                onLogout={handleLogout}
            />

            <div
                className={`pb-24 sm:pb-0 ${isArticleReadingMode ? 'reading-article-layout' : ''}`}
                data-nav-visible={isNavVisible ? 'true' : 'false'}
            >
                {children}
            </div>

            {/* 移动端底部胶囊导航栏：闪念、提示词库、正中间橙色大圆AI按钮、资源库、数据统计 */}
            {!isChatOpen && !isAgentPanelOpen && (
                <MobileBottomBar onOpenAI={handleOpenAIEntry} isVisible={isNavVisible} />
            )}

            {isAuthenticated && (
                <div className="hidden sm:block">
                    <FloatingActionMenu />
                </div>
            )}

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
