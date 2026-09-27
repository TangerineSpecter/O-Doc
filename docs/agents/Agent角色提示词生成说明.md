# Agent 角色提示词生成

创建或编辑 Agent 时，在提示词旁点击「生成角色提示词」。已有作品角色填写姓名、出处；原创角色填写姓名、简短设定。补充要求可以指定剧情阶段、MBTI 倾向或相处方式。

生成使用当前选择的对话模型，未选择时使用系统默认对话模型。勾选「参考当前头像」后，先用系统默认图像识别模型读取有访问权限的本地头像资源；头像只辅助外观描述，不用于确定角色身份。识图不可用时继续文字生成，预览提示本次未参考头像。已有角色依据模型知识生成，不联网核对；人物不明确时要求补充资料。

输出固定包含姓名、身份、外形、性格、人格倾向、喜好与生活感、与对方的相处方式、说话方式、表情符号。MBTI 是创作倾向，不代表官方设定。不生成「语气参考」「角色表达原则」：通用角色对话约束由公共系统提示词提供。

生成结果先预览，可修改或重新生成。「应用到提示词」只更新弹窗草稿，可撤销；点击「保存 Agent」才保存。关闭生成面板、关闭弹窗或修改生成资料时，取消前端等待并丢弃旧结果；已发出的后端模型调用可能仍会完成，但不能覆盖新草稿。

## 接口

两个接口都要求登录，使用项目现有 `code/msg/data` 响应格式。参数和返回字段在前端使用驼峰命名，由已有 DRF 转换层处理。

- `POST /api/settings/agents/describe-avatar/`：输入 `avatar`；返回 `description`、`avatarUsed`、`warning`。供界面独立展示识图阶段。
- `POST /api/settings/agents/generate-prompt/`：输入 `characterType`（`existing` / `original`）、`characterName`、`source`、`description`、`requirements`、`modelId`、`avatar`、`referenceAvatar`、可选 `avatarDescription`。前端先识图后，把描述作为素材发送并关闭重复识图；直接调用时也可设置 `referenceAvatar=true` 完成完整流程。
- 返回 `status`（`ready` / `needs_information`）、`prompt`、`question`、`avatarUsed`、`warning`。只有完整的角色卡才返回 `ready`；资料不足返回补充问题；请求校验失败为 HTTP 400，提供商失败或输出不完整为 HTTP 502。

头像识别调用使用现有 55 秒超时；文本生成复用 120 秒总时限的完成能力。前端分别配置 65 秒和 185 秒请求超时。不会访问任意远程头像 URL。

## 数据同步

角色类型、出处、补充设定、识图描述、生成预览和撤销记录均为本次编辑的临时数据，不新增数据库字段，也无需 WebDAV 同步。应用并保存后的提示词仍写入现有 `Agent.prompt`，沿用现有 Agent 同步机制。

## 验证

- 后端：`.venv/bin/python manage.py test system_settings.test_agent_prompt_generation system_settings.test_agent_prompts`。模型、权限查询和外部服务均模拟；图片测试使用临时目录，不访问真实数据库或媒体。
- 前端：Node.js 22 下执行 `npm run type-check`、`npm run build`。
- 浏览器：`scripts/test-agent-prompt-browser.cjs`，通过 `ODOC_PLAYWRIGHT_MODULE`、`ODOC_CHROMIUM`、`ODOC_AGENT_TEST_URL` 指定本机运行环境。所有业务接口都拦截为隔离测试数据，覆盖桌面与手机布局、识图降级、预览修改、应用撤销、资料补充、过期请求和保存。

自动化验证确认请求链路与交互行为，不代表实际提供商的角色知识、识图质量或最终生成文本已经人工验收。
