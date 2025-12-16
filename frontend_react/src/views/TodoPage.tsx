import React, { useState, useEffect, useMemo } from 'react';
import { 
    CheckSquare, 
    Plus, 
    Trash2, 
    Calendar, 
    CheckCircle2, 
    Circle, 
    Search,
    X,
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

    return (
        <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
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
                <div className="mb-8 text-center sm:text-left">
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-3">
                        <span className="p-2 bg-rose-100 text-rose-500 rounded-xl">
                            <CheckSquare className="w-8 h-8" />
                        </span>
                        待办清单
                    </h1>
                    <p className="mt-2 text-slate-500 ml-1">
                        管理你的日常任务，保持专注与高效。
                    </p>
                </div>

                {/* 主体卡片 */}
                <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
                    
                    {/* 输入框区域 */}
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                        <form onSubmit={handleAddTask} className="relative">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="添加一个新的待办任务..."
                                className="w-full pl-5 pr-14 py-4 text-lg bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm placeholder:text-slate-400"
                                autoFocus
                            />
                            <button
                                type="submit"
                                disabled={!inputValue.trim()}
                                className="absolute right-2 top-2 bottom-2 aspect-square bg-rose-500 hover:bg-rose-600 disabled:bg-slate-300 text-white rounded-lg flex items-center justify-center transition-colors"
                            >
                                <Plus className="w-6 h-6" />
                            </button>
                        </form>
                    </div>

                    {/* 控制栏 */}
                    <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-b border-slate-100 gap-4 text-sm">
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                            {(['all', 'active', 'completed'] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-4 py-1.5 rounded-md transition-all font-medium ${
                                        filter === f 
                                            ? 'bg-white text-rose-600 shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {f === 'all' && '全部'}
                                    {f === 'active' && '进行中'}
                                    {f === 'completed' && '已完成'}
                                </button>
                            ))}
                        </div>
                        
                        <div className="flex items-center gap-4 text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-4 h-4" />
                                <span>{activeCount} 个待办</span>
                            </span>
                            {tasks.some(t => t.completed) && (
                                <button 
                                    onClick={clearCompleted}
                                    className="text-slate-400 hover:text-rose-500 transition-colors underline decoration-dotted"
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
                                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                    <Calendar className="w-10 h-10 text-slate-300" />
                                </div>
                                <p className="text-lg font-medium text-slate-600">一切就绪！</p>
                                <p className="text-sm">试着添加你的第一个任务吧</p>
                            </div>
                        ) : filteredTasks.length === 0 ? (
                            <div className="py-20 text-center text-slate-400">
                                <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>没有找到相关任务</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-50">
                                {filteredTasks.map((task) => (
                                    <li 
                                        key={task.id} 
                                        className="group flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors animate-in fade-in duration-300"
                                    >
                                        <button
                                            onClick={() => toggleComplete(task.id)}
                                            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
                                                task.completed
                                                    ? 'bg-rose-500 border-rose-500 text-white'
                                                    : 'border-slate-300 text-transparent hover:border-rose-400'
                                            }`}
                                        >
                                            <CheckCircle2 className="w-4 h-4" strokeWidth={3} />
                                        </button>
                                        
                                        <div className="flex-grow min-w-0">
                                            <p className={`text-base transition-all truncate ${
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
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100"
                                            title="删除"
                                        >
                                            <Trash2 className="w-5 h-5" />
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