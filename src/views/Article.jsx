import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';

// --- Global Styles & Fonts ---
const GLOBAL_STYLES = `
  /* Fonts */
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap');

  /* Base */
  html {
    scroll-behavior: smooth;
    scroll-padding-top: 100px; 
  }

  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  }

  /* ---------------------------------------------------------
     Markdown Typography - Enhanced Style
     --------------------------------------------------------- */
  .markdown-body {
    line-height: 1.85;
    font-size: 1rem;
    color: #334155; /* Slate 700 */
  }
  .dark .markdown-body {
    color: #94a3b8; /* Slate 400 */
  }

  /* Headings */
  .markdown-body h2, .markdown-body h3, .markdown-body h4 {
    position: relative;
    margin-top: 2.5em;
    margin-bottom: 1em;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.015em;
    color: #0f172a; /* Slate 900 */
    scroll-margin-top: 100px;
  }
  /* 嵌入模式下的微调 */
  .embedded-mode .markdown-body h2 { margin-top: 1.5em; }

  .dark .markdown-body h2, .dark .markdown-body h3, .dark .markdown-body h4 {
    color: #f8fafc;
  }

  .markdown-body h2 {
    font-size: 1.65em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #f1f5f9;
  }
  .dark .markdown-body h2 { border-color: #1e293b; }

  .markdown-body h3 {
    font-size: 1.35em;
    font-weight: 600;
  }

  .markdown-body p { margin-bottom: 1.6em; text-align: justify; }

  /* Links */
  .markdown-body a {
    color: #0ea5e9; /* Sky 500 */
    text-decoration: none;
    font-weight: 600;
    border-bottom: 1px solid transparent;
    transition: all 0.2s;
  }
  .markdown-body a:hover {
    color: #0284c7;
    border-bottom-color: #0284c7;
  }
  .dark .markdown-body a { color: #38bdf8; }

  /* Blockquote */
  .markdown-body blockquote {
    position: relative;
    margin: 2rem 0;
    padding: 1.25rem 1.5rem;
    border-left: 4px solid #8b5cf6;
    background: linear-gradient(to right, #f5f3ff, rgba(255,255,255,0));
    border-radius: 0 0.5rem 0.5rem 0;
    color: #4c1d95;
    font-style: italic;
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .dark .markdown-body blockquote {
    background: linear-gradient(to right, rgba(139, 92, 246, 0.1), transparent);
    border-left-color: #a78bfa;
    color: #ddd6fe;
  }
  .markdown-body blockquote::after {
    content: "”";
    position: absolute;
    top: 0;
    right: 1rem;
    font-size: 4rem;
    line-height: 1;
    color: rgba(139, 92, 246, 0.1);
    font-family: serif;
    pointer-events: none;
  }

  /* Lists */
  .markdown-body ul, .markdown-body ol {
    padding-left: 1.5em;
    margin-bottom: 1.5em;
  }
  .markdown-body li {
    margin-bottom: 0.4em;
    padding-left: 0.25em;
  }
  .markdown-body ul li::marker { color: #94a3b8; }

  /* Images */
  .markdown-body img {
    display: block;
    margin: 2.5rem auto;
    max-width: 100%;
    border-radius: 0.75rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    transition: transform 0.3s ease;
  }
  .markdown-body img:hover {
    transform: scale(1.01);
  }
  .dark .markdown-body img {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
    opacity: 0.9;
  }
  .dark .markdown-body img:hover {
    opacity: 1;
  }

  /* Code Blocks */
  .code-block-wrapper {
    margin: 1.5rem 0;
    border-radius: 0.75rem;
    overflow: hidden;
    background: #1e293b;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    border: 1px solid #334155;
  }
  
  .code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: #0f172a;
    border-bottom: 1px solid #334155;
  }
  
  .code-lang {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: #94a3b8;
    font-weight: 600;
    text-transform: uppercase;
  }

  /* Prism Overrides */
  pre[class*="language-"] {
    margin: 0 !important;
    padding: 1.25rem !important;
    background: transparent !important;
    text-shadow: none !important;
  }
  code[class*="language-"], pre[class*="language-"] {
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.9em !important;
    line-height: 1.6 !important;
  }
  
  /* Inline Code */
  :not(pre) > code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85em;
    font-weight: 600;
    padding: 0.2rem 0.375rem;
    margin: 0 0.1rem;
    border-radius: 0.375rem;
    background-color: #fdf2f8; /* Pink 50 */
    color: #db2777; /* Pink 600 */
    border: 1px solid #fbcfe8; /* Pink 200 */
  }
  .dark :not(pre) > code {
    background-color: rgba(219, 39, 119, 0.15);
    color: #f472b6;
    border-color: rgba(219, 39, 119, 0.3);
  }

  /* Tables */
  .table-wrapper {
    overflow-x: auto;
    border-radius: 0.5rem;
    border: 1px solid #e2e8f0;
    margin-bottom: 2em;
    background: white;
  }
  .dark .table-wrapper { border-color: #334155; background: transparent; }
  .markdown-body table { width: 100%; border-collapse: collapse; }
  .markdown-body th {
    background-color: #f8fafc;
    font-weight: 600;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    color: #475569;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }
  .dark .markdown-body th { background-color: #1e293b; color: #cbd5e1; border-color: #334155; }
  .markdown-body td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e2e8f0;
    font-size: 0.875rem;
    color: #334155;
  }
  .dark .markdown-body td { border-color: #334155; color: #94a3b8; }
  .markdown-body tr:last-child td { border-bottom: none; }
  .markdown-body tr:hover td { background-color: #f8fafc; }
  .dark .markdown-body tr:hover td { background-color: #1e293b; }

  /* Custom Tag Style */
  .md-tag-inline {
    display: inline-flex;
    align-items: center;
    padding: 0 0.4em;
    margin: 0 0.2em;
    border-radius: 0.25rem;
    font-size: 0.85em;
    font-weight: 500;
    color: #4f46e5;
    background-color: #eef2ff;
    border: 1px solid #e0e7ff;
    cursor: default;
    transition: all 0.2s;
  }
  .md-tag-inline:hover {
    background-color: #e0e7ff;
    color: #4338ca;
  }
  .dark .md-tag-inline { 
    color: #818cf8; 
    background-color: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.3);
  }

  /* Custom Syntax Styles */
  .custom-underline-red {
    text-decoration: underline;
    text-decoration-color: #ef4444; 
    text-decoration-thickness: 2px;
    text-underline-offset: 4px;
    text-decoration-skip-ink: none;
  }
  .custom-underline-wavy {
    text-decoration: underline;
    text-decoration-style: wavy;
    text-decoration-color: #0ea5e9; 
    text-decoration-thickness: 2px;
    text-underline-offset: 4px;
    text-decoration-skip-ink: none;
  }
  .custom-watercolor {
    background: linear-gradient(120deg, #fef08a 0%, #fde047 100%);
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    color: #854d0e;
  }
  .dark .custom-watercolor {
    background: linear-gradient(120deg, #ca8a04 0%, #a16207 100%);
    color: #fefce8;
  }

  /* Mermaid */
  .mermaid {
    display: flex;
    justify-content: center;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 0.75rem;
    padding: 2rem;
    margin: 2rem 0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }
  .dark .mermaid { background: #1e293b; border-color: #334155; box-shadow: none; }
  
  /* Scrollbar */
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

  /* Grid Background */
  .bg-grid {
    background-size: 40px 40px;
    background-image: linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px);
    mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
  }
  .dark .bg-grid {
    background-image: linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
  }

  /* Task List Styles */
  .markdown-body input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    background-color: transparent;
    margin: 0;
    width: 1.15em;
    height: 1.15em;
    border: 1.5px solid #cbd5e1;
    border-radius: 0.35em;
    display: inline-grid;
    place-content: center;
    margin-right: 0.6em;
    transform: translateY(0.2em);
    cursor: pointer;
    flex-shrink: 0;
  }
  .dark .markdown-body input[type="checkbox"] { border-color: #475569; }
  .markdown-body input[type="checkbox"]::before {
    content: "";
    width: 0.65em;
    height: 0.65em;
    transform: scale(0);
    transition: 120ms transform ease-in-out;
    box-shadow: inset 1em 1em #3b82f6;
    transform-origin: center;
    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
  }
  .markdown-body input[type="checkbox"]:checked {
    border-color: #3b82f6;
    background-color: #eff6ff;
  }
  .dark .markdown-body input[type="checkbox"]:checked {
    background-color: rgba(59, 130, 246, 0.1);
  }
  .markdown-body input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  .markdown-body li:has(input[type="checkbox"]) {
    list-style: none;
    margin-left: -1.2em;
    display: flex;
    align-items: flex-start;
  }
`;

// --- Utils (这些就是之前报错缺失的函数) ---
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

const loadStylesheet = (href) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) { resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = reject;
    document.head.appendChild(link);
  });
};

// --- Components ---
const Icons = {
  Sun: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
  ),
  Moon: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
  ),
  Tag: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>
  ),
  Clock: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  ),
  Calendar: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  ),
  FileText: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
  ),
  ArrowUp: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m18 15-6-6-6 6"/></svg>
  )
};

const TableOfContents = ({ headers, activeId }) => {
  if (!headers || headers.length === 0) return null;

  return (
    <div className="hidden xl:block absolute left-full top-0 ml-10 h-full w-64">
      <div className="sticky top-32">
        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          目录
        </h5>
        <ul className="space-y-1 relative border-l border-slate-200 dark:border-slate-700">
          {headers.map((header, index) => (
            <li key={index}>
              <a 
                href={`#${header.slug}`}
                className={`block text-sm py-1.5 border-l-2 transition-all duration-200 truncate ${
                  header.level > 2 ? 'pl-6 text-xs' : 'pl-4'
                } ${
                  activeId === header.slug 
                    ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-medium bg-gradient-to-r from-sky-50/50 to-transparent dark:from-sky-900/10' 
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {header.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const NOTE_TITLE = "深度算法分析：从 DFS 到图论的演进";
const NOTE_CATEGORY = "算法与数据结构";
const NOTE_DATE = "2025/11/14";

export default function Article({ onBack, isEmbedded = false, scrollContainerId = null }) {
  const [markdown, setMarkdown] = useState(`
> “细节不是细节，它们构成了设计。” —— Charles Eames

本笔记整理了 **DFS** 的核心概念与代码模板，包含数学公式推导与复杂度分析。
测试高亮功能：++红色下划线重点++，还有^^天蓝色波浪线^^，以及==重点水彩标记==。

## 1. 列表演示

### 1.1 无序列表
- **核心算法**：DFS, BFS, Dijkstra
- **数据结构**：
  - 数组 (Array)
  - 链表 (Linked List)
    - 单向链表
    - 双向链表
  - 栈与队列

### 1.2 有序列表
1. 初始化 visited 数组
2. 选择起始节点
3. 递归访问：
   1. 标记当前节点
   2. 遍历邻居节点
   3. 回溯（如果需要）

### 1.3 任务清单 (Task Lists)
- [x] 复习递归基础
- [x] 理解栈的原理
- [ ] 刷 LeetCode 200 题 (岛屿数量)
- [ ] 整理 Tarjan 算法笔记

---

## 2. 链接与引用

在学习过程中，推荐使用 [VisuAlgo](https://visualgo.net/) 进行可视化学习。它对理解 **Graph** 结构非常有帮助。

> 💡 **Tip**: 记得不仅要看代码，还要自己手画递归树。

## 3. 图片展示效果

这里展示一张关于算法数据结构的概念图：

![算法概念图](https://images.unsplash.com/photo-1558494949-ef526b0042a0?auto=format&fit=crop&w=1200&q=80)
*图1: 现代数据中心与算法可视化*

---

## 4. 核心概念

深度优先搜索（DFS）是一种用于遍历或搜索树或图的算法。这个算法会尽可能深地搜索树的分支。

### 4.1 关键特性
1.  **递归实现**：代码简洁，利用系统栈。
2.  **栈实现**：迭代版本，防止栈溢出。
3.  **应用场景**：路径查找、拓扑排序、连通性检测。

---

## 5. 知识点标签

#算法 #DFS #图论 #笔记

## 6. 代码模板

以下是通用的 Python 递归模板，注意 \`visited\` 数组的使用。

\`\`\`python
def dfs(graph, start, visited=None):
    if visited is None:
        visited = set()
    
    # 标记当前节点
    visited.add(start)
    print(f"Visiting {start}")
    
    # 递归访问邻居
    for next_node in graph[start] - visited:
        dfs(graph, next_node, visited)
    
    return visited

# 图的表示
graph = {'0': set(['1', '2']),
         '1': set(['0', '3', '4']),
         '2': set(['0']),
         '3': set(['1']),
         '4': set(['2', '3'])}

dfs(graph, '0')
\`\`\`

命令行执行测试：
\`\`\`bash
python dfs_test.py --verbose
\`\`\`

## 7. 数学推导

时间复杂度取决于节点数 $V$ 和边数 $E$。
在邻接表表示中，复杂度为：

$$ T(V, E) = \\Theta(V + E) $$

如果使用邻接矩阵，复杂度则上升为：

$$ T(V, E) = \\Theta(V^2) $$

## 8. 流程可视化

算法执行过程如下：

\`\`\`mermaid
graph TD
    A[Start Node] --> B{Visited?}
    B -- No --> C[Mark Visited]
    B -- Yes --> D[Return]
    C --> E[Process Node]
    E --> F[Iterate Neighbors]
    F --> A
\`\`\`

## 9. 复杂度对比表

| 数据结构 | 空间复杂度 | 时间复杂度 (平均) | 稳定性 |
| :--- | :---: | :---: | :---: |
| 邻接矩阵 | $O(V^2)$ | $O(1)$ 查询 | 高 |
| 邻接表 | $O(V+E)$ | $O(Degree)$ 查询 | 变动 |
| 边列表 | $O(E)$ | $O(E)$ 查询 | 低 |
`);
  const [htmlContent, setHtmlContent] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [headers, setHeaders] = useState([]);
  const [activeHeader, setActiveHeader] = useState("");
  const [extractedTags, setExtractedTags] = useState([]); 
  const [stats, setStats] = useState({ wordCount: 0, readTime: 0 });
  const [showScrollTop, setShowScrollTop] = useState(false);
  const contentRef = useRef(null);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);

  useEffect(() => {
    const loadResources = async () => {
      try {
        await Promise.all([
          loadScript('https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js'),
          loadStylesheet('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css'),
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js'),
          loadStylesheet('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'),
          loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'),
          loadScript('https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js')
        ]);
        await Promise.all([
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js'),
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js'),
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js'),
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js'),
          loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js')
        ]);
        setResourcesLoaded(true);
      } catch (err) { console.error(err); }
    };
    loadResources();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    if (resourcesLoaded && window.mermaid) {
        try {
            window.mermaid.initialize({ startOnLoad: false, theme: isDarkMode ? 'dark' : 'default', securityLevel: 'loose', fontFamily: 'Inter, sans-serif' });
        } catch(e) {}
    }
  }, [isDarkMode, resourcesLoaded, htmlContent]);

  useEffect(() => {
    const handleCopyClick = (e) => {
      const copyBtn = e.target.closest('.copy-btn');
      if (!copyBtn) return;
      const codeElement = copyBtn.closest('.code-block-wrapper')?.querySelector('pre code');
      if (!codeElement) return;
      const textArea = document.createElement("textarea");
      textArea.value = codeElement.innerText;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        const originalIconHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-400"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => { copyBtn.innerHTML = originalIconHtml; }, 2000);
      } catch (err) { console.error('Failed to copy', err); } 
      finally { document.body.removeChild(textArea); }
    };
    document.addEventListener('click', handleCopyClick);
    return () => document.removeEventListener('click', handleCopyClick);
  }, []);

  useEffect(() => {
    if (!resourcesLoaded || !window.marked) return;
    
    // Stats calculation
    const textContent = markdown.replace(/[#*`>~-]/g, ''); // Crude cleanup
    const wordCount = textContent.trim().length;
    const readTime = Math.ceil(wordCount / 400); // Avg reading speed
    setStats({ wordCount, readTime });

    const renderer = new window.marked.Renderer();
    const tempHeaders = [];
    renderer.heading = function (text, level, raw) {
      const anchorText = raw || text || '';
      const slug = String(anchorText).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-');
      // Only capture H2 and H3 for TOC, leave title (H1) logic to outside
      if (level > 1) {
          tempHeaders.push({ text: String(text), level, slug });
      }
      return `<h${level} id="${slug}">${text}</h${level}>`;
    };
    renderer.code = function (code, language) {
      if (language === 'mermaid') return `<div class="mermaid">${code}</div>`;
      return `<div class="code-block-wrapper"><div class="code-header"><div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-[#ff5f56] shadow-sm"></div><div class="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-sm"></div><div class="w-3 h-3 rounded-full bg-[#27c93f] shadow-sm"></div></div><div class="flex items-center gap-3"><span class="code-lang">${language || 'text'}</span><button class="copy-btn p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors" title="Copy code"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button></div></div><pre><code class="language-${language}">${code}</code></pre></div>`;
    };
    renderer.table = function (header, body) { return `<div class="table-wrapper"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`; };
    
    const parseCustomSyntax = (text) => {
      let parsed = String(text);
      const tags = [];
      parsed = parsed.replace(/(\s|^)#([\w\u4e00-\u9fa5]+)/g, (match, prefix, tag) => { tags.push(tag); return `${prefix}<span class="md-tag-inline">#${tag}</span>`; });
      setExtractedTags([...new Set(tags)]);
      parsed = parsed.replace(/\+\+(.*?)\+\+/g, '<span class="custom-underline-red">$1</span>');
      parsed = parsed.replace(/\^\^(.*?)\^\^/g, '<span class="custom-underline-wavy">$1</span>');
      parsed = parsed.replace(/==(.*?)==/g, '<span class="custom-watercolor">$1</span>');
      return parsed;
    };
    window.marked.setOptions({ renderer, gfm: true, breaks: true, headerIds: false });
    try {
      const processed = parseCustomSyntax(markdown);
      // Remove 'disabled' to make checkboxes clickable
      let rawHtml = window.marked.parse(processed);
      rawHtml = rawHtml.replace(/<input checked="" disabled="" type="checkbox">/g, '<input checked="" type="checkbox">')
                       .replace(/<input disabled="" type="checkbox">/g, '<input type="checkbox">');
      
      setHeaders(tempHeaders);
      setHtmlContent(rawHtml);
    } catch (error) { console.error(error); }
  }, [markdown, resourcesLoaded]);

  useEffect(() => {
    if (!contentRef.current || !resourcesLoaded) return;
    if (window.Prism) window.Prism.highlightAllUnder(contentRef.current);
    if (window.renderMathInElement) window.renderMathInElement(contentRef.current, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false });
    if (window.mermaid) window.mermaid.init(undefined, document.querySelectorAll('.mermaid'));
  }, [htmlContent, resourcesLoaded]);

  // Scroll Handler for Spy and BackToTop
  useEffect(() => {
    // 确定监听对象：如果是嵌入模式，监听传入的容器ID；否则监听 window
    const scrollTarget = scrollContainerId ? document.getElementById(scrollContainerId) : window;
    if (scrollContainerId && !scrollTarget) return;

    const handleScroll = () => {
      // 获取滚动距离：兼容 window 和 element
      const scrollTop = scrollContainerId ? scrollTarget.scrollTop : window.scrollY;
      const scrollHeight = scrollContainerId ? scrollTarget.scrollHeight : document.documentElement.scrollHeight;
      const clientHeight = scrollContainerId ? scrollTarget.clientHeight : window.innerHeight;

      // Back to Top Logic
      if (scrollTop > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }

      // Scroll Spy Logic
      if (headers.length === 0) return;
      
      if (clientHeight + scrollTop >= scrollHeight - 50) {
        setActiveHeader(headers[headers.length - 1].slug);
        return;
      }
      
      const threshold = 150; 
      let currentActiveId = '';
      for (let i = 0; i < headers.length; i++) {
        const el = document.getElementById(headers[i].slug);
        if (el && el.getBoundingClientRect().top <= threshold) currentActiveId = headers[i].slug;
        else break;
      }
      if (currentActiveId) setActiveHeader(currentActiveId);
    };

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => scrollTarget.removeEventListener('scroll', handleScroll);
  }, [headers, scrollContainerId, isEmbedded]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  
  const scrollToTop = () => {
    if (scrollContainerId) {
      const container = document.getElementById(scrollContainerId);
      if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!resourcesLoaded) return <div className="min-h-full flex items-center justify-center bg-gray-50 dark:bg-[#020617] text-slate-500 py-20">Loading resources...</div>;

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div className={`bg-gray-50 dark:bg-[#020617] transition-colors duration-300 flex flex-col selection:bg-blue-100 selection:text-blue-900 dark:selection:bg-blue-900/30 dark:selection:text-blue-200 ${isEmbedded ? '' : 'min-h-screen'}`}>
        
        {/* 背景装饰：仅在非嵌入模式(独立页面)显示 */}
        {!isEmbedded && (
          <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-grid"></div>
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-50/50 rounded-full blur-[100px] dark:hidden"></div>
            <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-indigo-50/50 rounded-full blur-[100px] dark:hidden"></div>
            <div className="hidden dark:block absolute top-0 -left-4 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px]"></div>
            <div className="hidden dark:block absolute bottom-0 -right-4 w-96 h-96 bg-sky-500/10 rounded-full blur-[100px]"></div>
          </div>
        )}

        <main className={`relative z-10 flex-grow px-4 sm:px-6 lg:px-8 ${isEmbedded ? 'pt-8 pb-10' : 'pt-28 pb-16'}`}>
          <div className="relative max-w-5xl mx-auto w-full">
            
            {/* 嵌入模式下的“返回文集”按钮 */}
            {isEmbedded && onBack && (
              <div className="mb-6 flex items-center">
                <button 
                  onClick={onBack}
                  className="group flex items-center gap-1 text-sm text-slate-500 hover:text-orange-600 transition-colors pl-1 pr-3 py-1.5 rounded-lg hover:bg-orange-50"
                >
                  <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                  <span className="font-medium">返回文集目录</span>
                </button>
              </div>
            )}

            <div className="bg-white dark:bg-[#0b1120] rounded-2xl p-8 sm:p-14 shadow-paper dark:shadow-none ring-1 ring-slate-900/5 dark:ring-slate-800 transition-all duration-300">
              
              <header className="mb-10 pb-8 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-sm shadow-blue-500/30">
                    {NOTE_CATEGORY}
                  </span>
                  {extractedTags.map(tag => (
                    <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20 transition-colors cursor-default">
                        <Icons.Tag className="w-3 h-3 mr-1 opacity-50" />
                        {tag}
                    </span>
                  ))}
                </div>

                <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight mb-6">
                  {NOTE_TITLE}
                </h1>

                <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 dark:text-slate-400 font-medium">
                  <div className="flex items-center gap-2">
                    <Icons.FileText className="w-4 h-4 text-slate-400" />
                    <span>{stats.wordCount} 字</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.Clock className="w-4 h-4 text-slate-400" />
                    <span>{stats.readTime} 分钟阅读</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.Calendar className="w-4 h-4 text-slate-400" />
                    <span>{NOTE_DATE}</span>
                  </div>
                </div>
              </header>

              <article ref={contentRef} className="markdown-body" dangerouslySetInnerHTML={{ __html: htmlContent }} />
            </div>
            
            <div className="mt-12 flex justify-center">
                <p className="text-sm text-slate-400 dark:text-slate-600 font-medium">END OF CONTENT</p>
            </div>

            <TableOfContents headers={headers} activeId={activeHeader} />
          </div>
        </main>

        {/* Back to Top Button */}
        <button 
            onClick={scrollToTop}
            className={`fixed bottom-8 right-8 p-3 rounded-full bg-white dark:bg-slate-800 shadow-lg shadow-slate-200/50 dark:shadow-black/50 border border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-all duration-300 z-[100] hover:-translate-y-1 ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
            title="回到顶部"
        >
            <Icons.ArrowUp className="w-5 h-5" />
        </button>
      </div>
    </>
  );
}