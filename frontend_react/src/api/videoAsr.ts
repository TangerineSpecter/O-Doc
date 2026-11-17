import request from '../utils/request';
import type {VideoASRStatus} from '../types/api/videoAsr';

export const getVideoASRStatus = (): Promise<VideoASRStatus> => request.get('/settings/video-asr-model/');
export const downloadVideoASRModel = (): Promise<VideoASRStatus> => request.post('/settings/video-asr-model/');
