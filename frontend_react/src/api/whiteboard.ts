import request from '../utils/request';
import type {WhiteboardDocument, WhiteboardInsights} from '../types/whiteboard';
import type {LegacyWhiteboardImportResult, WhiteboardPayload} from '../types/api/whiteboard';

export const getWhiteboardList = () => request.get<any, WhiteboardDocument[]>('/whiteboard/list');
export const getWhiteboardDetail = (whiteboardId: string) => request.get<any, WhiteboardDocument>(`/whiteboard/detail/${whiteboardId}`);
export const createWhiteboard = (payload: Partial<WhiteboardPayload>) => request.post<any, WhiteboardDocument>('/whiteboard/create', payload);
export const updateWhiteboard = (whiteboardId: string, payload: Omit<Partial<WhiteboardPayload>, 'insights'> & {insights?: WhiteboardInsights | null}) => request.put<any, WhiteboardDocument>(`/whiteboard/update/${whiteboardId}`, payload);
export const deleteWhiteboard = (whiteboardId: string) => request.delete<any, void>(`/whiteboard/delete/${whiteboardId}`);
export const importLegacyWhiteboards = (documents: WhiteboardDocument[]) => request.post<any, LegacyWhiteboardImportResult>('/whiteboard/import_legacy', {documents});
