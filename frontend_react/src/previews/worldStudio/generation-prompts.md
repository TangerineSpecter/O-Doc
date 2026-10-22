# 世界工坊素材生成记录

2026-10-22，内置 `image_gen`，原生透明背景。参考图只承担美术风格参考角色，不作为新增路灯的内容来源。

## 萤火路灯

- 项目素材：`frontend_react/public/previews/camp-world/street-lamp.png`
- 风格参考：`frontend_react/public/previews/camp-world/side-objects.png`
- 生成原件：`/Users/zhouliangjun/.codex/generated_images/01a16155-0b82-7b71-bd3e-33fadbf5da74/exec-e0846671-cdd4-4ac9-be92-d39b294163f2.png`
- 接入：读取原生 alpha 边界、等比缩小到 64×128 单帧画布、底边对齐；光晕由渲染器叠加，物理底座与图片分别配置。

完整提示词：

```text
Use case: stylized-concept. Asset type: a single game furniture sprite for a side-scrolling 2D pixel world. Image 1 is a STYLE REFERENCE ONLY: match its warm detailed handcrafted pixel art, muted moss / timber / teal / warm amber palette. Create ONE freestanding woodland street lamp, full object, centered, isolated on a truly transparent background. Strict straight-on orthographic FRONT ELEVATION as in a side-scroller; NO isometric view, NO visible ground plane, NO perspective. The lamp has a small mossy stone foot, a slender dark iron and worn timber upright, a gently curved bracket with a hanging enclosed amber lantern, and a tiny ivy detail at its base. Readable chunky hard-edged square pixels, limited palette, no vector outlines, no smooth painting. Entire upright lamp including base visible with padding, tall narrow object about width:height 1:3, suitable to fit one cell wide and three cells high in a 32px grid after scaling. Warm interior yellow glass but do not bake atmospheric light halos, shadows, ground, text, grid, UI or extra objects into the asset. Preserve the native transparent alpha.
```

生成结果的实际宽高比例约为 1:3，模板以 2×4 格留出灯臂与内边距。不能把提示词里的占格请求视作生成结果已自动满足网格约束的证明；实际裁切、归一和碰撞范围由代码明确配置。
