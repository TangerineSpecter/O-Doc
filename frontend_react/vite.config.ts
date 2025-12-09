// frontend_react/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      // 移除 viteMockServe 配置
    ],
    // 根据模式动态设置base路径
    base: mode === 'production' ? '/static/' : '/',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
});