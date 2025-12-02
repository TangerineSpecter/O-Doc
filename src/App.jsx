import React, { useState } from 'react';
import Layout from './layout/Layout';
import HomePage from './views/HomePage';
import ArticleOutline from './views/ArticleOutline';

export default function App() {
  // 简单的路由状态管理
  // view: 'home' | 'article'
  const [currentView, setCurrentView] = useState('home');
  
  // 路由参数，用于存储传递的 coll_id, article_id 等
  const [viewParams, setViewParams] = useState({});

  /**
   * 导航函数
   * @param {string} viewName - 目标页面名称 ('home' 或 'article')
   * @param {object} params - 传递的参数 (例如 { collId: 1, articleId: 101 })
   */
  const handleNavigate = (viewName, params = {}) => {
    window.scrollTo(0, 0); // 切换页面时滚动到顶部
    setViewParams(params);
    setCurrentView(viewName);
  };

  return (
    <Layout>
      {currentView === 'home' && (
        <HomePage onNavigate={handleNavigate} />
      )}
      
      {currentView === 'article' && (
        <ArticleOutline 
          onNavigate={handleNavigate} 
          {...viewParams} 
        />
      )}
    </Layout>
  );
}