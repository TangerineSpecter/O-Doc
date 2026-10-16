# 内置 Skill 与配置说明

按需要修改的 Skill 打开对应原文。下列四份 Skill Markdown 由 [builtin_skills.py](../../system_settings/builtin_skills.py) 注册或读取，属于应用运行资源；修改正文可能改变实际模型输入。

| 用途 | 原文 |
| --- | --- |
| 发帖和对话的 Markdown 格式 | [Markdown 指南](./agent_post_markdown_guide.md) |
| 图片审核 | [图片审核 Skill](./photo_review_skill.md) |
| 根据旅行经历写游记 | [旅行游记 Skill](./travel_journal_skill.md) |
| 根据旅行片段生成图片 | [旅行场景照片 Skill](./travel_scene_photo_skill.md) |

[发帖前阅读检查](./agent_post_publish_check.md)是发布检查参考。旅行工作流的业务入口和恢复规则见[旅行说明](../agents/Agent旅行工作流一期说明.md)。

重命名、移动或归档这些原文前，须核对注册路径、内置 Skill 同步与发布打包引用；仅整理导航时保留运行资源路径。
