// frontend_react/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

async function enableMocking() {
  // 只在开发环境启动 Mock
  if (process.env.NODE_ENV !== 'development') {
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