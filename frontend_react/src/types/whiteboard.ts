export type NodeType = 'article' | 'note' | 'shape' | 'text';
export type ShapeType = 'rectangle' | 'circle' | 'diamond';
export type HandlePosition = 'top' | 'right' | 'bottom' | 'left';
export type EdgeStyle = 'solid' | 'dashed';
export type WhiteboardTool = 'select' | 'pan' | 'note' | 'text' | 'shape' | 'connect';

export interface NoteColorOption {
    id: string;
    value: string;
    ink: string;
    label: string;
}

export const NOTE_COLOR_OPTIONS: NoteColorOption[] = [
    {id: 'amber', value: '#fde68a', ink: '#92400e', label: '琥珀'},
    {id: 'peach', value: '#fed7aa', ink: '#9a3412', label: '蜜桃'},
    {id: 'mint', value: '#bbf7d0', ink: '#166534', label: '薄荷'},
    {id: 'sky', value: '#bae6fd', ink: '#075985', label: '晴空'},
    {id: 'lavender', value: '#ddd6fe', ink: '#5b21b6', label: '薰衣草'},
    {id: 'rose', value: '#fecdd3', ink: '#9f1239', label: '玫瑰'},
];

export const DEFAULT_NOTE_COLOR = NOTE_COLOR_OPTIONS[0].value;

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
    rotation?: number;
    label?: string;
}

export interface WhiteboardEdge {
    id: string;
    sourceId: string;
    targetId: string;
    sourceHandle: HandlePosition;
    targetHandle: HandlePosition;
    style?: EdgeStyle;
    label?: string;
}

export interface WhiteboardDocument {
    id: string;
    title: string;
    description?: string;
    nodes: WhiteboardNode[];
    edges: WhiteboardEdge[];
    viewOffset: { x: number; y: number };
    scale: number;
    createdAt: number;
    updatedAt: number;
}

export interface WhiteboardViewport {
    width: number;
    height: number;
}

export interface ViewTransform {
    viewOffset: { x: number; y: number };
    scale: number;
}
