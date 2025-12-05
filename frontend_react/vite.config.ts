import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // base: '/static/', // 设置静态资源的基础路径为/static/
  // 保持默认的outDir: 'dist'，让update.sh脚本处理文件复制
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
