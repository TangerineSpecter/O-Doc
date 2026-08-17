import React from 'react';
import {Copy, Trash2} from 'lucide-react';
import {NOTE_COLOR_OPTIONS} from '../../types/whiteboard';
import type {EdgeStyle, WhiteboardEdge, WhiteboardNode} from '../../types/whiteboard';
import {getNodeDisplayLabel, getNodeLabelValue} from '../../utils/whiteboardOps';

interface WhiteboardInspectorProps {
    selectedNodes: WhiteboardNode[];
    selectedEdge: WhiteboardEdge | null;
    onNoteColor: (color: string) => void;
    onNodeLabel: (nodeId: string, label: string) => void;
    onCommit: () => void;
    onEdgeStyle: (style: EdgeStyle) => void;
    onEdgeLabel: (label: string) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    offsetClass?: string;
}

export const WhiteboardInspector: React.FC<WhiteboardInspectorProps> = ({
    selectedNodes,
    selectedEdge,
    onNoteColor,
    onNodeLabel,
    onCommit,
    onEdgeStyle,
    onEdgeLabel,
    onDuplicate,
    onDelete,
    offsetClass = 'right-4',
}) => {
    if (selectedNodes.length === 0 && !selectedEdge) return null;

    const single = selectedNodes.length === 1 ? selectedNodes[0] : null;
    const notes = selectedNodes.filter(node => node.type === 'note');
    const canColor = notes.length > 0;
    const canLabel = single && (single.type === 'text' || single.type === 'shape');

    return (
        <div className={`absolute bottom-20 z-[100] w-64 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl p-3 pointer-events-auto ${offsetClass}`}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">
                    {selectedEdge && selectedNodes.length === 0
                        ? '连线样式'
                        : selectedNodes.length > 1
                            ? `已选 ${selectedNodes.length} 项`
                            : single
                                ? getNodeDisplayLabel(single)
                                : '样式'}
                </p>
                <div className="flex items-center gap-1">
                    {selectedNodes.length > 0 && (
                        <button
                            type="button"
                            title="复制选中"
                            onClick={onDuplicate}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                        >
                            <Copy className="w-3.5 h-3.5"/>
                        </button>
                    )}
                    <button
                        type="button"
                        title="删除选中"
                        onClick={onDelete}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                        <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                </div>
            </div>

            {canColor && (
                <div className="mb-3">
                    <p className="text-[10px] font-semibold text-slate-500 mb-1.5">便签颜色</p>
                    <div className="flex items-center gap-1.5">
                        {NOTE_COLOR_OPTIONS.map(option => {
                            const active = notes.every(node => node.color === option.value);
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    title={option.label}
                                    onClick={() => onNoteColor(option.value)}
                                    className={`w-6 h-6 rounded-full border shadow-sm ${active ? 'ring-2 ring-offset-1 ring-orange-500 border-white' : 'border-white/80'}`}
                                    style={{backgroundColor: option.value}}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {canLabel && single && (
                <label className="block mb-2">
                    <span className="text-[10px] font-semibold text-slate-500">标签</span>
                    <input
                        value={getNodeLabelValue(single)}
                        onChange={(e) => onNodeLabel(single.id, e.target.value)}
                        onBlur={onCommit}
                        placeholder={single.type === 'shape' ? '图形标签' : '文本内容'}
                        className="mt-1 w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                </label>
            )}

            {selectedEdge && (
                <div className="space-y-2">
                    <div>
                        <p className="text-[10px] font-semibold text-slate-500 mb-1.5">线条</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button
                                type="button"
                                onClick={() => onEdgeStyle('solid')}
                                className={`px-2 py-1.5 text-xs rounded-lg border ${selectedEdge.style !== 'dashed' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500'}`}
                            >
                                实线
                            </button>
                            <button
                                type="button"
                                onClick={() => onEdgeStyle('dashed')}
                                className={`px-2 py-1.5 text-xs rounded-lg border ${selectedEdge.style === 'dashed' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500'}`}
                            >
                                虚线
                            </button>
                        </div>
                    </div>
                    <label className="block">
                        <span className="text-[10px] font-semibold text-slate-500">连线标签</span>
                        <input
                            value={selectedEdge.label || ''}
                            onChange={(e) => onEdgeLabel(e.target.value)}
                            onBlur={onCommit}
                            placeholder="可选说明"
                            className="mt-1 w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                        />
                    </label>
                </div>
            )}
        </div>
    );
};
