# 本地运行环境
本项目使用 `nvm` 管理 Node 版本，前端默认运行环境为 Node.js 22。后端采用`uv`管理依赖，python版本为3.11。

# 项目结构与代码规范指引
修改前端代码前，请先查阅 `docs/项目结构文档.md` 熟悉现有模块整体布局；如需定位具体代码实现，可使用 `rg` 检索工具查找。

所有前后端开发、修复与重构必须遵从 `docs/代码规范文档.md`。不得将页面编排、UI 渲染、状态管理、接口调用和复杂业务逻辑集中写入同一个文件；应按该规范的职责边界拆分为页面/组件、Hook、API、类型、纯逻辑或后端领域模块，并保持清晰的单向依赖。

# 后端注意事项
- 数据同步逻辑参考：`docs/数据同步逻辑说明.md`
- 新增数据字段时，务必需跟用户确认是否需要在WebDev中同步管理，确保数据有被同步，无需同步的字段，需在md 文档中注释说明。

前端核心模块对应文件路径：
- AI 对话窗口：`frontend_react/src/components/AIChatWindow.tsx`
- 编辑器页面外层容器：`frontend_react/src/views/EditorPage.tsx`
- 编辑器状态与操作指令：`frontend_react/src/hooks/useEditor.tsx`
- 通用下拉选择组件：`frontend_react/src/components/common/Select.tsx`
- UI 视觉规范：`docs/UI设计规范文档.md`

# 前端开发规范与红线
- **【严禁原生下拉】全系统严禁直接使用 HTML 原生 `<select>` 标签**。所有表单输入、筛选条、设置面板和弹窗中的下拉框，必须统一使用 `frontend_react/src/components/common/Select.tsx`，模态弹窗（Modal）中应显式配置 `menuPortal={true}` 避免被滚动条截断。
- **【严禁自由改变文本域大小】全系统所有多行文本框（`<textarea>`）严禁支持自由改变大小（`resize: none`）**。禁止在右下角暴露原生拉伸调节滑块，所有输入框必须保持整洁规整的卡片自适应尺寸。
- **【严禁展示内部滚动条】全系统弹窗及内部卡片、多列看板滚动区域严禁展示原生滚动条**。统一使用 `scrollbar-hide`（或 `no-scrollbar`），在保留鼠标滚轮与触屏手势滚动的同时隐藏滚动条；复杂看板必须实行列内/局部独立滚动，严禁外层整体滚动导致顶部操作条被顶出视口。
- **【视觉一致性】**：设置面板与管理列表页面必须严格遵从 `docs/UI设计规范文档.md`，使用白底大圆角卡片（`bg-white rounded-2xl border border-slate-200 p-6 shadow-sm`）、胶囊分段控制器和模态弹窗，严禁散落裸露标题或在列表下方展开破坏布局的内嵌表单。

# 注意事项
- 系统中有WebDev的同步逻辑，如果新增数据和字段，需确认是否在WebDev中同步管理，确保数据有被同步。
