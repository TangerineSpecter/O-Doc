import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { viteMockServe } from 'vite-plugin-mock'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      viteMockServe({
        // mock文件存放的目录
        mockPath: 'src/mock',
        // 开发环境开启mock
        localEnabled: mode === 'development',
        // 生产环境关闭mock
        prodEnabled: false,
        // 自动读取mock文件
        watchFiles: true,
        // 支持ts文件
        supportTs: true
      })
    ],
    // 根据模式动态设置base路径
    // 开发模式或默认模式使用'/'，生产模式使用'/static/'
    base: mode === 'production' ? '/static/' : '/',
    // 保持默认的outDir: 'dist'，让update.sh脚本处理文件复制
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
})
