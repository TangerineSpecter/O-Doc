import React from 'react';
import {
    Circle,
    Diamond,
    FileText,
    Hand,
    MousePointer2,
    Spline,
    Square,
    StickyNote,
    Type,
} from 'lucide-react';
import type {ShapeType, WhiteboardTool} from '../../types/whiteboard';

interface WhiteboardSidebarProps {
    activeTool: WhiteboardTool;
    setActiveTool: (tool: WhiteboardTool) => void;
    shapeType: ShapeType;
    setShapeType: (type: ShapeType) => void;
    isArticlePickerOpen: boolean;
    toggleArticlePicker: () => void;
}

const TOOLS: {id: WhiteboardTool; label: string; icon: React.ReactNode}[] = [
    {id: 'select', label: '选择', icon: <MousePointer2 className="w-4.5 h-4.5"/>},
    {id: 'pan', label: '平移', icon: <Hand className="w-4.5 h-4.5"/>},
    {id: 'note', label: '便签', icon: <StickyNote className="w-4.5 h-4.5"/>},
    {id: 'text', label: '文本', icon: <Type className="w-4.5 h-4.5"/>},
    {id: 'shape', label: '图形', icon: <Square className="w-4.5 h-4.5"/>},
    {id: 'connect', label: '连线', icon: <Spline className="w-4.5 h-4.5"/>},
];

export const WhiteboardSidebar: React.FC<WhiteboardSidebarProps> = ({
    activeTool,
    setActiveTool,
    shapeType,
    setShapeType,
    isArticlePickerOpen,
    toggleArticlePicker
}) => {
    return (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-[100] flex flex-col gap-1.5 p-1.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200">
            {TOOLS.map(tool => (
                <div key={tool.id} className="relative">
                    <ToolbarBtn
                        icon={tool.id === 'shape'
                            ? (shapeType === 'circle'
                                ? <Circle className="w-[18px] h-[18px]"/>
                                : shapeType === 'diamond'
                                    ? <Diamond className="w-[18px] h-[18px]"/>
                                    : <Square className="w-[18px] h-[18px]"/>)
                            : tool.icon}
                        label={tool.label}
                        active={activeTool === tool.id}
                        onClick={() => setActiveTool(tool.id)}
                    />
                    {tool.id === 'shape' && activeTool === 'shape' && (
                        <div className="absolute left-full top-0 pl-2">
                            <div className="flex flex-col gap-1 p-1.5 bg-white rounded-2xl shadow-xl border border-slate-200">
                                <ToolbarBtn icon={<Square className="w-[18px] h-[18px]"/>} label="矩形" active={shapeType === 'rectangle'} onClick={() => setShapeType('rectangle')}/>
                                <ToolbarBtn icon={<Circle className="w-[18px] h-[18px]"/>} label="圆形" active={shapeType === 'circle'} onClick={() => setShapeType('circle')}/>
                                <ToolbarBtn icon={<Diamond className="w-[18px] h-[18px]"/>} label="菱形" active={shapeType === 'diamond'} onClick={() => setShapeType('diamond')}/>
                            </div>
                        </div>
                    )}
                </div>
            ))}

            <div className="h-px bg-slate-100 w-full my-0.5"/>

            <ToolbarBtn
                icon={<FileText className="w-[18px] h-[18px]"/>}
                label="插入文章"
                active={isArticlePickerOpen}
                onClick={toggleArticlePicker}
            />
        </div>
    );
};

function ToolbarBtn({
    icon,
    label,
    onClick,
    active
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
                active
                    ? 'bg-orange-100 text-orange-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
        >
            {icon}
        </button>
    );
}
