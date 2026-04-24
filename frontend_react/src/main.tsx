// frontend_react/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

async function enableMocking() {
  // Mock 数据只在显式开启时启用，避免开发联调时拦截真实后端接口。
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') {
    return;
  }

  const { worker } = await import('./mocks/browser.ts');

  // 启动 worker，onUnhandledRequest: 'bypass' 表示未 Mock 的请求直接放行
  return worker.start({
    onUnhandledRequest: 'bypass', 
  });
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
