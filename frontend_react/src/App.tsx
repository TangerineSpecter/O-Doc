import {BrowserRouter, Routes, Route, useNavigate, useParams} from 'react-router-dom';
import {ToastProvider} from './components/common/ToastProvider'; // 1. 引入 Provider
import Layout from './layout/Layout';
import HomePage from './views/HomePage';
import ArticleOutline from './views/ArticleOutline';
import ImageAnthologyPage from './views/ImageAnthologyPage';
import LoginPage from './views/LoginPage';
import EditorPage from './views/EditorPage';
import ResourcesPage from './views/ResourcesPage';
import StatisticsPage from './views/StatisticsPage';
import CategoriesPage from './views/CategoriesPage';
import TagsPage from './views/TagsPage';
import SettingsPage from './views/SettingsPage';
import TodoPage from './views/TodoPage';
import WhiteboardPage from './views/WhiteboardPage'


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
        } else if (viewName === 'image') {
            const {collId} = params as { collId: string };
            navigate(`/image/${collId}`);
        } else if (viewName === 'login') { // 新增
            navigate('/login');
        } else if (viewName === 'settings') { // 新增：处理设置页跳转
            navigate('/settings');
        } else if (viewName === 'whiteboard') { // 新增这一行
            navigate('/whiteboard');
        }
    };

    return <HomePage onNavigate={handleNavigate}/>;
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
        } else if (viewName === 'image') {
            const {collId} = params as { collId: string };
            navigate(`/image/${collId}`);
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
        } else if (viewName === 'image') {
            const {collId} = params as { collId: string };
            navigate(`/image/${collId}`);
        } else if (viewName === 'login') {
            navigate('/login');
        }
    };

    return (
        <ImageAnthologyPage
            onNavigate={handleNavigate}
            collId={params.collId}
        />
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
        } else if (viewName === 'image') {
            const {collId} = params as { collId: string };
            navigate(`/image/${collId}`);
        } else if (viewName === 'login') { // 新增：处理登录跳转
            navigate('/login');
        } else if (viewName === 'settings') { // 新增：处理设置页跳转
            navigate('/settings');
        }
    };

    return (
        <Routes>
            <Route path="/" element={
                <Layout onNavigate={handleNavigate}>
                    <HomeRoute/>
                </Layout>
            }/>
            {/* 核心修复：合并路由
             使用 /* 通配符匹配后续路径，这样切换文章时不会卸载 Layout 和 ArticleRoute 组件
            */}
            <Route path="/article/:collId/*" element={
                <Layout onNavigate={handleNavigate}>
                    <ArticleRoute/>
                </Layout>
            }/>
            {/* 图片文集路由 */}
            <Route path="/image/:collId" element={
                <Layout onNavigate={handleNavigate}>
                    <ImageAnthologyRoute/>
                </Layout>
            }/>
            <Route path="/login" element={<LoginPage/>}/> {/* 新增路由：登录页不使用Layout */}
            {/* 新增编辑器路由 - 不使用 Layout，提供全屏体验 */}
            <Route path="/editor" element={<EditorPage/>}/>
            <Route path="/editor/:docId" element={<EditorPage/>}/>
            <Route path="/resources" element={
                <Layout onNavigate={handleNavigate}>
                    <ResourcesPage/>
                </Layout>
            }/>
            <Route path="/stats" element={
                <Layout onNavigate={handleNavigate}>
                    <StatisticsPage/>
                </Layout>
            }/>
            <Route path="/tags" element={
                <Layout onNavigate={handleNavigate}>
                    <TagsPage/>
                </Layout>
            }/>
            <Route path="/categories" element={
                <Layout onNavigate={handleNavigate}>
                    <CategoriesPage/>
                </Layout>
            }/>
            <Route path="/settings" element={
                <Layout onNavigate={handleNavigate}>
                    <SettingsPage/>
                </Layout>
            }/>
            <Route path="/todo" element={
                <Layout onNavigate={handleNavigate}>
                    <TodoPage/>
                </Layout>
            }/>
            <Route path="/whiteboard" element={
                <Layout onNavigate={handleNavigate}>
                    <WhiteboardPage/>
                </Layout>
            }/>
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <ToastProvider>
                <AppWithRouter/>
            </ToastProvider>
        </BrowserRouter>
    );
}