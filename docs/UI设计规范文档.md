# 小橘文档 UI 设计规范文档

本文档用于约束后续页面与组件生成风格，确保新增 UI 与当前系统的主页、登录页、导航栏、弹窗、文集卡片保持一致。

## 1. 设计定位

小橘文档的视觉关键词：

- **橘子主题**：橘色是品牌主色，用于 Logo、主按钮、激活态、焦点态、关键操作与局部装饰。
- **清爽文档系统**：整体背景轻、卡片白、边框浅，强调内容可读性和管理效率。
- **轻量可爱感**：允许出现橘子、叶子、果肉切片、轻微浮动动画等主题元素，但只作为点缀，不影响工作效率。
- **现代工具感**：组件紧凑、层级清晰，优先使用图标按钮、下拉菜单、弹窗、筛选条、卡片网格等常见后台/文档产品形态。

新增组件应优先像“一个温暖的文档管理工具”，不要做成重营销页、重拟物、深色科技风或大面积高饱和插画风。

## 2. 色彩规范

### 2.1 主色

| 用途 | Tailwind 类 | 说明 |
| --- | --- | --- |
| 主按钮 / 品牌强调 | `orange-500` | 默认主操作色，如新建、保存、登录 |
| 主按钮 hover | `orange-600` | 主按钮悬停态 |
| 主按钮 active | `orange-700` | 主按钮按下态 |
| 浅强调背景 | `orange-50` | 选中态、hover 背景、图标浅底 |
| 强调边框 | `orange-100` / `orange-200` / `orange-500` | 轻量边框用 100/200，选中边框用 500 |
| 焦点环 | `ring-orange-500/20` | 表单输入、可选卡片焦点态 |

常见组合：

```tsx
className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white"
className="bg-orange-50 text-orange-600 border border-orange-200"
className="focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
```

### 2.2 辅助色

| 用途 | Tailwind 类 | 说明 |
| --- | --- | --- |
| 叶子 / 健康状态 / 版本正常 | `lime-500` / `lime-600` / `lime-50` | 橘子叶片、轻量成功感 |
| 信息类 | `blue-50` / `blue-600` | 搜索文章结果、普通信息 |
| 危险操作 | `red-50` / `red-600` / `red-700` | 删除、不可恢复提醒 |
| 多入口悬浮按钮 | `emerald` / `pink` / `sky` / `rose` / `indigo` | 仅用于功能入口区分，不能盖过橘色主品牌 |

### 2.3 中性色

系统大量使用 slate 色系：

- 页面背景：`bg-slate-50`
- 主文本：`text-slate-800` / `text-slate-900`
- 正文与标签：`text-slate-600` / `text-slate-700`
- 次级说明：`text-slate-400` / `text-slate-500`
- 边框：`border-slate-100` / `border-slate-200`
- 弱背景：`bg-slate-50` / `bg-slate-100`

不要使用纯黑作为正文色；优先使用 `slate-900`。

## 3. 字体与排版

### 3.1 字体

全局字体来自 `frontend_react/tailwind.config.js` 与 `frontend_react/src/index.css`：

- 主字体：`MyCustomFont`、`MiSans`、`Noto Sans SC`、`PingFang SC`、`Microsoft YaHei`
- 代码字体：`JetBrains Mono`、`Fira Code`、系统等宽字体

新增 UI 默认使用 `font-sans`，代码、版本号、快捷键使用 `font-mono`。

### 3.2 字号

| 场景 | 推荐类 |
| --- | --- |
| 页面标题 | `text-xl font-bold` 或 `text-2xl font-bold` |
| 弹窗标题 | `text-lg font-bold` |
| 卡片标题 | `text-base font-bold` |
| 表单标签 | `text-sm font-semibold` |
| 正文 / 菜单项 | `text-sm` |
| 辅助说明 | `text-xs` |
| 徽标 / 计数 | `text-[10px]` 或 `text-xs` |

当前系统偏紧凑，除登录页欢迎语外，不要随意使用超大字号。

### 3.3 文本颜色

```tsx
// 标题
className="text-slate-900 font-bold"

// 正文
className="text-slate-700"

// 次级说明
className="text-slate-500 text-xs"

// 品牌强调
className="text-orange-600 font-medium"
```

## 4. 布局规范

### 4.1 页面容器

主内容区使用统一宽度：

```tsx
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
  ...
</main>
```

页面背景默认：

```tsx
className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-orange-100 selection:text-orange-900"
```

### 4.2 顶部导航

导航栏风格：

```tsx
className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200"
```

适用规则：

- 顶部导航保持半透明白底和轻微毛玻璃。
- Logo 左侧，搜索与用户操作右侧。
- 搜索框优先使用胶囊形：`rounded-full bg-slate-100 hover:bg-white hover:ring-2 hover:ring-orange-500/50`。

### 4.3 网格

文集类卡片网格：

```tsx
className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
```

图片瀑布流或资源卡片可使用更灵活网格，但卡片间距建议保持 `gap-4` / `gap-5`。

## 5. 组件规范

### 5.1 卡片

基础卡片风格：

```tsx
className="bg-white rounded-xl border border-slate-200 shadow-sm hover:border-orange-200 hover:shadow-lg transition-all duration-200"
```

规则：

- 常规卡片圆角使用 `rounded-xl`。
- 表单小选项使用 `rounded-lg`。
- 下拉菜单使用 `rounded-lg` 或 `rounded-xl`。
- 卡片边框优先 `border-slate-100` / `border-slate-200`。
- hover 时可轻微转为橘色边框，不要大面积变橘。
- 卡片内部可用 `bg-slate-50/30` 做预览区或分区。

### 5.2 按钮

主按钮：

```tsx
className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95"
```

弹窗主按钮：

```tsx
className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-lg transition-colors shadow-sm flex items-center gap-2"
```

次级按钮：

```tsx
className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
```

图标按钮：

```tsx
className="p-1.5 rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
```

规则：

- 主要操作用橘色实心按钮。
- 次级操作用 slate 文本 + hover 浅底。
- 危险操作用红色，不要用橘色表达删除。
- 图标优先使用 `lucide-react`。
- 按钮内图标尺寸常用 `w-4 h-4`，小按钮用 `w-3.5 h-3.5`。

### 5.3 表单

输入框：

```tsx
className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
```

带图标输入框：

```tsx
<div className="relative rounded-md shadow-sm">
  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
    <Mail className="h-5 w-5 text-slate-400" />
  </div>
  <input className="block w-full pl-10 py-2.5 border-slate-300 rounded-lg focus:ring-orange-500 focus:border-orange-500 sm:text-sm transition-all" />
</div>
```

规则：

- label 使用 `text-sm font-semibold text-slate-700`。
- 字数统计、帮助信息使用 `text-xs text-slate-500`。
- 必填星号使用 `text-red-500`。
- 表单禁用态使用 `opacity-50` 或 `opacity-70 cursor-not-allowed`。

### 5.4 弹窗

遮罩：

```tsx
className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200"
```

背景：

```tsx
className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
```

内容：

```tsx
className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
```

弹窗结构：

- Header：`px-6 py-4 border-b border-slate-100 bg-slate-50/50`
- Body：`p-6 space-y-5 max-h-[70vh] overflow-y-auto`
- Footer：`px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3`

### 5.5 下拉菜单

```tsx
className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
```

菜单项：

```tsx
className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center text-slate-700"
```

规则：

- 选中项右侧使用 `Check` 图标，颜色 `text-orange-500`。
- 创建类入口可用 `text-orange-600 font-medium`。
- 删除类入口使用 `text-red-600 hover:bg-red-50`。

### 5.6 下拉选择器

表单、筛选条、工具栏、设置项中的单选下拉，优先使用 `frontend_react/src/components/common/Select.tsx`，不要直接使用原生 `<select>`。原生 `<select>` 只能在极简临时页面或浏览器默认行为确实必要时使用。

基础用法：

```tsx
<Select
  value={value}
  options={options}
  onChange={setValue}
  placeholder="请选择"
/>
```

工具栏紧凑选择器：

```tsx
<Select
  value={value}
  options={options}
  onChange={setValue}
  buttonClassName="!h-[31px] !min-h-[31px] w-[156px] px-2.5 !py-1 text-xs shadow-none"
  menuClassName="bottom-full right-0 !mt-0 mb-2 w-64 max-h-[min(320px,45vh)] overflow-y-auto z-[120]"
/>
```

规则：

- 下拉选择器必须有明确的选中态，选中项右侧使用 `Check` 图标。
- 菜单列表较长时必须设置 `max-h` 和 `overflow-y-auto`，避免溢出屏幕。
- 位于弹窗底部、聊天输入区、页面底部工具栏时，优先让菜单向上展开，例如 `bottom-full mb-2`。
- 工具栏下拉高度应与相邻按钮一致，常用 `h-[31px]` 或跟随局部按钮高度。
- 菜单层级应高于所在弹窗内容，必要时使用 `z-[120]` 等局部层级。
- 文本过长时使用 `truncate`，不要让按钮宽度被内容撑开。

### 5.7 选项卡 / 可选卡片

```tsx
className={`cursor-pointer p-3 border rounded-lg flex items-center gap-3 transition-all ${
  active
    ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500'
    : 'bg-white border-slate-200 hover:border-slate-300'
}`}
```

选中态图标底：

```tsx
className="p-2 rounded-full bg-orange-100 text-orange-600"
```

未选中图标底：

```tsx
className="p-2 rounded-full bg-slate-100 text-slate-500"
```

### 5.8 徽标与状态

计数徽标：

```tsx
className="bg-slate-50 text-slate-400 text-[10px] font-semibold px-1.5 py-0.5 rounded min-w-[1.5rem] text-center"
```

橘色提醒：

```tsx
className="bg-orange-50 border border-orange-100 text-[10px] font-medium text-orange-600 px-1.5 py-0.5 rounded"
```

置顶 / 危险提示：

```tsx
className="bg-red-50 border border-red-100 text-[10px] font-bold text-red-600 rounded-full"
```

## 6. 橘子主题元素

### 6.1 Logo 与主题符号

当前 Logo 使用橘子圆形 + lime 叶片：

- 橘子主体：`orange-500`
- 枝干深棕：`#9a3412`
- 叶片：`lime-500`
- Logo 容器：`w-9 h-9 rounded-xl bg-orange-50 border border-orange-100/50 shadow`

新页面如需品牌露出，优先复用这一视觉结构。

### 6.2 装饰背景

系统背景可使用轻量渐变与弱装饰：

```tsx
<div className="fixed inset-0 pointer-events-none z-[-1] opacity-40">
  <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-orange-50/50 to-transparent" />
  <div className="absolute right-0 top-20 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl" />
  <div className="absolute left-10 top-40 w-72 h-72 bg-orange-100/30 rounded-full blur-3xl" />
</div>
```

规则：

- 背景装饰必须低透明度、不可干扰内容。
- 可以用橘子切片、叶子、浅橘渐变作为登录页或空状态装饰。
- 常规业务页面不要放太多漂浮装饰，避免影响工具感。

### 6.3 可爱感边界

允许：

- 轻微浮动动画。
- 橘子主题悬浮按钮。
- 叶片、果肉切片、柔和阴影。

避免：

- 大面积卡通插画铺满页面。
- 过多弹跳、旋转、闪烁。
- 高饱和橘色背景承载正文。
- 把所有组件都做成橘色，橘色应承担“强调”而不是“底色”。

## 7. 动效规范

常用动效：

- hover 颜色：`transition-colors`
- hover 阴影：`transition-all duration-200`
- 弹窗入场：`animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200`
- 菜单入场：`animate-in fade-in zoom-in-95 duration-100`
- 小按钮按下：`active:scale-95`
- 图片 hover：`transition-transform duration-300 group-hover:scale-105`

动效原则：

- 快速、轻量、反馈明确。
- 工作流组件不要使用复杂长动画。
- 加载态统一使用橘色 spinner：`border-orange-500 border-t-transparent animate-spin`。

## 8. 图标规范

项目主要使用 `lucide-react`。

常用尺寸：

- 导航图标：`w-5 h-5`
- 菜单 / 按钮图标：`w-4 h-4`
- 小型筛选按钮：`w-3.5 h-3.5`
- 徽标内图标：`w-2.5 h-2.5`

颜色：

- 默认：`text-slate-400` / `text-slate-500`
- hover：`group-hover:text-orange-500`
- 激活：`text-orange-600`
- 危险：`text-red-600`

## 9. 空状态与加载态

空状态：

```tsx
<div className="py-12 flex flex-col items-center justify-center text-slate-400">
  <div className="bg-slate-50 p-4 rounded-full mb-3">
    <Search className="w-6 h-6" />
  </div>
  <p>没有找到符合条件的内容</p>
  <button className="mt-2 text-xs text-orange-500 hover:underline">清除筛选</button>
</div>
```

加载态：

```tsx
<div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm text-xs text-slate-600">
  <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
  <span>正在加载更多...</span>
</div>
```

## 10. 响应式规范

- 页面横向 padding：`px-4 sm:px-6 lg:px-8`
- 主网格：`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- 操作栏：移动端允许 `flex-col`，桌面端用 `sm:flex-row`
- 桌面搜索框可隐藏移动端：`hidden md:flex`
- 移动端使用图标按钮替代完整搜索框：`md:hidden`

所有组件在 320px 宽度下应保持可用，不允许按钮文字溢出。

## 11. 生成新组件时的提示词模板

后续让 AI 生成组件时，可以附加以下约束：

```md
请按照小橘文档现有 UI 风格生成：
- 技术栈为 React + TypeScript + Tailwind CSS，图标使用 lucide-react。
- 整体是浅 slate 背景、白色卡片、浅 slate 边框、橘色主强调、lime 叶片点缀。
- 主按钮使用 bg-orange-500 hover:bg-orange-600 text-white，焦点态使用 orange ring。
- 卡片使用 bg-white rounded-xl border border-slate-200 shadow-sm，hover 时 border-orange-200 hover:shadow-lg。
- 表单使用 rounded-lg、border-slate-200、focus:ring-orange-500/20、focus:border-orange-500。
- 字体和层级保持紧凑，标题 text-lg/text-xl font-bold，说明 text-xs/text-sm text-slate-500。
- 不要做深色科技风、紫蓝渐变风、营销大 hero，也不要大面积橘色背景。
- 组件要有 hover、active、disabled、empty/loading 等必要状态。
```

## 12. 新 UI 自检清单

提交或生成新组件前检查：

- 是否使用橘色作为主强调，而不是整页主背景？
- 是否保留了 `slate` 系中性色的清爽文档感？
- 卡片、弹窗、下拉菜单是否使用了当前系统的圆角、边框、阴影？
- 表单焦点态是否统一为橘色？
- 主按钮、次级按钮、危险按钮是否区分清楚？
- 图标是否来自 `lucide-react`，尺寸是否与当前组件接近？
- 移动端是否不会溢出、重叠或按钮过挤？
- 动效是否轻量，是否没有影响阅读和操作？
- 是否带有必要的 loading、empty、disabled、hover、active 状态？

## 13. 参考文件

当前规范主要参考：

- `frontend_react/src/layout/Layout.tsx`
- `frontend_react/src/layout/Navbar.tsx`
- `frontend_react/src/views/HomePage.tsx`
- `frontend_react/src/views/LoginPage.tsx`
- `frontend_react/src/components/SortableCollectionCard.tsx`
- `frontend_react/src/components/AnthologyModal.tsx`
- `frontend_react/src/components/SearchModal.tsx`
- `frontend_react/src/components/FloatingActionMenu.tsx`
- `frontend_react/tailwind.config.js`
- `frontend_react/src/index.css`
