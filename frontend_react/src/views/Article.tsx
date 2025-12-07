import React, { useState, useEffect, useMemo, ReactNode } from 'react';

// --- 依赖库 ---
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// Mac 终端风格高亮
import { tomorrow as darkTheme } from 'react-syntax-highlighter/dist/esm/styles/prism';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import { Edit3, Trash2 } from 'lucide-react';

// 定义 Article 组件接收的参数类型
interface ArticleProps {
    isEmbedded?: boolean;        // 可选，布尔值
    scrollContainerId?: string;  // 可选，字符串
    onBack?: () => void;         // 可选，函数
    content?: string;            // 可选，字符串
    // 如果你后面要把 title, tags 等传进来，也加在这里
    title?: string;
    category?: string;
    tags?: string[];
    date?: string;
    // 2. 新增操作回调定义
    onEdit?: () => void;
    onDelete?: () => void;
}

interface HeaderItem {
    text: string;
    level: number;
    slug: string;
}


// --- 强制样式 ---
const CUSTOM_STYLES = `
  /* 1. 隐藏行内代码的反引号 */
  .prose :where(code):not(:where([class~="not-prose"] *))::before { content: none !important; }
  .prose :where(code):not(:where([class~="not-prose"] *))::after { content: none !important; }

  /* 2. 确保公式过长时可以内部滚动，而不是撑开页面 */
  .katex-display { overflow-x: auto; overflow-y: hidden; max-width: 100%; }

  /* 3. 自定义高亮特效 */
  .custom-underline-red { text-decoration: underline; text-decoration-color: #FF5582A6; text-decoration-thickness: 7px; text-underline-offset: -3px; }
  .custom-underline-wavy { text-decoration: underline; text-decoration-style: wavy; text-decoration-color: #0ea5e9; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .custom-watercolor { background: linear-gradient(120deg, #fef08a 0%, #fde047 100%); padding: 0.1em 0.3em; border-radius: 0.2em; color: #854d0e; }

  /* 4. 内联标签 */
  .md-tag-inline {
    display: inline-flex; align-items: center; padding: 0 0.4em; margin: 0 0.2em;
    border-radius: 0.25rem; font-size: 0.85em; font-weight: 500;
    color: #4f46e5; background-color: #eef2ff; border: 1px solid #e0e7ff;
  }
`;

// --- Icons ---
const Icons = {
    Tag: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M7 7h.01" /></svg>,
    Clock: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    Calendar: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    FileText: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>,
    ArrowUp: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m18 15-6-6-6 6" /></svg>,
    Copy: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>,
    Check: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400" {...props}><polyline points="20 6 9 17 4 12" /></svg>,
    ArrowLeft: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
};

// --- Copy Button ---
const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="text-slate-400 hover:text-white transition-colors p-1" title="Copy code">
            {copied ? <Icons.Check /> : <Icons.Copy />}
        </button>
    );
};

// --- Mermaid Component ---
const MermaidChart = ({ chart }: { chart: string }) => {
    const [svg, setSvg] = useState('');

    useEffect(() => {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'neutral',
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
    }, [chart]);

    return (
        <div className="my-8 w-full bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-x-auto flex justify-center">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
    );
};

// --- TOC (Modified) ---
// 3. 接收 onEdit 和 onDelete
const TableOfContents = ({ 
    headers, 
    activeId, 
    isEmbedded,
    onEdit,
    onDelete 
}: { 
    headers: HeaderItem[], 
    activeId: string, 
    isEmbedded: boolean,
    onEdit?: () => void,
    onDelete?: () => void
}) => {
    if (!headers?.length) return null;

    const visibilityClass = isEmbedded ? 'hidden 2xl:block' : 'hidden xl:block';

    return (
        <div className={`${visibilityClass} absolute left-full top-0 ml-4 h-full w-64`}>
            {/* 4. 修改 top-32 为 top-6，大幅减少顶部留白 */}
            <div className="sticky top-6">
                
                {/* 5. 插入按钮组：橙色系交互、紧凑、位于标题上方 */}
                {(onEdit || onDelete) && (
                    <div className="flex items-center gap-2 mb-4">
                        {onEdit && (
                            <button
                                onClick={onEdit}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 shadow-sm hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 hover:shadow transition-all duration-200"
                            >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>编辑文档</span>
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={onDelete}
                                className="flex items-center justify-center p-1.5 bg-white border border-slate-200 rounded-md text-slate-400 shadow-sm hover:text-red-600 hover:border-red-200 hover:bg-red-50 hover:shadow transition-all duration-200"
                                title="删除文档"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> 目录
                </h5>
                <ul className="space-y-1 relative border-l border-slate-200">
                    {headers.map((h, i) => (
                        <li key={i}>
                            <a href={`#${h.slug}`} className={`block text-sm py-1.5 border-l-2 transition-all truncate ${h.level > 2 ? 'pl-6 text-xs' : 'pl-4'} ${activeId === h.slug ? 'border-[#0ea5e9] text-[#0ea5e9] font-medium bg-sky-50/30' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
                                {h.text}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

// --- Data (JSON 格式) ---
const DEFAULT_ARTICLE_DATA = {
    article_id: "note_001",
    title: "深度算法分析：从 DFS 到图论的演进",
    category: "算法与数据结构",
    date: "2025/11/14",
    // 顶部标签作为配置数据
    tags: ["算法基础", "图论", "回溯搜索", "Python"],
    content: `
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

![算法概念图](https://img.shetu66.com/2022/11/03/1667459511305837.jpg)
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

$$T(V, E) = \\Theta(V + E)$$

如果使用邻接矩阵，复杂度则上升为：

$$T(V, E) = \\Theta(V^2)$$

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
`
};

// content: 外部传入的 markdown 内容
export default function Article({
    isEmbedded,
    scrollContainerId,
    onBack,
    content,
    onEdit,    // 解构
    onDelete   // 解构
}: ArticleProps) {
    // 如果没有传入 content，则使用默认文章数据的 content
    const displayMarkdown = content !== undefined ? content : DEFAULT_ARTICLE_DATA.content;

    const [headers, setHeaders] = useState<HeaderItem[]>([]); const [activeHeader, setActiveHeader] = useState("");
    const [stats, setStats] = useState({ wordCount: 0, readTime: 0 });
    const [showScrollTop, setShowScrollTop] = useState(false);

    // 1. 预处理
    const contentWithSyntax = useMemo(() => {

        let text = displayMarkdown || ""; // 防空
        // 匹配标签（仅用于内容内标签的样式化，不再提取到顶部显示）
        text = text.replace(/(\s|^)#([\w\u4e00-\u9fa5]+)/g, (_, p, t) => {
            return `${p}<span class="md-tag-inline">#${t}</span>`;
        });
        // 匹配自定义语法
        text = text.replace(/\+\+(.*?)\+\+/g, '<span class="custom-underline-red">$1</span>')
            .replace(/\^\^(.*?)\^\^/g, '<span class="custom-underline-wavy">$1</span>')
            .replace(/==(.*?)==/g, '<span class="custom-watercolor">$1</span>');
        return text;
    }, [displayMarkdown]);

    // 2. 统计
    useEffect(() => {
        const safeText = displayMarkdown || "";
        const textContent = safeText.replace(/[#*`>~-]/g, '');
        setStats({
            wordCount: textContent.trim().length,
            readTime: Math.ceil(textContent.trim().length / 400)
        });

        const lines = safeText.split('\n');
        const headerItems: HeaderItem[] = [];
        lines.forEach(line => {
            const match = line.match(/^(#{2,6})\s+(.*)$/);
            if (match) {
                headerItems.push({
                    text: match[2].replace(/[*_~`]/g, ''),
                    level: match[1].length,
                    slug: match[2].toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')
                });
            }
        });
        setHeaders(headerItems);
    }, [displayMarkdown]);

    // 3. 滚动监听 (维持原状，用于更新目录高亮)
    useEffect(() => {
        // 获取滚动容器：如果有 ID 则获取元素，否则默认是 window
        const target = scrollContainerId ? document.getElementById(scrollContainerId) : window;

        const handleScroll = () => {
            // A. 获取当前的滚动距离
            // 注意：window 和 element 的获取方式不同
            const currentScrollTop = scrollContainerId
                ? (target as HTMLElement).scrollTop
                : (window.pageYOffset || document.documentElement.scrollTop);

            // B. 设置显隐阈值 (例如滚动超过 300px 显示)
            setShowScrollTop(currentScrollTop > 300);

            // C. 原有的目录高亮逻辑 (保持不变)
            if (headers.length === 0) return;
            for (const header of headers) {
                const el = document.getElementById(header.slug);
                if (el && el.getBoundingClientRect().top < 150) {
                    setActiveHeader(header.slug);
                }
            }
        };

        // 监听滚动
        target?.addEventListener('scroll', handleScroll, { passive: true });

        // 初始化时也检查一次（防止刷新后在中间位置不显示）
        handleScroll();

        return () => target?.removeEventListener('scroll', handleScroll);
    }, [headers, scrollContainerId]);

    // --- 修复：滚动到顶部逻辑 ---
    const handleScrollToTop = () => {
        // 优先检查是否有指定的滚动容器 ID
        if (scrollContainerId) {
            const container = document.getElementById(scrollContainerId);
            if (container) {
                container.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
        }
        // 否则回退到默认的 window 滚动
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // --- Components ---
    const components = useMemo(() => ({
        // 0. 拦截 pre
        pre: (props: any) => <div className="not-prose">{props.children}</div>,

        // A. P标签 (公式居中)
        p: (props: any) => {
            const { children } = props;
            const childrenArray = React.Children.toArray(children);

            // 1. 过滤掉无意义的换行符或空格
            const validChildren = childrenArray.filter(child => {
                if (typeof child === 'string') {
                    return child.trim().length > 0;
                }
                return true;
            });

            // 2. 检查有效节点是否全部都是公式
            const isMathBlock = validChildren.length > 0 && validChildren.every(child => {
                if (React.isValidElement(child)) {
                    // 只有 ReactElement 才有 props 属性
                    const element = child as React.ReactElement<{ className?: string }>;
                    return element.props.className?.includes('katex');
                }
                return false;
            });

            if (isMathBlock) {
                return (
                    <div className="flex justify-center w-full my-6 overflow-x-auto">
                        {children}
                    </div>
                );
            }
            return <p className="mb-4 leading-7 text-justify">{children}</p>;
        },

        // B. 代码块
        code(props: any) {
            const { node, inline, className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeStr = String(children).replace(/\n$/, '');

            if (!inline && lang === 'mermaid') {
                return <MermaidChart chart={codeStr} />;
            }

            if (!inline && match) {
                return (
                    <div className="code-block-wrapper my-6 rounded-xl overflow-hidden bg-[#1e293b] shadow-2xl border border-slate-700/50 text-[15px]">
                        <div className="flex items-center justify-between px-4 py-2 bg-[#0f172a] border-b border-slate-700/50">
                            <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-[#ff5f56]" /><div className="w-3 h-3 rounded-full bg-[#ffbd2e]" /><div className="w-3 h-3 rounded-full bg-[#27c93f]" /></div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-slate-400 uppercase">{lang}</span>
                                <CopyButton text={codeStr} />
                            </div>
                        </div>
                        {/* 这里 SyntaxHighlighter 的 style 可能还需要 ignore 或者在 .d.ts 声明 */}
                        <SyntaxHighlighter
                            style={darkTheme}
                            language={lang}
                            PreTag="div"
                            customStyle={{ margin: 0, background: 'transparent' }}
                            {...rest}
                        >
                            {codeStr}
                        </SyntaxHighlighter>
                    </div>
                );
            }

            // 行内代码
            return (
                <code className="bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] mx-1 break-words" {...props}>
                    {children}
                </code>
            );
        },

        // C. 引用块
        blockquote: ({ children }: { children: ReactNode }) => (
            <blockquote className="not-prose relative my-8 pl-6 pr-10 pt-4 border-l-4 border-violet-500 bg-gradient-to-r from-violet-50 to-transparent rounded-r-lg text-violet-800 italic flex items-center min-h-[60px]">
                <div className="absolute top-0 right-4 text-6xl text-violet-500/10 font-serif leading-none select-none">”</div>
                <div className="relative z-10 w-full">{children}</div>
            </blockquote>
        ),

        // D. Checkbox
        input: (props: any) => {
            if (props.type === 'checkbox') return <input type="checkbox" defaultChecked={props.checked} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded cursor-pointer" />;
            return <input {...props} />;
        },

        h2: ({ children }: { children: ReactNode }) => <h2 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h2>,
        h3: ({ children }: { children: ReactNode }) => <h3 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h3>,
        h4: ({ children }: { children: ReactNode }) => <h4 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h4>,
        h5: ({ children }: { children: ReactNode }) => <h5 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h5>,
        table: ({ children }: { children: ReactNode }) => <div className="overflow-x-auto my-8 border border-gray-200 rounded-lg"><table className="w-full text-sm text-left my-0">{children}</table></div>,
        th: ({ children }: { children: ReactNode }) => <th className="bg-gray-50 px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">{children}</th>,
        td: ({ children }: { children: ReactNode }) => <td className="px-4 py-3 border-b border-gray-100 text-gray-600">{children}</td>

    }), []);

    return (
        <>
            <style>{CUSTOM_STYLES}</style>

            <div className={`min-h-screen bg-white transition-colors duration-300 ${isEmbedded ? '!bg-transparent !min-h-full' : ''}`}>

                <main className={`relative z-10 max-w-5xl mx-auto xl:mx-0 xl:ml-28 px-4 ${isEmbedded ? 'py-6' : 'py-20'}`}>
                    <div className="bg-white rounded-2xl p-8 sm:p-14 shadow-none ring-1 ring-slate-900/5">

                        {/* Header */}
                        <header className="mb-10 pb-8 border-b border-slate-100">
                            <div className="flex flex-wrap items-center gap-3 mb-6">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-sm shadow-blue-500/30">
                                    {DEFAULT_ARTICLE_DATA.category}
                                </span>
                                {/* 只显示文章配置的 tags */}
                                {DEFAULT_ARTICLE_DATA.tags.map(tag => (
                                    <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        <Icons.Tag className="w-3 h-3 mr-1 opacity-50" />
                                        {tag}
                                    </span>
                                ))}

                                {onBack && (
                                    <button onClick={onBack} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                        <Icons.ArrowLeft className="w-4 h-4" />
                                        返回文集
                                    </button>
                                )}
                            </div>

                            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
                                {DEFAULT_ARTICLE_DATA.title}
                            </h1>

                            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 font-medium">
                                <div className="flex items-center gap-2"><Icons.FileText className="w-4 h-4 text-slate-400" /><span>{stats.wordCount} 字</span></div>
                                <div className="flex items-center gap-2"><Icons.Clock className="w-4 h-4 text-slate-400" /><span>{stats.readTime} 分钟阅读</span></div>
                                <div className="flex items-center gap-2"><Icons.Calendar className="w-4 h-4 text-slate-400" /><span>{DEFAULT_ARTICLE_DATA.date}</span></div>
                            </div>
                        </header>

                        {/* Markdown Render */}
                        <article className="max-w-none prose prose-slate prose-lg prose-p:[&:has(>.katex:only-child)]:text-center prose-a:text-[#0ea5e9] prose-a:no-underline hover:prose-a:underline">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex, rehypeRaw]}
                                components={components as any}
                            >
                                {contentWithSyntax}
                            </ReactMarkdown>
                        </article>

                    </div>

                    <TableOfContents
                        headers={headers}
                        activeId={activeHeader}
                        isEmbedded={isEmbedded ?? false}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                </main>

                {/* 修复后的按钮：绑定了 handleScrollToTop */}
                <button
                    onClick={handleScrollToTop}
                    className={`
                        fixed bottom-44 right-10 p-3 
                        bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] rounded-full border border-slate-100 
                        text-slate-400 hover:text-orange-600 hover:border-orange-200 hover:-translate-y-1 hover:shadow-lg 
                        transition-all duration-500 ease-in-out z-40 group
                        ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}
                    `}
                    title="返回顶部"
                >
                    <Icons.ArrowUp className="w-5 h-5 group-hover:animate-bounce" />
                </button>
            </div>
        </>
    );
}