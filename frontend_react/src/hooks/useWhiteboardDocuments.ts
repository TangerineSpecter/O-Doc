import {useCallback, useMemo, useState} from 'react';
import {WhiteboardDocument, WhiteboardEdge, WhiteboardNode} from '../types/whiteboard';
import {normalizeDocument} from '../utils/whiteboardOps';

const STORAGE_KEY = 'odoc-whiteboards';

const createId = () => `wb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const readDocuments = (): WhiteboardDocument[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((item): item is Partial<WhiteboardDocument> & {id: string} => Boolean(item?.id)).map(normalizeDocument)
            : [];
    } catch (error) {
        console.warn('Failed to read whiteboards', error);
        return [];
    }
};

const writeDocuments = (documents: WhiteboardDocument[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
};

export interface CreateWhiteboardInput {
    title?: string;
    description?: string;
}

export interface SaveWhiteboardInput {
    title?: string;
    description?: string;
    nodes?: WhiteboardNode[];
    edges?: WhiteboardEdge[];
    viewOffset?: { x: number; y: number };
    scale?: number;
}

export function createWhiteboardDocument(input: CreateWhiteboardInput = {}): WhiteboardDocument {
    const now = Date.now();
    return {
        id: createId(),
        title: input.title?.trim() || '未命名白板',
        description: input.description?.trim() || '',
        nodes: [],
        edges: [],
        viewOffset: {x: 80, y: 80},
        scale: 1,
        createdAt: now,
        updatedAt: now
    };
}

export function useWhiteboardDocuments() {
    const [documents, setDocuments] = useState<WhiteboardDocument[]>(() => readDocuments());

    const persist = useCallback((updater: (current: WhiteboardDocument[]) => WhiteboardDocument[]) => {
        setDocuments(current => {
            const next = updater(current);
            writeDocuments(next);
            return next;
        });
    }, []);

    const sortedDocuments = useMemo(
        () => [...documents].sort((a, b) => b.updatedAt - a.updatedAt),
        [documents]
    );

    const getDocument = useCallback(
        (id?: string) => documents.find(document => document.id === id) || null,
        [documents]
    );

    const createDocument = useCallback((input: CreateWhiteboardInput = {}) => {
        const document = createWhiteboardDocument(input);
        persist(current => [document, ...current]);
        return document;
    }, [persist]);

    const updateDocument = useCallback((id: string, patch: SaveWhiteboardInput) => {
        const updatedAt = Date.now();
        let saved: WhiteboardDocument | null = null;

        persist(current => current.map(document => {
            if (document.id !== id) return document;
            saved = {
                ...document,
                ...patch,
                title: patch.title !== undefined ? patch.title.trim() || '未命名白板' : document.title,
                description: patch.description !== undefined ? patch.description.trim() : document.description,
                nodes: patch.nodes ? clone(patch.nodes) : document.nodes,
                edges: patch.edges ? clone(patch.edges) : document.edges,
                viewOffset: patch.viewOffset ? {...patch.viewOffset} : document.viewOffset,
                scale: patch.scale ?? document.scale,
                updatedAt
            };
            return saved;
        }));

        return saved;
    }, [persist]);

    const deleteDocument = useCallback((id: string) => {
        persist(current => current.filter(document => document.id !== id));
    }, [persist]);

    const duplicateDocument = useCallback((id: string) => {
        const source = documents.find(document => document.id === id);
        if (!source) return null;

        const now = Date.now();
        const duplicate: WhiteboardDocument = {
            ...clone(source),
            id: createId(),
            title: `${source.title} 副本`,
            createdAt: now,
            updatedAt: now
        };
        persist(current => [duplicate, ...current]);
        return duplicate;
    }, [documents, persist]);

    return {
        documents: sortedDocuments,
        getDocument,
        createDocument,
        updateDocument,
        deleteDocument,
        duplicateDocument
    };
}
