import React from 'react';
import {
    BookOpen, Code, Server, Database, Shield, Zap, Cloud, Folder,
    Briefcase, Layout, Box, Terminal, Activity, Hexagon, Command,
    Target, Grid, HardDrive, PenTool, Archive, Cpu
} from 'lucide-react';

export interface IconItem {
    id: string;
    icon: React.ReactElement<{ className?: string }>;
    color: string;
}

export const AVAILABLE_ICONS: IconItem[] = [
    { id: 'book', icon: <BookOpen />, color: "text-blue-500" },
    { id: 'code', icon: <Code />, color: "text-sky-500" },
    { id: 'server', icon: <Server />, color: "text-violet-500" },
    { id: 'database', icon: <Database />, color: "text-indigo-500" },
    { id: 'shield', icon: <Shield />, color: "text-teal-500" },
    { id: 'zap', icon: <Zap />, color: "text-orange-500" },
    { id: 'cloud', icon: <Cloud />, color: "text-cyan-500" },
    { id: 'folder', icon: <Folder />, color: "text-yellow-500" },
    { id: 'briefcase', icon: <Briefcase />, color: "text-amber-700" },
    { id: 'layout', icon: <Layout />, color: "text-pink-500" },
    { id: 'box', icon: <Box />, color: "text-fuchsia-500" },
    { id: 'terminal', icon: <Terminal />, color: "text-slate-700" },
    { id: 'activity', icon: <Activity />, color: "text-rose-500" },
    { id: 'hexagon', icon: <Hexagon />, color: "text-lime-600" },
    { id: 'command', icon: <Command />, color: "text-gray-500" },
    { id: 'target', icon: <Target />, color: "text-red-600" },
    { id: 'grid', icon: <Grid />, color: "text-emerald-500" },
    { id: 'harddrive', icon: <HardDrive />, color: "text-slate-500" },
    { id: 'pentool', icon: <PenTool />, color: "text-purple-600" },
    { id: 'archive', icon: <Archive />, color: "text-amber-600" },
    { id: 'cpu', icon: <Cpu />, color: "text-orange-500" },
];

// 辅助函数：根据ID获取带样式的图标组件
export const getIconComponent = (iconId: string, className = "w-4 h-4") => {
    const item = AVAILABLE_ICONS.find(i => i.id === iconId) || AVAILABLE_ICONS[0];
    return React.cloneElement(item.icon, { className: `${className} ${item.color}` });
};