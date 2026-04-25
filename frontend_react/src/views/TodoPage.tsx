import React, { useState, useEffect, useMemo } from 'react';
import {
    CheckSquare,
    Plus,
    Trash2,
    Calendar,
    CheckCircle2,
    Search,
    Clock
} from 'lucide-react';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { useToast } from '../components/common/ToastProvider';

// 定义任务类型
interface TodoItem {
    id: string;
    content: string;
    completed: boolean;
    createdAt: number;
}

export default function TodoPage() {
    // --- 状态管理 ---
    const [tasks, setTasks] = useState<TodoItem[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const { showToast } = useToast();

    // --- 初始化：从 LocalStorage 读取 ---
    useEffect(() => {
        const saved = localStorage.getItem('odoc-todos');
        if (saved) {
            try {
                setTasks(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse todos', e);
            }
        }
    }, []);

    // --- 持久化：保存到 LocalStorage ---
    useEffect(() => {
        localStorage.setItem('odoc-todos', JSON.stringify(tasks));
    }, [tasks]);

    // --- 交互逻辑 ---
    const handleAddTask = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const content = inputValue.trim();
        if (!content) return;

        const newTask: TodoItem = {
            id: Date.now().toString(),
            content,
            completed: false,
            createdAt: Date.now()
        };

        setTasks([newTask, ...tasks]);
        setInputValue('');
        showToast('任务已添加', 'success');
    };

    const toggleComplete = (id: string) => {
        setTasks(tasks.map(t =>
            t.id === id ? { ...t, completed: !t.completed } : t
        ));
    };

    const handleDelete = () => {
        if (deleteId) {
            setTasks(tasks.filter(t => t.id !== deleteId));
            setDeleteId(null);
            showToast('任务已删除', 'success');
        }
    };

    const clearCompleted = () => {
        const activeTasks = tasks.filter(t => !t.completed);
        if (activeTasks.length === tasks.length) return;

        setTasks(activeTasks);
        showToast('已清理所有完成任务', 'success');
    };

    // --- 过滤逻辑 ---
    const filteredTasks = useMemo(() => {
        switch (filter) {
            case 'active': return tasks.filter(t => !t.completed);
            case 'completed': return tasks.filter(t => t.completed);
            default: return tasks;
        }
    }, [tasks, filter]);

    const activeCount = tasks.filter(t => !t.completed).length;

    // --- 格式化时间 ---
    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const completedCount = tasks.length - activeCount;

    return (
        <div className="min-h-screen py-6 px-4 sm:px-6 lg:px-8">
            <ConfirmationModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleDelete}
                title="删除任务"
                description="确定要删除这个任务吗？此操作无法撤销。"
                confirmText="确认删除"
                type="danger"
            />

            <div className="max-w-4xl mx-auto">
                {/* 头部区域 */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="p-2 bg-orange-50 text-orange-600 rounded-xl border border-orange-100 shadow-sm shadow-orange-500/10">
                                <CheckSquare className="w-6 h-6" />
                            </span>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">待办清单</h1>
                                <p className="mt-1 text-sm text-slate-500">
                                    管理日常任务，保持专注与高效。
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-100 rounded-full shadow-sm">
                            <Clock className="w-3.5 h-3.5 text-orange-500" />
                            {activeCount} 个待办
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-100 rounded-full shadow-sm">
                            <CheckCircle2 className="w-3.5 h-3.5 text-lime-600" />
                            {completedCount} 个完成
                        </span>
                    </div>
                </div>

                {/* 主体卡片 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">

                    {/* 输入框区域 */}
                    <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
                        <form onSubmit={handleAddTask} className="relative">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="添加一个新的待办任务..."
                                className="w-full pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-sm placeholder:text-slate-400 text-sm"
                                autoFocus
                            />
                            <button
                                type="submit"
                                disabled={!inputValue.trim()}
                                className="absolute right-1.5 top-1.5 bottom-1.5 aspect-square bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-md flex items-center justify-center transition-all shadow-sm shadow-orange-500/20 active:scale-95"
                            >
                                <Plus className="w-5 h-5" strokeWidth={3} />
                            </button>
                        </form>
                    </div>

                    {/* 控制栏 */}
                    <div className="flex flex-col sm:flex-row justify-between items-center p-3 border-b border-slate-100 gap-3 text-sm">
                        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-lg">
                            {(['all', 'active', 'completed'] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-md transition-all text-xs font-medium ${
                                        filter === f
                                            ? 'bg-white text-orange-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {f === 'all' && '全部'}
                                    {f === 'active' && '进行中'}
                                    {f === 'completed' && '已完成'}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>共 {tasks.length} 项</span>
                            </span>
                            {tasks.some(t => t.completed) && (
                                <button
                                    onClick={clearCompleted}
                                    className="text-slate-400 hover:text-orange-600 transition-colors underline decoration-dotted"
                                >
                                    清理已完成
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 任务列表 */}
                    <div className="min-h-[400px]">
                        {tasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">
                                <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-4 border border-orange-100">
                                    <Calendar className="w-9 h-9 text-orange-300" />
                                </div>
                                <p className="text-base font-semibold text-slate-700">一切就绪！</p>
                                <p className="text-sm text-slate-400 mt-1">试着添加你的第一个任务吧</p>
                            </div>
                        ) : filteredTasks.length === 0 ? (
                            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                                <div className="bg-slate-50 p-4 rounded-full mb-3">
                                    <Search className="w-6 h-6 text-slate-300" />
                                </div>
                                <p className="text-sm">没有找到相关任务</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-50">
                                {filteredTasks.map((task) => (
                                    <li
                                        key={task.id}
                                        className="group flex items-center gap-3 p-4 hover:bg-orange-50/40 transition-colors animate-in fade-in duration-300"
                                    >
                                        <button
                                            onClick={() => toggleComplete(task.id)}
                                            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
                                                task.completed
                                                    ? 'bg-orange-500 border-orange-500 text-white'
                                                    : 'border-slate-300 text-transparent hover:border-orange-400'
                                            }`}
                                        >
                                            <CheckCircle2 className="w-4 h-4" strokeWidth={3} />
                                        </button>
                                        
                                        <div className="flex-grow min-w-0">
                                            <p className={`text-sm transition-all truncate ${
                                                task.completed
                                                    ? 'text-slate-400 line-through decoration-slate-300 decoration-2' 
                                                    : 'text-slate-700'
                                            }`}>
                                                {task.content}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5 font-mono">
                                                {formatDate(task.createdAt)}
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => setDeleteId(task.id)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all transform scale-90 group-hover:scale-100"
                                            title="删除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
