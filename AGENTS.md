# 本地运行环境
本项目使用 `nvm` 管理 Node 版本，前端默认运行环境为 Node.js 22。后端采用`uv`管理依赖，python版本为3.11。

# 项目结构指引
修改前端代码前，请先查阅 `docs/项目结构文档.md` 熟悉现有模块整体布局；如需定位具体代码实现，可使用 `rg` 检索工具查找。

# 后端注意事项
- 数据同步逻辑参考：`docs/数据同步逻辑文档.md`

前端核心模块对应文件路径：
- AI 对话窗口：`frontend_react/src/components/AIChatWindow.tsx`
- 编辑器页面外层容器：`frontend_react/src/views/EditorPage.tsx`
- 编辑器状态与操作指令：`frontend_react/src/hooks/useEditor.tsx`
- 通用下拉选择组件：`frontend_react/src/components/common/Select.tsx`
- UI 视觉规范：`docs/UI设计规范文档.md`

# 注意事项
- 系统中有WebDev的同步逻辑，如果新增数据和字段，需确认是否在WebDev中同步管理，确保数据有被同步。