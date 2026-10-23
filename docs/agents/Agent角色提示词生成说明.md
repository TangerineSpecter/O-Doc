# Agent 角色整理与生成（1.2.12）

创建或编辑 Agent 时，主入口为“整理角色设定”，依据当前姓名、原提示词和已填写模块归类、去重，不联网检索，不扩写人物。预览可以修改年龄、可选 MBTI、五个角色模块以及剩余补充提示词；确认应用同时更新表单，支持撤销，保存 Agent 后才持久化。冲突和无法归类的内容留在补充提示词，并提示人工处理。

“从零生成角色”作为次要入口保留。已有作品角色填写姓名、出处，原创角色填写简短设定，可选参考头像及 Tavily 检索。生成使用当前对话模型或系统默认模型；头像只帮助外观描述，识图失败继续文字生成。生成后直接进入同一结构化预览，可修改并确认应用，不重复调用整理模型，也不直接覆盖已保存 Agent。MBTI允许空，取消固定长度与每章必须填满的要求。

## 接口

均要求登录，使用现有`code/msg/data`，前端驼峰由DRF转换。

- `POST /api/settings/agents/organize-role/`：输入`name`、`prompt`、`roleProfile`、`modelId`；返回`roleProfile`、剩余`prompt`与`warnings`。不写数据库，不自动采用冲突内容。
- `POST /api/settings/agents/describe-avatar/`：输入`avatar`；返回`description`、`avatarUsed`、`warning`。不访问任意远程头像URL。
- `POST /api/settings/agents/generate-prompt/`：保留已有生成参数及`ready/needs_information`状态，新增`roleProfile`，保留Markdown `prompt`供旧接口兼容及编辑预览。资料不足仍返回问题，失败不改变原设定。

整理请求最多180秒；原文本生成继续使用已有完成能力。修改编辑资料、关闭弹窗或取消等待时丢弃旧响应。后端已发出的请求可能完成，但不会写Agent或覆盖新表单。

## 同步与验证

`role_profile`、姓名及补充`prompt`随Agent同步；生成素材、预览和撤销记录仅是临时编辑状态。详见[角色设定与决策路由](./Agent角色设定与决策路由说明.md)。

后端验证角色字段、兼容、整理及生成输出；浏览器使用`frontend_react/scripts/test-agent-role-browser.cjs`，所有API模拟，覆盖宽窄屏、整理预览修改、确认、撤销、取消、过期响应、从零生成和保存字段。环境变量`ODOC_PLAYWRIGHT_MODULE`、`ODOC_CHROMIUM`、`ODOC_AGENT_TEST_URL`指定浏览器测试环境。模拟验收不代表真实供应商的角色知识或最终文本质量已获人工确认。
