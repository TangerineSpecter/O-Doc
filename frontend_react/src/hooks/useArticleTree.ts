import { useState, useEffect, useMemo, useCallback } from 'react';
import { getArticleTreeByAnthology, ArticleNode } from '../api/article';
import { useToast } from '../components/common/ToastProvider';

export const useArticleTree = (collId?: string) => {
    const [treeData, setTreeData] = useState<ArticleNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const toast = useToast();

    // 1. 获取数据
    const fetchTree = useCallback(async () => {
        if (!collId) return;
        setLoading(true);
        try {
            const data = await getArticleTreeByAnthology(collId);
            setTreeData(data);
            // 默认展开第一层级
            const defaultExpanded = data
                .filter(node => node.children && node.children.length > 0)
                .map(node => node.id);
            setExpandedIds(defaultExpanded);
        } catch (error) {
            console.error('Failed to fetch article tree:', error);
            toast.error('获取目录失败');
        } finally {
            setLoading(false);
        }
    }, [collId, toast]);

    useEffect(() => {
        fetchTree();
    }, [fetchTree]);

    // 2. 扁平化数据 (用于查找和简单的列表展示)
    const flatDocs = useMemo(() => {
        const flat: ArticleNode[] = [];
        const recurse = (items: ArticleNode[]) => {
            items.forEach(item => {
                flat.push(item);
                if (item.children) recurse(item.children);
            });
        };
        recurse(treeData);
        return flat;
    }, [treeData]);

    // 3. 搜索逻辑
    const filteredDocs = useMemo(() => {
        if (!searchQuery.trim()) return treeData;

        // 递归搜索函数
        const search = (nodes: ArticleNode[]): ArticleNode[] => {
            const result: ArticleNode[] = [];
            for (const node of nodes) {
                const matches = node.title.toLowerCase().includes(searchQuery.toLowerCase());
                let matchedChildren: ArticleNode[] = [];
                
                if (node.children) {
                    matchedChildren = search(node.children);
                }

                // 如果自己匹配，或者有子节点匹配，则保留该节点
                if (matches || matchedChildren.length > 0) {
                    // 如果是子节点匹配，需要克隆当前节点并更新 children
                    result.push({
                        ...node,
                        children: matchedChildren.length > 0 ? matchedChildren : node.children
                    });
                }
            }
            return result;
        };

        return search(treeData);
    }, [treeData, searchQuery]);

    // 4. 交互操作
    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    return {
        treeData,
        filteredDocs,
        flatDocs,
        loading,
        expandedIds,
        searchQuery,
        setSearchQuery,
        toggleExpand,
        refreshTree: fetchTree
    };
};