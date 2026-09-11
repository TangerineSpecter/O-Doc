import request from '../utils/request';
import type {
    DailyReviewPayload,
    HealthIssueIdentity,
    HealthPayload,
    HealthQuery,
    MaintenanceOverview,
    ReviewStatus,
} from '../types/api/maintenance';


export const getMaintenanceOverview = () => request.get<unknown, MaintenanceOverview>('/maintenance/overview');

export const getDailyReview = (date?: string) => request.get<unknown, DailyReviewPayload>(
    '/maintenance/reviews',
    {params: date ? {date} : undefined},
);

export const updateDailyReviewItem = (itemId: string, status: ReviewStatus) => (
    request.put<unknown, DailyReviewPayload>(`/maintenance/reviews/items/${itemId}`, {status})
);

export const refreshDailyReview = () => request.post<unknown, DailyReviewPayload>('/maintenance/reviews/refresh');

export const getHealthCheck = (params?: HealthQuery) => request.get<unknown, HealthPayload>(
    '/maintenance/health',
    {params},
);

export const ignoreHealthIssue = (identity: HealthIssueIdentity & {fingerprint: string}) => (
    request.post<unknown, HealthPayload>('/maintenance/health/ignore', identity)
);

export const unignoreHealthIssue = (identity: HealthIssueIdentity) => (
    request.delete<unknown, void>('/maintenance/health/ignore', {data: identity})
);

