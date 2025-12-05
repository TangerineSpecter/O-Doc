import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
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
