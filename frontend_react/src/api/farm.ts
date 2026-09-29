import request from '../utils/request';
import type {FarmSummary, FarmState, FarmRules, FarmAppearance, FarmOperation, CropKind, CropRule} from '../types/api/farm';
const base = '/settings/agent-world';
export const getFarms = (signal?: AbortSignal) => request.get<never, FarmSummary[]>(`${base}/farms/`, {signal});
export const getFarm = (id: string, signal?: AbortSignal) => request.get<never, FarmState>(`${base}/farms/${encodeURIComponent(id)}/`, {signal});
export const getFarmHistory = (id: string, signal?: AbortSignal) => request.get<never, FarmOperation[]>(`${base}/farms/${encodeURIComponent(id)}/history/`, {signal});
export const getFarmRules = () => request.get<never, FarmRules>(`${base}/farm-catalog/`);
export const saveFarmRules = (rules: FarmRules) => request.patch<never, FarmRules>(`${base}/farm-catalog/`, {rules});
export const saveCropRule = (kind: CropKind, rule: Pick<CropRule, 'growthSeconds' | 'seedPrice' | 'yield' | 'salePrice'>) =>
    request.patch<never, CropRule>(`${base}/farm-catalog/crops/${encodeURIComponent(kind)}/`, rule);
export const saveFarmAppearance = (id: string, appearance: FarmAppearance) => request.patch<never, FarmAppearance>(`${base}/farms/${encodeURIComponent(id)}/`, {appearance});
