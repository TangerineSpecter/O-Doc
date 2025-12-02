import React, { useState, useEffect, useMemo, useRef } from 'react';

// --- 依赖库 ---
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; 
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw'; 
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';

// --- 样式定义 (不可删除：这是文章排版的灵魂) ---
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap');

  html { scroll-behavior: smooth; }
  body { font-family: 'Inter', -apple-system, "Noto Sans SC", sans-serif; }

  /* * [重要] Markdown Body 核心样式
   * 作用：对抗 Tailwind 的样式重置，恢复标题大小、列表圆点等 
   */
  .markdown-body {
    line-height: 1.85;
    font-size: 1rem;
    color: #334155;
  }
  .dark .markdown-body { color: #94a3b8; }

  /* 标题样式恢复 */
  .markdown-body h1, .markdown-body h2, .markdown-body h3 {
    color: #0f172a;
    font-weight: 700;
    scroll-margin-top: 100px;
  }
  .dark .markdown-body h1, .dark .markdown-body h2, .dark .markdown-body h3 { color: #f8fafc; }

  .markdown-body h2 {
    margin-top: 2.5em; margin-bottom: 1em;
    font-size: 1.65em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #f1f5f9;
  }
  .dark .markdown-body h2 { border-color: #1e293b; }

  .markdown-body h3 {
    margin-top: 2em; margin-bottom: 0.8em;
    font-size: 1.35em;
    font-weight: 600;
  }

  /* 列表样式恢复 (否则没有圆点) */
  .markdown-body ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1.5em; }
  .markdown-body ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 1.5em; }
  .markdown-body li { margin-bottom: 0.4em; }
  .markdown-body ul.contains-task-list { list-style-type: none; padding-left: 0; }
  .markdown-body li.task-list-item { display: flex; align-items: flex-start; margin-left: 0; }

  /* 引用块美化 (紫色渐变效果) */
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
    content: "”"; position: absolute; top: 0; right: 1rem;
    font-size: 4rem; line-height: 1; color: rgba(139, 92, 246, 0.1);
    font-family: serif; pointer-events: none;
  }

  /* 图片阴影 */
  .markdown-body img {
    display: block; margin: 2.5rem auto; max-width: 100%;
    border-radius: 0.75rem;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
  }

  /* * [关键修复] 数学公式居中 
   * 仅针对块级公式 (.katex-display)，不影响行内文本 
   */
  .katex-display {
    display: flex !important; 
    justify-content: center;
    width: 100%;
    margin: 1.5em 0;
    overflow-x: auto;
    overflow-y: hidden;
  }
  
  /* 自定义内联标签 */
  .md-tag-inline {
    display: inline-flex; align-items: center; padding: 0 0.4em; margin: 0 0.2em;
    border-radius: 0.25rem; font-size: 0.85em; font-weight: 500;
    color: #4f46e5; background-color: #eef2ff; border: 1px solid #e0e7ff;
  }
  .dark .md-tag-inline { color: #818cf8; background-color: rgba(99, 102, 241, 0.15); border-color: rgba(99, 102, 241, 0.3); }

  /* 高亮特效 */
  .custom-underline-red { text-decoration: underline; text-decoration-color: #ef4444; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .custom-underline-wavy { text-decoration: underline; text-decoration-style: wavy; text-decoration-color: #0ea5e9; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .custom-watercolor { background: linear-gradient(120deg, #fef08a 0%, #fde047 100%); padding: 0.1em 0.3em; border-radius: 0.2em; color: #854d0e; }
  
  /* 表格样式 */
  .table-wrapper { overflow-x: auto; margin-bottom: 2em; border-radius: 0.5rem; border: 1px solid #e2e8f0; }
  .markdown-body table { width: 100%; border-collapse: collapse; }
  .markdown-body th { background: #f8fafc; padding: 0.75rem; border-bottom: 1px solid #e2e8f0; text-align: left; }
  .markdown-body td { padding: 0.75rem; border-bottom: 1px solid #e2e8f0; }
  
  /* Mermaid 容器 */
  .mermaid { display: flex; justify-content: center; padding: 2rem; background: transparent; }
`;

// --- Components (图标) ---
const Icons = {
  Tag: (props) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>,
  Clock: (props) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Calendar: (props) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  FileText: (props) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
  ArrowUp: (props) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m18 15-6-6-6 6"/></svg>,
  Copy: (props) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
  ArrowLeft: (props) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
};

// --- Mermaid 组件 ---
const MermaidChart = ({ chart, isDarkMode }) => {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDarkMode ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: 'Inter, sans-serif'
    });

    const render = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        setSvg(svg);
      } catch (error) {
        setSvg('<div class="text-red-500 text-sm p-4 bg-red-50 rounded">Mermaid Render Error</div>');
      }
    };
    render();
  }, [chart, isDarkMode]);

  return <div className="mermaid my-6" dangerouslySetInnerHTML={{ __html: svg }} />;
};

// --- 目录组件 ---
const TableOfContents = ({ headers, activeId }) => {
  if (!headers?.length) return null;
  return (
    <div className="hidden xl:block absolute left-full top-0 ml-10 h-full w-64">
      <div className="sticky top-32">
        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> 目录
        </h5>
        <ul className="space-y-1 relative border-l border-slate-200 dark:border-slate-700">
          {headers.map((h, i) => (
            <li key={i}>
              <a href={`#${h.slug}`} className={`block text-sm py-1.5 border-l-2 transition-all truncate ${h.level > 2 ? 'pl-6 text-xs' : 'pl-4'} ${activeId === h.slug ? 'border-sky-500 text-sky-600 font-medium bg-gradient-to-r from-sky-50/50 to-transparent' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// --- 示例数据 ---
const NOTE_TITLE = "深度算法分析：从 DFS 到图论的演进";
const NOTE_CATEGORY = "算法与数据结构";
const NOTE_DATE = "2025/11/14";
const sampleMarkdown = `
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
    A["Start Node"] --> B{"Visited?"}
    B -- No --> C["Mark Visited"]
    B -- Yes --> D["Return"]
    C --> E["Process Node"]
    E --> F["Iterate Neighbors"]
    F --> A
\`\`\`

## 9. 复杂度对比表

| 数据结构 | 空间复杂度 | 时间复杂度 (平均) | 稳定性 |
| :--- | :---: | :---: | :---: |
| 邻接矩阵 | $O(V^2)$ | $O(1)$ 查询 | 高 |
| 邻接表 | $O(V+E)$ | $O(Degree)$ 查询 | 变动 |
| 边列表 | $O(E)$ | $O(E)$ 查询 | 低 |
`;

export default function Article({ isEmbedded, scrollContainerId, onBack }) {
  const [markdown] = useState(sampleMarkdown);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [headers, setHeaders] = useState([]);
  const [activeHeader, setActiveHeader] = useState("");
  const [tags, setTags] = useState([]); 
  const [stats, setStats] = useState({ wordCount: 0, readTime: 0 });

  // 1. 预处理
  const contentWithSyntax = useMemo(() => {
    let text = markdown;
    const foundTags = [];
    text = text.replace(/(\s|^)#([\w\u4e00-\u9fa5]+)/g, (m, p, t) => { 
        foundTags.push(t); 
        return `${p}<span class="md-tag-inline">#${t}</span>`; 
    });
    text = text.replace(/\+\+(.*?)\+\+/g, '<span class="custom-underline-red">$1</span>')
               .replace(/\^\^(.*?)\^\^/g, '<span class="custom-underline-wavy">$1</span>')
               .replace(/==(.*?)==/g, '<span class="custom-watercolor">$1</span>');
    setTimeout(() => setTags([...new Set(foundTags)]), 0);
    return text;
  }, [markdown]);

  // 2. 统计 & 标题
  useEffect(() => {
    const textContent = markdown.replace(/[#*`>~-]/g, ''); 
    setStats({ 
        wordCount: textContent.trim().length, 
        readTime: Math.ceil(textContent.trim().length / 400) 
    });

    const lines = markdown.split('\n');
    const h = [];
    lines.forEach(line => {
      const match = line.match(/^(#{2,6})\s+(.*)$/);
      if (match) {
        h.push({ 
            text: match[2].replace(/[*_~`]/g, ''), 
            level: match[1].length, 
            slug: match[2].toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-') 
        });
      }
    });
    setHeaders(h);
  }, [markdown]);

  // 3. 滚动监听
  useEffect(() => {
    const target = scrollContainerId ? document.getElementById(scrollContainerId) : window;
    const handleScroll = () => {
      if (headers.length === 0) return;
      for (const header of headers) {
        const el = document.getElementById(header.slug);
        if (el && el.getBoundingClientRect().top < 150) {
          setActiveHeader(header.slug);
        }
      }
    };
    target?.addEventListener('scroll', handleScroll, { passive: true });
    return () => target?.removeEventListener('scroll', handleScroll);
  }, [headers, scrollContainerId]);

  // --- 关键组件配置 ---
  const components = useMemo(() => ({
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const lang = match ? match[1] : '';
      const codeStr = String(children).replace(/\n$/, '');

      // 1. Mermaid 图表
      if (!inline && lang === 'mermaid') {
        return <MermaidChart chart={codeStr} isDarkMode={isDarkMode} />;
      }
      
      // 2. 代码块 (SyntaxHighlighter)
      if (!inline && match) {
        return (
          <div className="code-block-wrapper my-6 rounded-xl overflow-hidden bg-[#1e293b] shadow-lg border border-slate-700">
             <div className="flex items-center justify-between px-4 py-2 bg-[#0f172a] border-b border-slate-700">
                <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-[#ff5f56]"/><div className="w-3 h-3 rounded-full bg-[#ffbd2e]"/><div className="w-3 h-3 rounded-full bg-[#27c93f]"/></div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 uppercase">{lang}</span>
                    <button onClick={() => navigator.clipboard.writeText(codeStr)} className="text-slate-400 hover:text-white"><Icons.Copy/></button>
                </div>
             </div>
             <SyntaxHighlighter style={tomorrow} language={lang} PreTag="div" customStyle={{ margin:0, background:'transparent' }} {...props}>{codeStr}</SyntaxHighlighter>
          </div>
        );
      }
      
      // 3. 行内代码样式 (粉色胶囊)
      return (
        <code className="bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800" {...props}>
          {children}
        </code>
      );
    },
    // 修复 Checkbox
    input: ({ node, ...props }) => {
        if (props.type === 'checkbox') {
            return (
                <input 
                    type="checkbox" 
                    defaultChecked={props.checked} 
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 mr-2 cursor-pointer mt-1"
                />
            );
        }
        return <input {...props} />;
    },
    h2: ({children}) => <h2 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h2>,
    h3: ({children}) => <h3 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h3>,
    table: ({children}) => <div className="table-wrapper"><table>{children}</table></div>
  }), [isDarkMode]);

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      
      <div className={`min-h-screen bg-gray-50 dark:bg-[#020617] transition-colors duration-300 ${isEmbedded ? '!bg-transparent !min-h-full' : ''}`}>
        {!isEmbedded && <div className="fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />}
        
        <main className={`relative z-10 max-w-5xl mx-auto px-4 ${isEmbedded ? 'py-6' : 'py-20'}`}>
          <div className="bg-white dark:bg-[#0b1120] rounded-2xl p-8 sm:p-14 shadow-xl ring-1 ring-slate-900/5">
            
            <header className="mb-10 pb-8 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-sm shadow-blue-500/30">
                    {NOTE_CATEGORY}
                  </span>
                  {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20 transition-colors cursor-default">
                        <Icons.Tag className="w-3 h-3 mr-1 opacity-50" />
                        {tag}
                    </span>
                  ))}
                  
                  {/* 返回按钮 */}
                  <button onClick={onBack} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                      <Icons.ArrowLeft className="w-4 h-4"/>
                      Back
                  </button>
                </div>

                <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight mb-6">
                  {NOTE_TITLE}
                </h1>

                <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 dark:text-slate-400 font-medium">
                  <div className="flex items-center gap-2"><Icons.FileText className="w-4 h-4 text-slate-400" /><span>{stats.wordCount} 字</span></div>
                  <div className="flex items-center gap-2"><Icons.Clock className="w-4 h-4 text-slate-400" /><span>{stats.readTime} 分钟阅读</span></div>
                  <div className="flex items-center gap-2"><Icons.Calendar className="w-4 h-4 text-slate-400" /><span>{NOTE_DATE}</span></div>
                </div>
              </header>

            <article className={`markdown-body ${isDarkMode ? 'dark' : ''}`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeRaw]} 
                components={components}
              >
                {contentWithSyntax}
              </ReactMarkdown>
            </article>

          </div>
          
          <TableOfContents headers={headers} activeId={activeHeader} />
        </main>

        <button onClick={() => window.scrollTo({top:0, behavior:'smooth'})} className="fixed bottom-8 right-8 p-3 bg-white shadow-lg rounded-full border border-slate-100 text-slate-600 hover:-translate-y-1 transition-transform z-50">
           <Icons.ArrowUp className="w-5 h-5"/>
        </button>
      </div>
    </>
  );
}