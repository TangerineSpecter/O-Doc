import {lazy, Suspense, type ReactNode} from 'react';
import {BrowserRouter, Navigate, Routes, Route, useLocation, useNavigate, useParams} from 'react-router-dom';
import {ToastProvider} from './components/common/ToastProvider'; // 1. 引入 Provider
import {VersionInfoProvider} from './contexts/VersionInfoContext';
import GlobalSwipeBack from './components/common/GlobalSwipeBack';
import Layout from './layout/Layout';
import HomePage from './views/HomePage';
import ArticleOutline from './views/ArticleOutline';
import StarLoader from './components/common/StarLoader';
const ImageAnthologyPage = lazy(() => import('./views/ImageAnthologyPage'));
const BookAnthologyPage = lazy(() => import('./views/BookAnthologyPage'));
const QuantPage = lazy(() => import('./views/QuantPage'));
const MT4ArchivePage = lazy(() => import('./views/MT4ArchivePage'));
const NovelPage = lazy(() => import('./views/NovelPage'));
const LearningPage = lazy(() => import('./views/LearningPage'));
const BookAnalysisPage = lazy(() => import('./views/BookAnalysisPage'));
const LoginPage = lazy(() => import('./views/LoginPage'));
const EditorPage = lazy(() => import('./views/EditorPage'));
const ResourcesPage = lazy(() => import('./views/ResourcesPage'));
const StatisticsPage = lazy(() => import('./views/StatisticsPage'));
const CategoriesPage = lazy(() => import('./views/CategoriesPage'));
const TagsPage = lazy(() => import('./views/TagsPage'));
const SettingsPage = lazy(() => import('./views/SettingsPage'));
const MemosPage = lazy(() => import('./views/MemosPage'));
const WhiteboardPage = lazy(() => import('./views/WhiteboardPage'));
const WhiteboardManagePage = lazy(() => import('./views/WhiteboardManagePage'));
const MaintenancePage = lazy(() => import('./views/MaintenancePage'));
const AgentWorldPage = lazy(() => import('./views/AgentWorldPage'));
const PromptLibraryPage = lazy(() => import('./views/PromptLibraryPage'));
const RecyclePage = lazy(() => import('./views/RecyclePage'));
import {getAuthToken} from './utils/authStorage';
import {initializeNovelNavigation} from './utils/novelNavigation';

initializeNovelNavigation();

function LearningRoute() {
    const {collId, exerciseId} = useParams();
    return <LearningPage key={`${collId}:${exerciseId || "home"}`}/>;
}

function MT4ArchiveRoute() {
    const {collId} = useParams();
    return <MT4ArchivePage key={collId}/>;
}

function hasAuthToken() {
    return Boolean(getAuthToken());
}

interface ImageNavigationParams {
    collId?: string;
    coll_id?: string;
    imageId?: string;
    image_id?: string;
}

function buildImagePath(params: ImageNavigationParams) {
    const collId = params.collId || params.coll_id;
    const imageId = params.imageId || params.image_id;
    if (!collId) return '/';
    const imageQuery = imageId ? `?imageId=${encodeURIComponent(imageId)}` : '';
    return `/image/${collId}${imageQuery}`;
}

function RequireAuth({children}: { children: ReactNode }) {
    const location = useLocation();

    if (!hasAuthToken()) {
        return <Navigate to="/login" replace state={{from: location.pathname}}/>;
    }

    return <>{children}</>;
}

// HomePage的路由包装组件
function HomeRoute() {
    const navigate = useNavigate();

    const handleNavigate = (viewName: string, params = {}) => {
        window.scrollTo(0, 0);

        if (viewName === 'home') {
            navigate('/');
        } else if (viewName === 'article') {
            const {collId, articleId} = params as { collId: string, articleId?: string };
            if (articleId) {
                navigate(`/article/${collId}/${articleId}`);
            } else {
                navigate(`/article/${collId}`);
            }
        } else if (viewName === 'backtest') {
            const {collId} = params as {collId: string}; navigate(`/backtest/${encodeURIComponent(collId)}`);
        } else if (viewName === 'quant') {
            const {collId, entryId} = params as {collId: string; entryId?: string};
            navigate(entryId ? `/quant/${encodeURIComponent(collId)}/entries/${encodeURIComponent(entryId)}` : `/quant/${encodeURIComponent(collId)}`);
        } else if (viewName === 'image') {
            navigate(buildImagePath(params as ImageNavigationParams));
        } else if (viewName === 'novel') {
            const {collId} = params as {collId: string}; navigate(`/novel/${collId}`);
        } else if (viewName === 'learning') {
            const {collId} = params as {collId: string}; navigate(`/learning/${collId}`);
        } else if (viewName === 'book') {
            const {collId} = params as {collId: string}; navigate(`/books/${collId}`);
        } else if (viewName === 'login') { // 新增
            navigate('/login');
        } else if (viewName === 'settings') { // 新增：处理设置页跳转
            const {tab} = params as { tab?: string };
            navigate(tab ? `/settings?tab=${encodeURIComponent(tab)}` : '/settings');
        } else if (viewName === 'whiteboard') { // 新增这一行
            navigate('/whiteboard');
        } else if (viewName === 'maintenance') {
            navigate('/maintenance');
        } else if (viewName === 'agentWorld') {
            navigate((params as {settings?: string}).settings === 'agents' ? '/agent-world?settings=agents' : '/agent-world');
        }
    };

    return <HomePage onNavigate={handleNavigate}/>;
}

function BookAnthologyRoute() {
    const params = useParams(); const navigate = useNavigate();
    return <BookAnthologyPage collId={params.collId} onNavigate={(view, values) => {
        if (view === 'home') navigate('/');
        if (view === 'bookGuide' && values?.bookId) navigate(`/books/${params.collId}/guide/${values.bookId}`);
    }}/>;
}

// 文章页面组件，用于接收路由参数
function ArticleRoute() {
    const params = useParams();
    const navigate = useNavigate();

    // 处理 articleId：优先取命名参数，如果没有则取通配符参数 '*'
    // 当路由为 /article/:collId/* 时，articleId 会在 params['*'] 中
    const currentArticleId = params.articleId || params['*'];

    const handleNavigate = (viewName: string, params = {}) => {
        window.scrollTo(0, 0);

        if (viewName === 'home') {
            navigate('/');
        } else if (viewName === 'article') {
            const {collId, articleId} = params as { collId: string, articleId?: string };
            if (articleId) {
                navigate(`/article/${collId}/${articleId}`);
            } else {
                navigate(`/article/${collId}`);
            }
        } else if (viewName === 'quant') {
            const {collId, entryId} = params as {collId: string; entryId?: string};
            navigate(entryId ? `/quant/${encodeURIComponent(collId)}/entries/${encodeURIComponent(entryId)}` : `/quant/${encodeURIComponent(collId)}`);
        } else if (viewName === 'image') {
            navigate(buildImagePath(params as ImageNavigationParams));
        } else if (viewName === 'login') { // 新增
            navigate('/login');
        }
    };

    return (
        <ArticleOutline
            onNavigate={handleNavigate}
            collId={params.collId}
            articleId={currentArticleId}
        />
    );
}

// 图片文集页面组件，用于接收路由参数
function ImageAnthologyRoute() {
    const params = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const openImageId = new URLSearchParams(location.search).get('imageId') || undefined;

    const handleNavigate = (viewName: string, params = {}) => {
        window.scrollTo(0, 0);

        if (viewName === 'home') {
            navigate('/');
        } else if (viewName === 'article') {
            const {collId, articleId} = params as { collId: string, articleId?: string };
            if (articleId) {
                navigate(`/article/${collId}/${articleId}`);
            } else {
                navigate(`/article/${collId}`);
            }
        } else if (viewName === 'quant') {
            const {collId, entryId} = params as {collId: string; entryId?: string};
            navigate(entryId ? `/quant/${encodeURIComponent(collId)}/entries/${encodeURIComponent(entryId)}` : `/quant/${encodeURIComponent(collId)}`);
        } else if (viewName === 'image') {
            navigate(buildImagePath(params as ImageNavigationParams));
        } else if (viewName === 'login') {
            navigate('/login');
        }
    };

    return (
        <ImageAnthologyPage
            onNavigate={handleNavigate}
            collId={params.collId}
            openImageId={openImageId}
            openImageRequestId={location.key}
        />
    );
}

function RouteLoading() {
    return (
        <div className="flex h-[60vh] items-center justify-center">
            <StarLoader variant="dots" />
        </div>
    );
}

// 带有路由上下文的布局组件
function AppWithRouter() {
    const navigate = useNavigate();

    const handleNavigate = (viewName: string, params = {}) => {
        window.scrollTo(0, 0);

        if (viewName === 'home') {
            navigate('/');
        } else if (viewName === 'article') {
            const {collId, articleId} = params as { collId: string, articleId?: string };
            if (articleId) {
                navigate(`/article/${collId}/${articleId}`);
            } else {
                navigate(`/article/${collId}`);
            }
        } else if (viewName === 'quant') {
            const {collId, entryId} = params as {collId: string; entryId?: string};
            navigate(entryId ? `/quant/${encodeURIComponent(collId)}/entries/${encodeURIComponent(entryId)}` : `/quant/${encodeURIComponent(collId)}`);
        } else if (viewName === 'image') {
            navigate(buildImagePath(params as ImageNavigationParams));
        } else if (viewName === 'login') { // 新增：处理登录跳转
            navigate('/login');
        } else if (viewName === 'settings') { // 新增：处理设置页跳转
            const {tab} = params as { tab?: string };
            navigate(tab ? `/settings?tab=${encodeURIComponent(tab)}` : '/settings');
        } else if (viewName === 'memos') {
            navigate('/memos');
        } else if (viewName === 'resources') {
            navigate('/resources');
        } else if (viewName === 'prompts') {
            const {promptId, prompt_id} = params as { promptId?: string; prompt_id?: string };
            const selectedPromptId = promptId || prompt_id;
            navigate(selectedPromptId ? `/prompts?promptId=${encodeURIComponent(selectedPromptId)}` : '/prompts');
        } else if (viewName === 'recycle') {
            navigate('/recycle');
        } else if (viewName === 'maintenance') {
            navigate('/maintenance');
        } else if (viewName === 'agentWorld') {
            navigate((params as {settings?: string}).settings === 'agents' ? '/agent-world?settings=agents' : '/agent-world');
        }
    };

    return (
        <>
            <GlobalSwipeBack/>
            <Routes>
            <Route path="/" element={
                <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                    <HomeRoute/>
                </Suspense></Layout>
            }/>
            {/* 核心修复：合并路由
             使用 /* 通配符匹配后续路径，这样切换文章时不会卸载 Layout 和 ArticleRoute 组件
            */}
            <Route path="/article/:collId/*" element={
                <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                    <ArticleRoute/>
                </Suspense></Layout>
            }/>
            {/* 图片文集路由 */}
            <Route path="/image/:collId" element={
                <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                    <ImageAnthologyRoute/>
                </Suspense></Layout>
            }/>
            <Route path="/novel/:collId" element={<Suspense fallback={<div className="p-8 text-slate-400">正在打开小说…</div>}><NovelPage/></Suspense>}/>
            <Route path="/novel/:collId/read" element={<Suspense fallback={<div className="p-8 text-slate-400">正在打开小说…</div>}><NovelPage readerOnly/></Suspense>}/>
            <Route path="/quant/:collId" element={<RequireAuth><Layout onNavigate={handleNavigate}><Suspense fallback={<div className="p-8 text-slate-400">正在打开量化研究…</div>}><QuantPage/></Suspense></Layout></RequireAuth>}/>
            <Route path="/backtest/:collId" element={<RequireAuth><Layout onNavigate={handleNavigate}><Suspense fallback={<div className="p-8 text-slate-400">正在打开回测文集…</div>}><MT4ArchiveRoute/></Suspense></Layout></RequireAuth>}/>
            <Route path="/quant/:collId/entries/:entryId" element={<RequireAuth><Layout onNavigate={handleNavigate}><Suspense fallback={<div className="p-8 text-slate-400">正在打开量化研究…</div>}><QuantPage/></Suspense></Layout></RequireAuth>}/>
            <Route path="/learning/:collId" element={<RequireAuth><Layout onNavigate={handleNavigate}><Suspense fallback={<div className="p-8 text-slate-400">正在打开学习…</div>}><LearningRoute/></Suspense></Layout></RequireAuth>}/>
            <Route path="/learning/:collId/exercises/:exerciseId" element={<RequireAuth><Layout onNavigate={handleNavigate}><Suspense fallback={<div className="p-8 text-slate-400">正在打开练习…</div>}><LearningRoute/></Suspense></Layout></RequireAuth>}/>
            <Route path="/books/:collId" element={<RequireAuth><Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}><BookAnthologyRoute/></Suspense></Layout></RequireAuth>}/>
            <Route path="/books/:collId/guide/:bookId" element={<RequireAuth><Layout onNavigate={handleNavigate}><Suspense fallback={<div className="p-8 text-sm text-slate-400">正在打开 AI 导读…</div>}><BookAnalysisPage/></Suspense></Layout></RequireAuth>}/>
            <Route path="/login" element={<Suspense fallback={<RouteLoading />}><LoginPage/></Suspense>}/> {/* 新增路由：登录页不使用Layout */}
            {/* 新增编辑器路由 - 不使用 Layout，提供全屏体验 */}
            <Route path="/editor" element={
                <RequireAuth>
                    <Suspense fallback={<RouteLoading />}><EditorPage/></Suspense>
                </RequireAuth>
            }/>
            <Route path="/editor/:docId" element={
                <RequireAuth>
                    <Suspense fallback={<RouteLoading />}><EditorPage/></Suspense>
                </RequireAuth>
            }/>
            <Route path="/resources" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <ResourcesPage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
            <Route path="/prompts" element={<RequireAuth><Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}><PromptLibraryPage/></Suspense></Layout></RequireAuth>}/>
            <Route path="/recycle" element={<RequireAuth><Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}><RecyclePage/></Suspense></Layout></RequireAuth>}/>
            <Route path="/stats" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <StatisticsPage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
            <Route path="/tags" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <TagsPage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
            <Route path="/categories" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <CategoriesPage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
            <Route path="/settings" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <SettingsPage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
            <Route path="/memos" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <MemosPage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
            <Route path="/maintenance" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <MaintenancePage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
            <Route path="/agent-world" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <AgentWorldPage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
            <Route path="/whiteboard" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <WhiteboardManagePage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
            <Route path="/whiteboard/:boardId" element={
                <RequireAuth>
                    <Layout onNavigate={handleNavigate}><Suspense fallback={<RouteLoading />}>
                        <WhiteboardPage/>
                    </Suspense></Layout>
                </RequireAuth>
            }/>
        </Routes>
        </>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <ToastProvider>
                <VersionInfoProvider>
                    <AppWithRouter/>
                </VersionInfoProvider>
            </ToastProvider>
        </BrowserRouter>
    );
}
