# 可莉精灵战斗素材生成记录

2026-10-22，使用内置 `image_gen`。人物参考只引用营地精灵图上方两行的可莉身份和像素风格；未引用下方阿尼亚身份。原营地人物素材未覆盖。

## 三套服装、四个动作姿态

保存：`frontend_react/src/assets/combat/sprite-battle/klee-costumes.png`。

生成原件：`/Users/zhouliangjun/.codex/generated_images/01a16155-0b82-7b71-bd3e-33fadbf5da74/exec-25a7ffac-70a9-482d-9e51-e2a3643c7b92.png`。

透明背景：`true`。参考图：`frontend_react/public/previews/camp-world/characters.png`。

```text
Use case: stylized-concept. Production asset: a strict 4-column by 3-row sprite sheet on genuine transparent alpha background. The attached image is ONLY the identity and pixel-style reference for KLEE in its TOP TWO ROWS; ignore Anya entirely. Produce exactly TWELVE full-body Klee sprites, neatly centered in twelve equal-size cells with generous transparent separation and margins. Same cute pale blonde pigtails, pointed ears, red eyes, red clover beret and small symmetric gentle smile across every cell. Compact two-head-tall chibi pixel game character, chunky square pixels and clear color clusters, not a smooth illustration. All figures face RIGHT in a consistent three-quarter side view. Same head size, same leg length and same ground baseline within each cell. No shadows, no labels, no grid lines, no glow, no particles. NO WEAPONS in any cell. Bare hands wearing small brown gloves with closed fists so weapons can be attached later.
ROWS are three ACTUAL DIFFERENT COSTUMES with the SAME Klee head, hair and red beret: ROW 1 classic red Spark Knight clover coat/dress, cream trim, brown backpack, brown boots; ROW 2 elegant sapphire-and-ivory arcane mage coat with gold fasteners, blue short cape and dark boots; ROW 3 black and crimson blade-master short haori over light silver breastplate with gold edging, dark short boots. Keep proportions and identity stable across all rows; change clothing only.
COLUMNS are four MATCHING ACTION POSES repeated for every costume: column 1 neutral combat ready standing, right glove held forward near waist for gripping a vertical staff; column 2 casting anticipation, body crouches slightly with right glove pulled back and lifted near shoulder; column 3 casting release, right forearm reaches forward to the RIGHT at chest height, open space to the right for an independent staff; column 4 sword strike follow-through, legs braced with small rightward lunge, right glove reaching diagonally forward/right at chest height and left glove near body. Different arm poses must be visibly distinct, while head identity and size remain stable. No severed limbs or duplicated hands. This is a sprite atlas, not a poster. Align the twelve cells into EXACTLY four columns and three rows, all full figures entirely contained inside their own cell.
```

## 星月学院试炼回廊

保存：`frontend_react/src/assets/combat/sprite-battle/academy-arena.png`。

生成原件：`/Users/zhouliangjun/.codex/generated_images/01a16155-0b82-7b71-bd3e-33fadbf5da74/exec-3102b3af-6f14-4422-bdc6-6125a03365b1.png`。

透明背景：`false`。

```text
Use case: stylized-concept. Asset type: panoramic background plate for a high-quality horizontal 2D pixel-art battle demo, approximately 2.4:1 landscape. An enchanting abandoned academy training terrace at blue hour: distant layered forest and misty mountain silhouettes, a soft golden crescent moon on the upper right, a few warm lanterns and old stone arch columns at the extreme edges, subtle ivy, sparse magical firefly glints. Deep desaturated ink-blue, teal and muted violet shadows with amber lamps. Strict side-view SIDE ELEVATION for a side-scroller, NOT isometric, NOT top-down. The one single straight horizontal ground surface must be at exactly 78 percent of image height, continuous across the entire image; below it show a thick stone wall cross-section with worn masonry, moss and a few gold engraved flecks. No visible receding ground plane. Keep the central battle space from x=20% to85%, y=30% to78% uncluttered and fairly dark so a bright character and golden sword VFX read clearly in front. Beautiful handcrafted game pixel art with sharp stair-step edges, broad coherent color clusters and layered atmosphere, intentionally low-resolution pixel art, not a photograph or blurry painting. No characters, no weapons, no training dummy, no text, no UI, no logos. Background and ground only.
```

背景生成后的实际地面线约位于图高 69%，不视为自动符合提示词数值。渲染器按实际地面线映射到统一脚底坐标。
