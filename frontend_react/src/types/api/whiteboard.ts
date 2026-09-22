import type {WhiteboardDocument} from '../whiteboard';

export type WhiteboardPayload = Omit<WhiteboardDocument, 'id' | 'createdAt' | 'updatedAt'>;

export interface LegacyWhiteboardImportResult {
    importedCount: number;
    documents: WhiteboardDocument[];
}
