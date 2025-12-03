import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import Layout from './layout/Layout';
import HomePage from './views/HomePage';
import ArticleOutline from './views/ArticleOutline';
import LoginPage from './views/LoginPage';
import EditorPage from './views/EditorPage';
import ResourcesPage from './views/ResourcesPage';
import StatisticsPage from './views/StatisticsPage';



// HomePage的路由包装组件
function HomeRoute() {
  const navigate = useNavigate();

  const handleNavigate = (viewName, params = {}) => {
    window.scrollTo(0, 0);

    if (viewName === 'article') {
      const { collId, articleId } = params;
      if (articleId) {
        navigate(`/article/${collId}/${articleId}`);
      } else {
        navigate(`/article/${collId}`);
      }
    } else if (viewName === 'login') { // 新增
      navigate('/login');
    }
  };

  return <HomePage onNavigate={handleNavigate} />;
}

// 文章页面组件，用于接收路由参数
function ArticleRoute() {
  const params = useParams();
  const navigate = useNavigate();

  const handleNavigate = (viewName, params = {}) => {
    window.scrollTo(0, 0);

    if (viewName === 'home') {
      navigate('/');
    } else if (viewName === 'article') {
      const { collId, articleId } = params;
      if (articleId) {
        navigate(`/article/${collId}/${articleId}`);
      } else {
        navigate(`/article/${collId}`);
      }
    } else if (viewName === 'login') { // 新增
      navigate('/login');
    }
  };

  return (
    <ArticleOutline
      onNavigate={handleNavigate}
      collId={params.collId}
      articleId={params.articleId}
    />
  );
}

// 带有路由上下文的布局组件
function AppWithRouter() {
  const navigate = useNavigate();

  const handleNavigate = (viewName, params = {}) => {
    window.scrollTo(0, 0);

    if (viewName === 'home') {
      navigate('/');
    } else if (viewName === 'article') {
      const { collId, articleId } = params;
      if (articleId) {
        navigate(`/article/${collId}/${articleId}`);
      } else {
        navigate(`/article/${collId}`);
      }
    } else if (viewName === 'login') { // 新增：处理登录跳转
      navigate('/login');
    }
  };

  return (
    <Routes>
      <Route path="/" element={
        <Layout onNavigate={handleNavigate}>
          <HomeRoute />
        </Layout>
      } />
      <Route path="/article/:collId" element={
        <Layout onNavigate={handleNavigate}>
          <ArticleRoute />
        </Layout>
      } />
      <Route path="/article/:collId/:articleId" element={
        <Layout onNavigate={handleNavigate}>
          <ArticleRoute />
        </Layout>
      } />
      <Route path="/login" element={<LoginPage />} /> {/* 新增路由：登录页不使用Layout */}
      {/* 新增编辑器路由 - 不使用 Layout，提供全屏体验 */}
      <Route path="/editor" element={<EditorPage />} />
      <Route path="/editor/:docId" element={<EditorPage />} />
      <Route path="/resources" element={
        <Layout onNavigate={handleNavigate}>
          <ResourcesPage />
        </Layout>
      } />
      <Route path="/stats" element={
        <Layout onNavigate={handleNavigate}>
          <StatisticsPage />
        </Layout>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppWithRouter />
    </BrowserRouter>
  );
}