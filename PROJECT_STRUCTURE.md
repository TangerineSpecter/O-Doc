# 项目结构文档

本文档详细描述了`小橘文档`项目的整体结构和目录组织。

## 📁 项目结构

### 后端结构说明
```
O-Doc/
├── .dockerignore        # Docker 忽略文件
├── .gitignore           # Git 忽略文件
├── API_DOCUMENTATION.md # API 文档
├── Dockerfile           # Docker 构建文件
├── PROJECT_STRUCTURE.md # 项目结构文档
├── README.md            # 项目说明文档
├── o_doc/               # Django 项目目录
│   ├── settings.py      # Django 配置文件
│   ├── urls.py          # URL 路由配置
│   ├── wsgi.py          # WSGI 入口文件
│   └── asgi.py          # ASGI 入口文件
├── ai_assistant/        # AI 助手模块
├── anthology/           # 文集模块
├── article/             # 文章模块
├── assets/              # 资源模块
├── categories/          # 分类模块
├── stats/               # 统计模块
├── system_settings/     # 系统设置模块
├── message/             # 消息模块
├── rag/                 # RAG 模块
├── tags/                # 标签模块
├── user/                # 用户模块
├── utils/               # 工具模块
├── test/                # 测试模块
├── templates/           # Django 模板目录
├── static/              # Django 静态资源目录
├── requirements.txt     # 后端依赖配置
├── manage.py            # Django 管理脚本
├── start.sh             # 项目启动脚本
└── update.sh            # 项目更新脚本
```

### 前端项目结构
```
frontend_react/src/
├── App.tsx              # 主应用组件
├── App.css              # App 组件样式
├── main.tsx             # 应用入口文件
├── index.css            # 全局样式文件
├── vite-env.d.ts        # Vite 环境类型定义
├── assets/              # 静态资源目录
│   ├── fonts/           # 字体文件目录
├── layout/              # 布局组件
│   └── Layout.tsx       # 主布局组件
├── views/               # 页面视图
│   ├── Article.tsx      # 文章详情组件
│   ├── ArticleOutline.tsx # 文章大纲组件
│   ├── CategoriesPage.tsx # 分类管理页面
│   ├── EditorPage.tsx   # 编辑器页面
│   ├── HomePage.tsx     # 首页组件
│   ├── LoginPage.tsx    # 登录页面
│   ├── ResourcesPage.tsx # 资源管理页面
│   ├── SettingsPage.tsx # 设置页面
│   ├── StatisticsPage.tsx # 统计页面
│   ├── TagsPage.tsx     # 标签管理页面
│   └── TodoPage.tsx     # 待办事项页面
├── doc/                 # 文档内容目录
│   ├── image.png        # 示例图片
│   ├── image-1.png      # 示例图片1
│   └── image-2.png      # 示例图片2
├── api/                 # API 调用相关
│   ├── ai.ts            # AI 相关 API
│   ├── anthology.ts     # 文集相关 API
│   ├── article.ts       # 文章相关 API
│   ├── category.ts      # 分类相关 API
│   ├── rag.ts           # RAG 相关 API
│   ├── resources.ts     # 资源相关 API
│   ├── setting.ts       # 设置相关 API
│   ├── stats.ts         # 统计相关 API
│   ├── tag.ts           # 标签相关 API
│   └── user.ts          # 用户相关 API
├── hooks/               # 自定义 Hooks
│   ├── useArticle.ts      # 文章相关 Hook
│   ├── useArticleTree.ts  # 文章树相关 Hook
│   ├── useCategories.ts   # 分类相关 Hook
│   ├── useCollections.ts  # 文集相关 Hook
│   ├── useEditor.tsx      # 编辑器相关 Hook
│   ├── useReadStats.ts    # 阅读统计相关 Hook
│   ├── useSettings.ts     # 设置相关 Hook
│   └── useTags.ts         # 标签相关 Hook
├── components/          # 通用组件
│   ├── AIChatWindow.tsx         # AI 聊天窗口组件
│   ├── AnthologyModal.tsx       # 文集模态框组件
│   ├── CategoryModal.tsx        # 分类创建/编辑模态框
│   ├── TagModal.tsx             # 标签模态框组件
│   ├── FloatingActionMenu.tsx   # 悬浮操作菜单
│   ├── SortableCollectionCard.tsx # 可排序的文集卡片组件
│   ├── Article/                 # 文章相关组件
│   │   ├── MarkdownElements.tsx # Markdown 元素组件
│   │   └── TableOfContents.tsx  # 目录组件
│   ├── Category/                # 分类相关组件
│   │   └── CategoryArticleCard.tsx # 分类文章卡片组件
│   ├── Editor/                  # 编辑器相关组件
│   │   ├── BubbleMenu.tsx       # 气泡菜单组件
│   │   ├── EditorHeader.tsx     # 编辑器头部组件
│   │   ├── EditorMetaBar.tsx    # 编辑器元信息栏
│   │   └── SlashMenu.tsx        # 斜杠菜单组件
│   ├── Outline/                 # 大纲相关组件
│   │   ├── OutlineContent.tsx   # 大纲内容组件
│   │   └── OutlineSidebar.tsx   # 大纲侧边栏组件
│   ├── Settings/                # 设置相关组件
│   │   ├── AISettings.tsx       # AI 设置组件
│   │   ├── GeneralSettings.tsx  # 通用设置组件
│   │   ├── ModelModal.tsx       # 模型配置模态框
│   │   ├── ProviderModal.tsx    # 提供商配置模态框
│   │   └── SyncSettings.tsx     # 同步设置组件
│   ├── Tag/                     # 标签相关组件
│   │   └── TagArticleCard.tsx   # 标签文章卡片组件
│   └── common/                  # 通用基础组件
│       ├── ConfirmationModal.tsx # 确认模态框组件
│       ├── ImageLinkModal.tsx   # 图片链接模态框
│       ├── StarLoader.tsx       # 加载动画组件
│       ├── ToastProvider.tsx    # 提示消息提供者
│       └── VideoLinkModal.tsx   # 视频链接模态框
├── constants/           # 常量定义
│   ├── httpEnum.ts      # HTTP 状态码枚举
│   └── iconList.tsx     # 图标列表
├── mocks/               # Mock 数据配置
│   ├── articleDemoData.ts     # 文章示例数据
│   ├── browser.ts             # Mock 浏览器配置
│   ├── handlers.ts            # Mock 处理函数
│   └── homepageDemoData.json  # 首页示例数据
└── utils/               # 工具函数
    ├── format.ts        # 格式化工具类
    └── request.ts       # 请求工具类
```