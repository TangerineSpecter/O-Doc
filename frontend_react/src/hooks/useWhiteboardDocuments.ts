import {useCallback, useEffect, useMemo, useState} from 'react';
import {
    createWhiteboard,
    deleteWhiteboard,
    getWhiteboardDetail,
    getWhiteboardList,
    importLegacyWhiteboards,
    updateWhiteboard,
} from '../api/whiteboard';
import type {WhiteboardDocument, WhiteboardEdge, WhiteboardInsights, WhiteboardNode} from '../types/whiteboard';
import {normalizeDocument} from '../utils/whiteboardOps';

const LEGACY_STORAGE_KEY = 'odoc-whiteboards';
const LEGACY_BACKUP_KEY = 'odoc-whiteboards-legacy-backup-v1';
const LEGACY_MIGRATION_KEY = 'odoc-whiteboards-server-migrated-v1';

export interface SaveWhiteboardInput {
    title?: string;
    description?: string;
    nodes?: WhiteboardNode[];
    edges?: WhiteboardEdge[];
    viewOffset?: { x: number; y: number };
    scale?: number;
    insights?: WhiteboardInsights | null;
}

export type CreateWhiteboardInput = SaveWhiteboardInput;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const readLegacyDocuments = (): WhiteboardDocument[] => {
    try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((item): item is Partial<WhiteboardDocument> & {id: string} => Boolean(item?.id)).map(normalizeDocument)
            : [];
    } catch (error) {
        console.warn('Failed to read legacy whiteboards', error);
        return [];
    }
};

const migrateLegacyDocuments = async () => {
    if (localStorage.getItem(LEGACY_MIGRATION_KEY)) return;
    const legacyDocuments = readLegacyDocuments();
    if (legacyDocuments.length > 0) {
        await importLegacyWhiteboards(legacyDocuments);
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) localStorage.setItem(LEGACY_BACKUP_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    localStorage.setItem(LEGACY_MIGRATION_KEY, '1');
};

export function useWhiteboardDocuments() {
    const [documents, setDocuments] = useState<WhiteboardDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refreshDocuments = useCallback(async () => {
        const next = await getWhiteboardList();
        setDocuments(next.map(normalizeDocument));
    }, []);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                await migrateLegacyDocuments();
                if (active) await refreshDocuments();
            } catch (error) {
                console.error('Failed to load whiteboards', error);
            } finally {
                if (active) setIsLoading(false);
            }
        };
        void load();
        return () => {
            active = false;
        };
    }, [refreshDocuments]);

    const sortedDocuments = useMemo(
        () => [...documents].sort((a, b) => b.updatedAt - a.updatedAt),
        [documents]
    );

    const getDocument = useCallback(async (id?: string) => {
        if (!id) return null;
        const document = normalizeDocument(await getWhiteboardDetail(id));
        setDocuments(current => {
            const index = current.findIndex(item => item.id === document.id);
            if (index === -1) return [document, ...current];
            return current.map(item => item.id === document.id ? document : item);
        });
        return document;
    }, []);

    const createDocument = useCallback(async (input: CreateWhiteboardInput = {}) => {
        const document = normalizeDocument(await createWhiteboard({
            ...input,
            title: input.title?.trim() || '未命名白板',
            description: input.description?.trim() || '',
            nodes: input.nodes ? clone(input.nodes) : undefined,
            edges: input.edges ? clone(input.edges) : undefined,
            viewOffset: input.viewOffset ? {...input.viewOffset} : undefined,
            insights: input.insights ? clone(input.insights) : undefined,
        }));
        setDocuments(current => [document, ...current]);
        return document;
    }, []);

    const updateDocument = useCallback(async (id: string, patch: SaveWhiteboardInput) => {
        const document = normalizeDocument(await updateWhiteboard(id, {
            ...patch,
            nodes: patch.nodes ? clone(patch.nodes) : undefined,
            edges: patch.edges ? clone(patch.edges) : undefined,
            viewOffset: patch.viewOffset ? {...patch.viewOffset} : undefined,
            insights: patch.insights === undefined ? undefined : patch.insights ? clone(patch.insights) : null,
        }));
        setDocuments(current => current.map(item => item.id === document.id ? document : item));
        return document;
    }, []);

    const deleteDocument = useCallback(async (id: string) => {
        await deleteWhiteboard(id);
        setDocuments(current => current.filter(document => document.id !== id));
    }, []);

    const duplicateDocument = useCallback(async (id: string) => {
        const source = documents.find(document => document.id === id) || await getDocument(id);
        if (!source) return null;
        return createDocument({
            title: `${source.title} 副本`,
            description: source.description,
            nodes: clone(source.nodes),
            edges: clone(source.edges),
            viewOffset: source.viewOffset,
            scale: source.scale,
            insights: source.insights || null,
        });
    }, [createDocument, documents, getDocument]);

    return {documents: sortedDocuments, isLoading, getDocument, createDocument, updateDocument, deleteDocument, duplicateDocument, refreshDocuments};
}
