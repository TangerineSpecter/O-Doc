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
      // 新增：排版插件配置
      typography: (theme) => ({
        DEFAULT: {
          css: {
            // 1. 调整正文颜色（柔和一点）
            color: theme('colors.slate.700'), 
            
            // 2. 优化中文字体行高 (1.75 倍比较适合阅读)
            lineHeight: '1.8',
            
            // 3. 调整最大宽度 (不要让文字撑满整个 4k 屏幕)
            maxWidth: '65ch', 

            // 4. 链接样式
            a: {
              color: theme('colors.sky.500'),
              textDecoration: 'none',
              borderBottom: '1px solid transparent',
              transition: 'all 0.2s',
              '&:hover': {
                color: theme('colors.orange.700'),
                borderBottomColor: theme('colors.orange.700'),
              },
            },

            // 5. 标题样式优化
            'h1, h2, h3, h4': {
              color: theme('colors.slate.900'),
              fontWeight: '700',
              letterSpacing: '-0.025em', // 稍微紧凑一点，更现代
            },
            h1: { 
                marginTop: '2em',
                marginBottom: '1em',
                fontSize: '2.25em',
            },
            h2: {
                marginTop: '1.5em',
                marginBottom: '0.8em',
                paddingBottom: '0.3em',
                borderBottom: '1px solid ' + theme('colors.slate.100'), // 像 GitHub 那样给 h2 加下划线
            },

            // 6. 引用块优化 (Notion 风格)
            blockquote: {
              fontWeight: '400',
              fontStyle: 'normal',
              color: theme('colors.slate.600'),
              borderLeftWidth: '4px',
              borderLeftColor: theme('colors.orange.400'),
              backgroundColor: theme('colors.orange.50'),
              padding: '0.5rem 1rem',
              borderRadius: '0.25rem',
              quotes: 'none', // 去掉默认的引号
            },

            // 7. 列表优化
            'ul > li::marker': {
              color: theme('colors.slate.400'),
            },
            
            // 8. 行内代码优化 (这种短短的 code)
            code: {
              color: theme('colors.pink.600'),
              backgroundColor: theme('colors.slate.100'),
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '500',
              fontFamily: theme('fontFamily.mono'),
            },
            // 去掉反引号
            'code::before': { content: '""' },
            'code::after': { content: '""' },
          },
        },
        // 针对 lg 尺寸的微调 (Article.tsx 用了 prose-lg)
        lg: {
          css: {
            fontSize: '1.125rem', // 18px，适合沉浸式阅读
            lineHeight: '1.8',
            h1: { fontSize: '2.5em' },
            h2: { fontSize: '1.75em' },
          }
        }
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}