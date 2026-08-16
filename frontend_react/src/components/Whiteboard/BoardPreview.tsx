import React from 'react';
import type {WhiteboardDocument} from '../../types/whiteboard';
import {getNodesBounds} from '../../utils/whiteboardOps';
import {getHandleCoords} from '../../utils/whiteboardUtils';

interface BoardPreviewProps {
    document: WhiteboardDocument;
}

const fillFor = (type: string, color?: string) => {
    if (type === 'note') return color || '#fde68a';
    if (type === 'text') return '#ffffff';
    if (type === 'article') return '#ffffff';
    return '#e2e8f0';
};

export const BoardPreview: React.FC<BoardPreviewProps> = ({document}) => {
    const nodes = document.nodes || [];
    const edges = document.edges || [];
    const bounds = getNodesBounds(nodes);

    if (!bounds || nodes.length === 0) {
        return (
            <div className="relative h-full w-full overflow-hidden bg-[#f0f2f5]">
                <PaperTexture/>
                <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">
                    空白画布
                </div>
            </div>
        );
    }

    const pad = 48;
    const viewW = Math.max(bounds.width + pad * 2, 160);
    const viewH = Math.max(bounds.height + pad * 2, 100);
    const minX = bounds.minX - pad;
    const minY = bounds.minY - pad;

    return (
        <div className="relative h-full w-full overflow-hidden bg-[#f0f2f5]">
            <PaperTexture/>
            <svg
                viewBox={`${minX} ${minY} ${viewW} ${viewH}`}
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="xMidYMid meet"
            >
                {edges.map(edge => {
                    const source = nodes.find(node => node.id === edge.sourceId);
                    const target = nodes.find(node => node.id === edge.targetId);
                    if (!source || !target) return null;
                    const start = getHandleCoords(source, edge.sourceHandle);
                    const end = getHandleCoords(target, edge.targetHandle);
                    return (
                        <line
                            key={edge.id}
                            x1={start.x}
                            y1={start.y}
                            x2={end.x}
                            y2={end.y}
                            stroke="#cbd5e1"
                            strokeWidth={Math.max(viewW, viewH) / 180}
                            strokeDasharray={edge.style === 'dashed' ? '8 6' : undefined}
                        />
                    );
                })}
                {nodes.map(node => {
                    const common = {
                        x: node.x,
                        y: node.y,
                        width: node.width,
                        height: node.height,
                        fill: fillFor(node.type, node.color),
                        stroke: node.type === 'article' ? '#94a3b8' : '#cbd5e1',
                        strokeWidth: Math.max(viewW, viewH) / 260,
                    };
                    if (node.type === 'shape' && node.shapeType === 'circle') {
                        return (
                            <ellipse
                                key={node.id}
                                cx={node.x + node.width / 2}
                                cy={node.y + node.height / 2}
                                rx={node.width / 2}
                                ry={node.height / 2}
                                fill={common.fill}
                                stroke={common.stroke}
                                strokeWidth={common.strokeWidth}
                            />
                        );
                    }
                    if (node.type === 'shape' && node.shapeType === 'diamond') {
                        const cx = node.x + node.width / 2;
                        const cy = node.y + node.height / 2;
                        const points = [
                            `${cx},${node.y}`,
                            `${node.x + node.width},${cy}`,
                            `${cx},${node.y + node.height}`,
                            `${node.x},${cy}`,
                        ].join(' ');
                        return (
                            <polygon
                                key={node.id}
                                points={points}
                                fill={common.fill}
                                stroke={common.stroke}
                                strokeWidth={common.strokeWidth}
                            />
                        );
                    }
                    return (
                        <rect
                            key={node.id}
                            {...common}
                            rx={node.type === 'note' ? 4 : 10}
                        />
                    );
                })}
            </svg>
        </div>
    );
};

function PaperTexture() {
    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{
                backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                backgroundSize: '14px 14px',
            }}
        />
    );
}
