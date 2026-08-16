import React from 'react';
import type {WhiteboardEdge, WhiteboardNode} from '../../types/whiteboard';
import {getEdgeLabelPoint, getEdgePath, getHandleCoords} from '../../utils/whiteboardUtils';

interface EdgeLayerProps {
    edges: WhiteboardEdge[];
    nodes: WhiteboardNode[];
    selectedEdgeId: string | null;
    onSelectEdge: (id: string) => void;
    tempPathRef?: React.Ref<SVGPathElement>;
}

export const EdgeLayer: React.FC<EdgeLayerProps> = ({
    edges, nodes, selectedEdgeId, onSelectEdge, tempPathRef
}) => {
    const nodeById = new Map(nodes.map(node => [node.id, node]));

    return (
        <svg className="overflow-visible absolute top-0 left-0 w-[1px] h-[1px] z-0 pointer-events-none">
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
                const sNode = nodeById.get(edge.sourceId);
                const tNode = nodeById.get(edge.targetId);
                if (!sNode || !tNode) return null;

                const start = getHandleCoords(sNode, edge.sourceHandle);
                const end = getHandleCoords(tNode, edge.targetHandle);
                const d = getEdgePath(start, end, edge.sourceHandle, edge.targetHandle);
                const isSelected = selectedEdgeId === edge.id;
                const labelPoint = getEdgeLabelPoint(start, end, edge.sourceHandle, edge.targetHandle);
                const dashed = edge.style === 'dashed';

                return (
                    <g
                        key={edge.id}
                        className="pointer-events-auto cursor-pointer group"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelectEdge(edge.id);
                        }}
                    >
                        <path data-edge-hit={edge.id} d={d} fill="none" stroke="transparent" strokeWidth="20"/>
                        <path
                            data-edge-line={edge.id}
                            d={d}
                            fill="none"
                            stroke={isSelected ? '#f97316' : '#cbd5e1'}
                            strokeWidth={isSelected ? 2.8 : 2}
                            strokeDasharray={dashed ? '9 7' : undefined}
                            markerEnd={`url(#${isSelected ? 'arrowhead-selected' : 'arrowhead'})`}
                            strokeLinecap="round"
                        />
                        {edge.label ? (
                            <g data-edge-label={edge.id} transform={`translate(${labelPoint.x} ${labelPoint.y})`}>
                                <rect
                                    x={-Math.max(18, edge.label.length * 6)}
                                    y={-10}
                                    width={Math.max(36, edge.label.length * 12)}
                                    height={20}
                                    rx={8}
                                    fill="#f8fafc"
                                    stroke={isSelected ? '#fdba74' : '#e2e8f0'}
                                />
                                <text
                                    x={0}
                                    y={4}
                                    textAnchor="middle"
                                    fill={isSelected ? '#c2410c' : '#64748b'}
                                    fontSize="11"
                                    fontWeight="600"
                                >
                                    {edge.label}
                                </text>
                            </g>
                        ) : isSelected ? (
                            <circle data-edge-label={edge.id} cx={labelPoint.x} cy={labelPoint.y} r="4" fill="#f97316" opacity="0.5"/>
                        ) : null}
                    </g>
                );
            })}

            <path
                ref={tempPathRef}
                d="M 0 0 L 0 0"
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
                strokeDasharray="5,5"
                markerEnd="url(#arrowhead-temp)"
                style={{display: 'none'}}
            />
        </svg>
    );
};
