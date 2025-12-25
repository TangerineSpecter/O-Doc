import React from 'react';
import { WhiteboardEdge, WhiteboardNode } from '../../types/whiteboard';
import { getEdgePath, getHandleCoords } from '../../utils/whiteboardUtils';

interface EdgeLayerProps {
    edges: WhiteboardEdge[];
    nodes: WhiteboardNode[];
    selectedEdgeId: string | null;
    onSelectEdge: (id: string) => void;
    tempConnection: { start: {x:number, y:number}, end: {x:number, y:number}, startHandle: any } | null;
}

export const EdgeLayer: React.FC<EdgeLayerProps> = ({ 
    edges, nodes, selectedEdgeId, onSelectEdge, tempConnection 
}) => {
    return (
        <svg className="overflow-visible absolute top-0 left-0 w-full h-full z-0 pointer-events-none">
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                </marker>
                <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#f97316" />
                </marker>
            </defs>
            
            {edges.map(edge => {
                const sNode = nodes.find(n => n.id === edge.sourceId);
                const tNode = nodes.find(n => n.id === edge.targetId);
                if (!sNode || !tNode) return null;
                
                const start = getHandleCoords(sNode, edge.sourceHandle);
                const end = getHandleCoords(tNode, edge.targetHandle);
                const d = getEdgePath(start, end, edge.sourceHandle);
                const isSelected = selectedEdgeId === edge.id;

                return (
                    <g key={edge.id} className="pointer-events-auto cursor-pointer group" onClick={(e) => { e.stopPropagation(); onSelectEdge(edge.id); }}>
                        {/* 透明的粗线条，用于扩大点击区域 */}
                        <path d={d} fill="none" stroke="transparent" strokeWidth="20" />
                        {/* 实际显示的线条 */}
                        <path 
                            d={d} 
                            fill="none" 
                            stroke={isSelected ? "#f97316" : "#cbd5e1"} 
                            strokeWidth={isSelected ? "3" : "2"} 
                            markerEnd={`url(#${isSelected ? 'arrowhead-selected' : 'arrowhead'})`}
                            className="transition-colors duration-200"
                        />
                        {isSelected && (
                             <circle cx={(start.x + end.x)/2} cy={(start.y + end.y)/2} r="4" fill="#f97316" />
                        )}
                    </g>
                )
            })}

            {/* 正在拖拽的虚线 */}
            {tempConnection && (
                <path 
                    d={getEdgePath(tempConnection.start, tempConnection.end, tempConnection.startHandle)}
                    fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="5,5" 
                />
            )}
        </svg>
    );
};