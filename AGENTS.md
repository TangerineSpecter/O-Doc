# 本地运行环境
本项目使用 `nvm` 管理 Node 版本，前端默认运行环境为 Node.js 22。

在 `frontend_react` 目录执行命令前，先加载 nvm 并切换至 Node 22 版本：
```sh
source ~/.nvm/nvm.sh
nvm use 22
```

切换好对应 Node 版本后，建议在 `frontend_react` 目录下执行所有前端相关命令。

# 项目结构指引
修改前端代码前，请先查阅 `docs/项目结构文档.md` 熟悉现有模块整体布局；如需定位具体代码实现，可使用 `rg` 检索工具查找。

前端核心模块对应文件路径：
- AI 对话窗口：`frontend_react/src/components/AIChatWindow.tsx`
- 编辑器页面外层容器：`frontend_react/src/views/EditorPage.tsx`
- 编辑器状态与操作指令：`frontend_react/src/hooks/useEditor.tsx`
- 通用下拉选择组件：`frontend_react/src/components/common/Select.tsx`
- UI 视觉规范：`docs/UI设计规范文档.md`

# 注意事项
- 系统中有WebDev的同步逻辑，如果新增数据和字段，需确认是否在WebDev中同步管理，确保数据有被同步。