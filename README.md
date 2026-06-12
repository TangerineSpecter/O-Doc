# 小橘文档 (O-Doc) 🍊

[![版本](https://img.shields.io/badge/version-0.8.11-blue.svg)](https://github.com/your-username/o-doc)
[![Django](https://img.shields.io/badge/Django-5.x-092e20.svg?logo=django)](https://www.djangoproject.com/)
[![React](https://img.shields.io/badge/React-19.x-61dafb.svg?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.x-646cff.svg?logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.x-06b6d4.svg?logo=tailwindcss)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1.svg?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-26.0+-2496ed.svg?logo=docker)](https://www.docker.com/)
[![许可证](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](frontend_react/LICENSE)

一个现代化的AI知识管理与文档展示平台，基于 Django 5 + React + Vite + Tailwind CSS 构建的一体化项目，专为团队知识记录、文档管理和信息共享而设计，支持 AI 智能助手和RAG知识库。

## 📸 软件界面

> 首页展示
<div align="center">
  <img src="frontend_react/src/doc/image.png" alt="小橘文档界面预览" width="80%" />
  <p><em>小橘文档 - 现代化知识管理界面</em></p>
</div>

> 文集目录
<div align="center">
  <img src="frontend_react/src/doc/image-1.png" alt="小橘文档界面预览" width="80%" />
  <p><em>小橘文档 - 现代化知识管理界面</em></p>
</div>

> 文章详情展示
<div align="center">
  <img src="frontend_react/src/doc/image-2.png" alt="小橘文档界面预览" width="80%" />
  <p><em>小橘文档 - 现代化知识管理界面</em></p>
</div>

## 🌟 项目特色

- **📚 知识记录** - 系统化的文集与文档分类管理，支持 Markdown 丰富排版与高亮引用块
- **📝 闪念备忘 (Memos)** - 碎片化想法快速记录卡片墙，支持随机漫步激发灵感，并通过交互式关系图谱直观呈现知识关联
- **🎨 自由白板 (Whiteboard)** - 提供无限画布的图形化思考工具，支持自由拖拽、创建便签节点与线条连接
- **🤖 智能 AI 助手 (Agent)** - 支持接入多种 AI 模型，具备对话记忆与定制技能；可绑定飞书机器人，或执行周期定时任务与外部通知
- **🔌 扩展工具支持 (MCP)** - 支持 Model Context Protocol，可自由挂载本地与网络扩展工具，打破大模型现实交互边界
- **🧠 智能文档问答 (RAG)** - 支持基于本地文档生成问答知识库，支持后台定时自动同步最新文档向量
- **🗺️ 智能图片文集** - 自动识别上传图片的 EXIF 信息（相机、焦段、GPS 等），并在交互式世界/中国地图上直观展示足迹
- **📈 深度创作统计** - 提供多维度统计图表、Top 5 热门榜单以及年度创作热力图，深度分析内容资产与阅读行为
- **🔄 轻松云端同步** - 完善的 WebDAV 自动同步与并发备份，具备快照防覆盖机制，确保数据安全
- **⚙️ 灵活系统配置** - 包含 AI 提供商、MCP 扩展工具、智能体技能以及系统运行状态监控的一站式后台管理

## 🛠 技术栈

### 后端框架
- **Django 5** - 高性能 Python Web 框架，提供完整的后端功能
- **PostgreSQL 16** - 生产部署数据库，便于远程管理、备份和扩展
- **SQLite 3** - 本地开发默认数据库，无需额外服务
- **Django REST Framework** - 构建 RESTful API 的强大工具

### 前端框架
- **React 19** - 最新的 React 版本，提供卓越的开发体验
- **TypeScript** - 静态类型检查，提升代码质量与开发效率
- **Vite** - 下一代前端构建工具，极速的开发服务器

### 样式与UI
- **Tailwind CSS** - 实用优先的 CSS 框架，快速构建现代化界面
- **Tailwind Merge** - 智能合并 Tailwind CSS 类名
- **Class Variance Authority** - 用于构建变体组件的工具
- **Lucide React** - 美观的图标库，提供丰富的图标选择

### 文档处理
- **React Markdown** - 强大的 Markdown 渲染库
- **Mermaid** - 支持多种图表类型的可视化库
- **KaTeX** - 高性能的数学公式渲染引擎
- **React Syntax Highlighter** - 代码高亮显示组件
- **Rehype Raw** - 支持在 Markdown 中使用原始 HTML
- **Remark GFM** - 支持 GitHub Flavored Markdown

### 路由与导航
- **React Router DOM 7** - 声明式的路由管理库

### 数据处理与可视化
- **Axios** - 强大的 HTTP 客户端，用于 API 请求
- **Day.js** - 轻量级的日期时间处理库
- **Recharts** - 基于 React 的图表库，用于数据可视化

### RAG知识库
- **ChromaDB** - 本地向量数据库，用于存储和检索文档向量
- **Sentence Transformers** - 文本向量化模型，用于生成文档嵌入

### 🔌 外部集成与协议
- **Model Context Protocol (MCP)** - 开放工具协议，使 AI 可调用本地/网络服务与工具
- **Lark OAPI SDK** - 飞书 SDK，实现与飞书开放平台的双向长连接通信与事件订阅
- **ECharts** - 可视化库，用于渲染交互式地理位置地图、闪念知识关系图谱及趋势图表

### 开发工具
- **ESLint** - 代码质量检查与格式化
- **PostCSS** - CSS 后处理工具链
- **Autoprefixer** - 自动添加 CSS 浏览器前缀
- **TypeScript ESLint** - TypeScript 代码质量检查
- **Docker** - 容器化部署工具

### 构建与部署
- **一体化项目结构** - Django 后端与 React 前端统一管理
- **静态资源自动处理** - 前端构建产物自动集成到 Django 静态目录

## 📚 相关文档

项目的详细结构信息请参考独立文档：
- **[项目结构文档](docs/项目结构文档.md)** - 完整的项目结构说明
- **[接口文档](docs/接口文档.md)** - 详细的 API 接口说明
- **[前端代码规范文档](docs/前端代码规范文档.md)** - 前端 React + TypeScript 代码规范
- **[后端代码规范文档](docs/后端代码规范文档.md)** - 后端 Django + DRF 代码规范

## 🚀 快速开始

### 环境要求
- Python 3.11+
- Node.js 22.12+
- npm 或 yarn 包管理器
- Docker 与 Docker Compose（部署时需要）

### 开发环境

#### 安装依赖

```bash
# 安装后端依赖
pip install -r requirements.txt

# 安装前端依赖
cd frontend_react && npm install && cd ..
```

#### 启动开发环境

```bash
./dev.sh
```

脚本会自动检查并安装所有依赖，同时启动后端和前端服务。

- 后端服务：http://localhost:11800
- 前端服务：http://localhost:5173

日常前端开发请访问 `http://localhost:5173`。`http://localhost:11800` 是 Django 后端入口，只会加载已经构建并复制到 `templates/`、`static/` 的前端产物；`./dev.sh` 不会自动执行前端 build。

前端 Mock 数据默认关闭，会通过 Vite 代理访问真实后端接口。如需启用 Mock 演示数据，可执行：

```bash
VITE_ENABLE_MOCKS=true ./dev.sh
```

更完整的开发、构建和部署流程请查看 [部署与更新指南](docs/部署与更新指南.md)。

按 `Ctrl+C` 可停止所有服务。

### 代码检查
```bash
cd frontend_react
npm run lint
cd ..
```

### 部署安装

推荐使用一键安装脚本完成安装、更新和卸载。

#### 使用方式

Linux / macOS:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/TangerineSpecter/O-Doc/master/manager.sh)"
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/TangerineSpecter/O-Doc/master/manager.ps1 | iex
```

脚本会自动完成部署目录准备、配置生成和镜像拉取。
默认从 GitHub Container Registry 官方镜像拉取。需要使用腾讯云 TCR 公开镜像 `ccr.ccs.tencentyun.com/tangerine_specter/o-doc:latest` 时，可在脚本菜单中选择“切换镜像源”，或执行 `./manager.sh source tcr`。
运行后按提示选择对应操作即可：

- `安装`
- `更新`
- `卸载`

如果你需要从本机或国内服务器主动构建并推送腾讯云 TCR 镜像，可执行：

```bash
./scripts/push-tcr.sh
```

脚本会优先读取 `TCR_USERNAME`、`TCR_PASSWORD`、`TCR_IMAGE` 等环境变量；未配置时会交互输入，并可选择保存到本机 `.env.tcr.local`。该文件已被 Git 忽略，不会提交到仓库。

安装时如果你没有输入 `DJANGO_SECRET_KEY`，脚本会自动生成；`DJANGO_ALLOWED_HOSTS` 默认使用宽松配置，适合大多数个人部署场景。

部署与维护的详细说明请查看 [部署与更新指南](docs/部署与更新指南.md)。

## ✨ 核心功能

### 📚 文档管理
- 卡片式文档布局，支持自定义图标、标题、描述与数量统计
- Markdown 编辑器，支持高亮引用块（Callouts）、气泡菜单与斜杠菜单快捷组件
- 文档大纲自动生成，文章详情与大纲目录双向联动
- 文档置顶功能，响应式网格布局自适应各种尺寸
- 支持文章一键导出 PDF 格式
### 📝 闪念备忘 (Memos)
- **卡片式记录墙**：随时记录零碎的想法，支持自由换色、快速置顶、卡片流展示以及调整显示密度
- **智能知识关系图谱**：自动将闪念备忘关联为知识图谱，通过交互式图谱直观探索并寻找灵感
- **灵感随机漫步**：支持从现存的闪念卡片中以平滑动画随机抽取单张卡片进行单独聚焦阅读，有助于打破旧思路
- **闪念作者与标签**：可以记录作者、关联多标签，支持快速过滤和标签检索

### 🎨 自由白板 (Whiteboard)
- **图形化思考工具**：提供无限画布白板，支持创建、拖拽和任意缩放的便签节点，适合梳理复杂关系与头脑风暴
- **手绘线条与节点连接**：支持在便签节点之间绘制实用的连接线，帮助建立直观的脑图与逻辑链条
- **白板大纲与管理**：拥有清晰的侧边栏与工具栏，可以方便地检索和管理所有白板项目

### 🤖 智能 Agent 与后台任务
- **多智能体管理**：可在后台创建与管理多个 AI 助手，分别绑定不同的模型、系统级提示词、特定的外部扩展工具与专属技能
- **飞书机器人集成**：支持配置飞书凭证，通过 WebSocket 长连接将 AI 助手接入飞书，具备群聊单聊交互、处理中表情反馈（Typing）及新对话指令 `/new`
- **Agent 会话记忆**：支持对话上下文隔离，并能自动从高频对话中归纳高价值短期记忆，自动/手动晋升为可编辑的长期记忆
- **AI 技能 (Skills) 管理**：支持自定义或使用系统内置技能（可配置名称、版本与提示词指令），可分配给特定的 Agent 默认装载，增强 Agent 执行特定领域任务的能力
- **定时与触发任务调度**：
  - *多种触发方式*：支持 `定时任务`、`手动立即执行`、`编辑器触发` 或 `Memos 触发`
  - *灵活的周期调度*：支持 `每天`、`每周`、`每月` 或 `自定义分钟间隔` 周期运行任务
  - *执行结果输出*：AI 任务运行后可以将结果直接写入到 `指定文集` 生成文章，或者生成 `Memos 闪念卡片`
  - *通知推送与执行追踪*：任务执行完成后，支持配置 Webhook 推送到飞书等外部通知渠道，并可跟踪查看任务步骤执行记录与成功/失败状态
- **AI 思考过程展示**：支持 DeepSeek 等模型的 `<think>` 标签，可视化呈现 AI 逻辑思考链条
- **模型一键连通测试**：支持管理多种 AI 服务提供商，并在管理后台一键测试指定模型的连接状态，极大方便了调试

### 🔌 外部扩展工具 (MCP)
- **Model Context Protocol (MCP) 管理**：
  - *系统外部接口 (System MCP)*：支持一键开启外部系统调用接口，支持写入 Memos、管理文章和文集，并能生成/刷新 `Bearer apiKey` 密钥进行安全校验
  - *本地 Stdio 命令扫描*：支持一键扫描并启动本地通过命令运行的 MCP 服务
  - *外部网络连接 (SSE/streamableHttp)*：支持配置外部的 SSE 等服务接口，并支持自定义 Headers 认证
- **工具 (Tools) 级精细控制**：可视化展示每个 MCP 包含的所有工具，支持一键刷新同步，并可手动启用或禁用单个工具
- **AI 对话集成**：支持在后台管理是否将该 MCP 工具集直接提供给全局 AI 对话装载

### 🧠 智能知识库
- **文档智能检索**：基于您录入的文档，实现高精度的知识问答
- **文档定时同步**：系统能自动定时同步新导入的文章到知识库中，且在同步完成后发送系统通知
- **云端数据备份**：支持 WebDAV 备份与同步，确保数据不丢失

### 🗺️ 图片文集 (Image Gallery)
- **EXIF 数据自动提取**：上传图片时自动解析 EXIF 信息（如拍摄日期、相机、镜头、焦距、光圈、ISO 以及 GPS 位置等）
- **多维度地图统计**：根据 GPS 坐标，生成交互式的世界地图、中国省市级行政区划地图，支持按国家/城市折叠、过滤和定位拍摄轨迹
- **焦段与色调分析**：提供焦段直方图分布图表，自动提取图片主色调，支持通过镜头焦段与图片颜色进行多维度组合筛选
- **AI 标签与描述推荐**：结合 AI 助手，一键为图片生成贴切的文字描述与标签推荐

### 📊 创作数据统计
- **多核心指标看板**：直观统计文章总数、累计字数、资源文件数与阅读总时长
- **年度创作热力图**：直观统计选定年份内每天的创作量（包括文章、图片、闪念与白板的合并统计及分别对比统计）
- **创作行为分析图表**：提供历史发文星期的柱状图、24小时阅读/访问次数与时长的趋势折线图，直观了解发文与阅读习惯
- **热门内容及榜单**：展示全站文章的访问量 TOP 5 和阅读时间 TOP 5 深度榜单，展示热门标签分布和分类内容占比饼图

### 🔍 搜索与筛选
- 智能全局搜索弹窗，支持全局快捷键 (⌘K) 极速调用
- 灵活分类筛选、标签匹配过滤、以及多维度排序方式

### 🔒 用户与安全
- 用户资料管理与安全中心（密码修改与安全中心校验）
- 细粒度用户角色及文集/标签权限控制逻辑

## 🎯 使用场景

- **团队知识库** - 构建团队内部的知识管理系统
- **产品文档** - 展示产品功能和使用说明
- **技术文档** - 管理API文档、开发指南等
- **学习笔记** - 个人或团队的学习资料整理

## 🔧 配置说明

### 后端配置 (Django)
- **数据库**：本地默认 SQLite；Docker Compose 生产部署默认 PostgreSQL，配置在 `o_doc/settings.py` 中
- **静态资源**：前端构建产物自动配置到 `/static/` 路径
- **模板**：前端入口文件配置在 `templates/index.html`
- **AI 配置**：系统设置模块管理 AI 提供商和模型配置

### 前端配置 (React + Vite)
- **构建配置**：`vite.config.ts` 中设置了静态资源基础路径为 `/static/`
- **Tailwind CSS**：配置文件 `tailwind.config.ts` 已预设常用配置
- **生产构建**：Docker 多阶段构建会自动编译前端并集成到 Django

### Docker 配置
- **Dockerfile**：通过多阶段构建自动编译前端并打包后端
- **Compose 文件**：`compose.prod.yml` 负责生产环境容器和数据目录映射
- **部署脚本**：`scripts/deploy.sh` 提供安装、更新、卸载的交互入口

## 📦 部署方式

### 本地部署
```bash
# 安装依赖
pip install -r requirements.txt
cd frontend_react
npm install

# 初始化数据库并启动服务
cd ..
python manage.py migrate
python manage.py runserver
```

### 环境变量配置
可在 `o_doc/settings.py` 中配置以下环境变量：
- `AI_DEFAULT_PROVIDER` - 默认 AI 提供商
- `AI_DEFAULT_MODEL` - 默认 AI 模型
- `OPENAI_API_KEY` - OpenAI API 密钥（可选）

### Docker 容器部署
```bash
# 1. 准备配置
mkdir -p deploy
cp .env.deploy.example deploy/.env

# 2. 修改部署配置
vim deploy/.env

# 3. 启动部署脚本
./scripts/deploy.sh

# 4. 在菜单中选择“安装”
```

如果是直接运行 `manager.sh` 的独立部署目录，`.env` 放在 `compose.prod.yml` 同级即可。

### 更新项目
```bash
# 拉取最新部署脚本和配置文件（仅当仓库内部署文件有变动时需要）
git pull

# 更新到最新镜像
./scripts/deploy.sh update
```

## 📊 数据库说明
- 本地开发默认使用 SQLite，数据文件为项目根目录的 `db.sqlite3`
- Docker Compose 生产部署默认使用 PostgreSQL，数据持久化在部署目录的 `runtime/postgres`
- PostgreSQL 端口默认绑定到 `0.0.0.0:15432`，局域网内可用部署机器 IP 通过 Navicat 连接

## 📱 浏览器兼容性

- Chrome (推荐)
- Firefox
- Safari
- Edge

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request 来改进项目！

## 📄 许可证

Apache License 2.0 - 详见 [LICENSE](frontend_react/LICENSE) 文件

---

**小橘文档** - 让知识管理更简单、更高效！ 🍊
**项目地址** - [点击跳转](https://github.com/TangerineSpecter/O-Doc)
