import React from 'react';
import {Activity, BarChart3, ChevronDown, ChevronRight, FileText, Plus, RefreshCw, Search, X} from 'lucide-react';
import type {MT4Expert, MT4Test} from '../../types/api/mt4Archive';
import {mt4BacktestLabel} from '../../utils/mt4BacktestLabel';

export interface MT4SidebarProps {
    title?: string;
    icon?: React.ReactNode;
    experts: MT4Expert[];
    testsByExpert: Record<string, MT4Test[]>;
    activeExpertId?: string;
    activeTestId?: string;
    expandedIds: string[];
    searchQuery: string;
    isReloading?: boolean;
    onSearchChange: (query: string) => void;
    onToggleExpand: (e: React.MouseEvent, id: string) => void;
    onSelectExpert: (id: string) => void;
    onSelectTest: (expertId: string, testId: string) => void;
    onCreateExpert: () => void;
    onReset?: () => void;
    onReload?: () => void;
    className?: string;
}

export default function MT4Sidebar({
    title = 'MT4 回测文集',
    icon,
    experts,
    testsByExpert,
    activeExpertId,
    activeTestId,
    expandedIds,
    searchQuery,
    isReloading = false,
    onSearchChange,
    onToggleExpand,
    onSelectExpert,
    onSelectTest,
    onCreateExpert,
    onReset,
    onReload,
    className = ''
}: MT4SidebarProps) {
    const trimmedQuery = searchQuery.trim().toLowerCase();

    const filteredExperts = experts.filter(expert => {
        if (!trimmedQuery) return true;
        const tests = testsByExpert[expert.id] || [];
        return (
            expert.name.toLowerCase().includes(trimmedQuery) ||
            (expert.category || '').toLowerCase().includes(trimmedQuery) ||
            tests.some(t => `${t.title} ${mt4BacktestLabel(t.data)}`.toLowerCase().includes(trimmedQuery))
        );
    });

    const renderExpertItem = (expert: MT4Expert) => {
        const tests = testsByExpert[expert.id] || [];
        const hasChildren = tests.length > 0;
        const isExpanded = expandedIds.includes(expert.id) || trimmedQuery.length > 0;
        const isActive = activeExpertId === expert.id && !activeTestId;

        const visibleTests = trimmedQuery
            ? tests.filter(t => `${t.title} ${mt4BacktestLabel(t.data)}`.toLowerCase().includes(trimmedQuery) || expert.name.toLowerCase().includes(trimmedQuery))
            : tests;

        return (
            <div key={expert.id}>
                <div
                    onClick={() => onSelectExpert(expert.id)}
                    className={`
                        group flex items-center justify-between py-1.5 pr-2 cursor-pointer text-sm transition-colors border-l-2
                        ${isActive
                            ? 'border-orange-500 bg-orange-50 text-orange-700 font-medium'
                            : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                    `}
                    style={{paddingLeft: '12px'}}
                    title={expert.name}
                >
                    <div className="flex items-center gap-2 truncate">
                        <FileText size={12} className="shrink-0 text-slate-400"/>
                        <span className="truncate">{expert.name}</span>
                    </div>
                    {hasChildren && (
                        <div
                            onClick={(e) => onToggleExpand(e, expert.id)}
                            className="p-1 rounded-sm hover:bg-black/5 text-slate-400 transition-colors"
                        >
                            {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        </div>
                    )}
                </div>

                {hasChildren && isExpanded && (
                    <div>
                        {visibleTests.map(testItem => {
                            const isTestActive = activeTestId === testItem.id;
                            const label = mt4BacktestLabel(testItem.data);
                            return (
                                <div
                                    key={testItem.id}
                                    onClick={() => onSelectTest(expert.id, testItem.id)}
                                    className={`
                                        group flex items-center justify-between py-1.5 pr-2 cursor-pointer text-xs transition-colors border-l-2
                                        ${isTestActive
                                            ? 'border-orange-500 bg-orange-50 text-orange-700 font-medium'
                                            : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900'}
                                    `}
                                    style={{paddingLeft: '28px'}}
                                    title={label}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <BarChart3 size={12} className="shrink-0 text-slate-400"/>
                                        <span className="truncate">{label}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <aside className={`bg-white flex flex-col border-r border-slate-200 flex-shrink-0 h-full ${className}`}>
            {/* Header */}
            <div
                onClick={onReset}
                className="h-14 flex items-center justify-between px-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors flex-shrink-0 group"
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    {icon ? icon : <Activity size={16} className="text-orange-500 flex-shrink-0"/>}
                    <span className="font-bold text-slate-700 text-sm truncate">{title}</span>
                </div>

                {onReload && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onReload();
                        }}
                        disabled={isReloading}
                        className={`
                            p-1.5 rounded-md text-slate-400 hover:bg-orange-50 hover:text-orange-600 transition-all
                            ${isReloading ? 'cursor-not-allowed opacity-100' : 'opacity-0 group-hover:opacity-100'}
                        `}
                        title="刷新文集"
                    >
                        <RefreshCw size={14} className={isReloading ? 'animate-spin text-orange-600' : ''}/>
                    </button>
                )}
            </div>

            {/* Search & Actions */}
            <div className="p-3 flex-shrink-0 space-y-2">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="搜索目录..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-xs py-1.5 pl-8 pr-8 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all text-slate-600"
                    />
                    <Search size={12} className="absolute left-2.5 top-2 text-slate-400"/>
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => onSearchChange('')}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X size={12}/>
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onCreateExpert}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-dashed rounded-md text-xs transition-all bg-white border-slate-300 text-slate-500 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50"
                >
                    <Plus size={12}/>
                    <span>新建 EA</span>
                </button>
            </div>

            {/* Tree List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
                {filteredExperts.length > 0 ? (
                    filteredExperts.map(expert => renderExpertItem(expert))
                ) : (
                    <div className="text-center text-xs text-slate-400 py-4">未找到 EA 档案</div>
                )}
            </div>

            <div className="p-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center flex-shrink-0 bg-white" />
        </aside>
    );
}
