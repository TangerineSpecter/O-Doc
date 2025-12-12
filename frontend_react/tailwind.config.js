/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 自定义 sans 字体栈
        sans: [
          'MyCustomFont',
          'MiSans',
          'Noto Sans SC',
          'LXGW WenKai GB Screen',
          '"Noto Sans SC"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'ui-sans-serif',
          'system-ui',
          'sans-serif'
        ],
        // 自定义 mono 代码字体
        mono: [
          '"JetBrains Mono"',
          'Nunito',
          '"Fira Code"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace'
        ],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}