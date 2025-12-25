export type NodeType = 'article' | 'note' | 'shape';
export type ShapeType = 'rectangle' | 'circle' | 'diamond';
export type HandlePosition = 'top' | 'right' | 'bottom' | 'left';

export interface WhiteboardNode {
    id: string;
    type: NodeType;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    title?: string;
    content?: string;
    articleId?: string;
    color?: string;
    shapeType?: ShapeType;
    // 视觉风格字段
    rotation?: number;
}

export interface WhiteboardEdge {
    id: string;
    sourceId: string;
    targetId: string;
    sourceHandle: HandlePosition;
    targetHandle: HandlePosition;
}