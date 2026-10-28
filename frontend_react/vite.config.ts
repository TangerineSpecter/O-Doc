// frontend_react/vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const localMode = loadEnv(mode, process.cwd(), 'VITE_').VITE_LOCAL_MODE === 'true';
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
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('pixi.js') || id.includes('@pixi')) {
                return 'vendor-pixi';
              }
              if (id.includes('echarts') || id.includes('zrender')) {
                return 'vendor-echarts';
              }
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'vendor-recharts';
              }
              if (id.includes('codemirror') || id.includes('@codemirror') || id.includes('@lezer')) {
                return 'vendor-codemirror';
              }
              if (id.includes('katex')) {
                return 'vendor-katex';
              }
              if (id.includes('mermaid') || id.includes('cytoscape') || id.includes('dagre')) {
                return 'vendor-diagrams';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-lucide';
              }
            }
          }
        }
      }
    },
    server: {
      port: 43127,
      strictPort: true,
      proxy: localMode ? undefined : {
        '/api': {
          target: process.env.ODOC_API_PROXY || 'http://localhost:11800',
          changeOrigin: true
        },
        '/media': {
          target: process.env.ODOC_API_PROXY || 'http://localhost:11800',
          changeOrigin: true
        }
      }
    }
  }
});
