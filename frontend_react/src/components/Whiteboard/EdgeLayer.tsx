// frontend_react/src/components/Whiteboard/EdgeLayer.tsx

import React from 'react';
import {HandlePosition, WhiteboardEdge, WhiteboardNode} from '../../types/whiteboard';
import {getEdgePath, getHandleCoords} from '../../utils/whiteboardUtils';

interface EdgeLayerProps {
    edges: WhiteboardEdge[];
    nodes: WhiteboardNode[];
    selectedEdgeId: string | null;
    onSelectEdge: (id: string) => void;
    // 修改：tempConnection 增加 targetHandle 可选字段
    tempConnection: {
        start: { x: number, y: number },
        end: { x: number, y: number },
        startHandle: HandlePosition,
        targetHandle?: HandlePosition
    } | null;
}

export const EdgeLayer: React.FC<EdgeLayerProps> = ({
                                                        edges, nodes, selectedEdgeId, onSelectEdge, tempConnection
                                                    }) => {
    return (
        <svg className="overflow-visible absolute top-0 left-0 w-full h-full z-0 pointer-events-none">
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8"/>
                </marker>
                <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#f97316"/>
                </marker>
                <marker id="arrowhead-temp" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#f97316"/>
                </marker>
            </defs>

            {edges.map(edge => {
                const sNode = nodes.find(n => n.id === edge.sourceId);
                const tNode = nodes.find(n => n.id === edge.targetId);
                if (!sNode || !tNode) return null;

                const start = getHandleCoords(sNode, edge.sourceHandle);
                const end = getHandleCoords(tNode, edge.targetHandle);

                // 修改：传入 edge.targetHandle 以计算正确的曲线方向
                const d = getEdgePath(start, end, edge.sourceHandle, edge.targetHandle);
                const isSelected = selectedEdgeId === edge.id;

                return (
                    <g key={edge.id} className="pointer-events-auto cursor-pointer group" onClick={(e) => {
                        e.stopPropagation();
                        onSelectEdge(edge.id);
                    }}>
                        {/* 透明粗线条，增加点击判定范围 */}
                        <path d={d} fill="none" stroke="transparent" strokeWidth="20"/>

                        {/* 实际显示的连线 */}
                        <path
                            d={d}
                            fill="none"
                            stroke={isSelected ? "#f97316" : "#cbd5e1"}
                            strokeWidth={isSelected ? "3" : "2"}
                            markerEnd={`url(#${isSelected ? 'arrowhead-selected' : 'arrowhead'})`}
                            className="transition-colors duration-200"
                        />

                        {/* 选中时显示中间的小圆点，方便识别 */}
                        {isSelected && (
                            // 注意：对于贝塞尔曲线，简单的中点计算可能不在线上，这里仅做简略显示
                            // 如果需要精确在线上，需要计算贝塞尔曲线的 t=0.5 处
                            <circle cx={(start.x + end.x) / 2} cy={(start.y + end.y) / 2} r="4" fill="#f97316"
                                    opacity="0.5"/>
                        )}
                    </g>
                )
            })}

            {/* 正在拖拽的连线 */}
            {tempConnection && (
                <path
                    // 修改：传入 tempConnection.targetHandle (如果吸附了就有，没吸附就无)
                    d={getEdgePath(tempConnection.start, tempConnection.end, tempConnection.startHandle, tempConnection.targetHandle)}
                    fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="5,5"
                    markerEnd="url(#arrowhead-temp)"
                />
            )}
        </svg>
    );
};
