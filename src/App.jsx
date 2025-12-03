import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import Layout from './layout/Layout';
import HomePage from './views/HomePage';
import ArticleOutline from './views/ArticleOutline';

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
    window.scrollTo(0, 0); // 切换页面时滚动到顶部
    
    if (viewName === 'home') {
      navigate('/');
    } else if (viewName === 'article') {
      const { collId, articleId } = params;
      if (articleId) {
        navigate(`/article/${collId}/${articleId}`);
      } else {
        navigate(`/article/${collId}`);
      }
    }
  };
  
  return (
    <Layout onNavigate={handleNavigate}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/article/:collId" element={<ArticleRoute />} />
        <Route path="/article/:collId/:articleId" element={<ArticleRoute />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppWithRouter />
    </BrowserRouter>
  );
}