import request from '../utils/request';
import type {ArticleIllustrationResponse, ImageGenerationRequestOptions, ImageGenerationSettings, PendingArticleIllustration, PromptFilters, PromptGenerationResponse, PromptListResponse, PromptTaxonomies, PromptTemplate, PromptTemplateInput, PromptTrash, PromptUsage} from '../types/api/prompt';

export type {PromptField, PromptFieldOption, PromptFilters, PromptTaxonomies, PromptTemplate, PromptTemplateInput, PromptType, PromptUsage} from '../types/api/prompt';

export const getPromptTemplates = (params: PromptFilters = {}) => request.get<any, PromptListResponse>('/prompt/templates', {
  params: {keyword: params.keyword, type: params.type, category_id: params.categoryId, theme_id: params.themeIds, tag_id: params.tagIds, favorite: params.favorite, ordering: params.ordering},
});
export const getPromptTemplate = (id: string) => request.get<any, PromptTemplate>(`/prompt/templates/${id}`);
export const createPromptTemplate = (data: PromptTemplateInput) => request.post<any, PromptTemplate>('/prompt/templates', data);
export const updatePromptTemplate = (id: string, data: Partial<PromptTemplateInput>) => request.put<any, PromptTemplate>(`/prompt/templates/${id}`, data);
export const deletePromptTemplate = (id: string) => request.delete<any, void>(`/prompt/templates/${id}`);
export const restorePromptTemplate = (id: string) => request.post<any, PromptTemplate>(`/prompt/templates/${id}/restore`);
export const purgePromptTemplate = (id: string) => request.delete<any, void>(`/prompt/templates/${id}/purge`);
export const setPromptCover = (id: string, imageId: string | null) => request.put<any, PromptTemplate>(`/prompt/templates/${id}/cover`, {imageId});
export const createPromptUsage = (id: string, data: {inputValues: Record<string, unknown>; assetIds: string[]; modelName?: string; note?: string; sourceUrl?: string}) => request.post<any, PromptUsage>(`/prompt/templates/${id}/usages`, data);
export const generatePromptImage = (id: string, inputValues: Record<string, unknown>, signal?: AbortSignal) =>
  request.post<unknown, PromptGenerationResponse>(`/prompt/templates/${id}/generate`, {inputValues}, {signal, timeout: 150_000});
export const getPromptGenerationResult = (id: string, taskToken: string, signal?: AbortSignal) =>
  request.post<unknown, PromptGenerationResponse>(`/prompt/templates/${id}/generate/result`, {taskToken}, {signal, timeout: 90_000});
export const getArticleIllustrationGenerationSettings = () =>
  request.get<unknown, ImageGenerationSettings>('/prompt/article-illustration/options');
export const generateArticleIllustration = (selectedText: string, generationOptions: ImageGenerationRequestOptions, signal?: AbortSignal) =>
  request.post<unknown, ArticleIllustrationResponse>('/prompt/article-illustration/generate', {selectedText, generationOptions}, {signal, timeout: 150_000});
export const getArticleIllustrationResult = (taskToken: string, signal?: AbortSignal) =>
  request.post<unknown, ArticleIllustrationResponse>('/prompt/article-illustration/result', {taskToken}, {signal, timeout: 90_000});
export const getPendingArticleIllustrations = () =>
  request.get<unknown, PendingArticleIllustration[]>('/prompt/article-illustration/pending');
export const retryPendingArticleIllustration = (pendingId: string) =>
  request.post<unknown, ArticleIllustrationResponse>(`/prompt/article-illustration/pending/${pendingId}`, {}, {timeout: 90_000});
export const discardPendingArticleIllustration = (pendingId: string) =>
  request.delete<unknown, void>(`/prompt/article-illustration/pending/${pendingId}`);
export const deletePromptUsage = (id: string) => request.delete<any, void>(`/prompt/usages/${id}`);
export const restorePromptUsage = (id: string) => request.post<any, PromptUsage>(`/prompt/usages/${id}/restore`);
export const purgePromptUsage = (id: string) => request.delete<any, void>(`/prompt/usages/${id}/purge`);
export const getPromptTrash = () => request.get<any, PromptTrash>('/prompt/trash');
export const getPromptTaxonomy = async (): Promise<PromptTaxonomies> => {
  const [categories, themes, tags] = await Promise.all(['categories', 'themes', 'tags'].map(kind => request.get<any, PromptTaxonomies[keyof PromptTaxonomies]>(`/prompt/${kind}`)));
  return {categories, themes, tags};
};
export const createPromptTaxonomy = (kind: keyof PromptTaxonomies, data: Partial<PromptTaxonomies[keyof PromptTaxonomies][number]>) => request.post<any, PromptTaxonomies[keyof PromptTaxonomies][number]>(`/prompt/${kind}`, data);
export const updatePromptTaxonomy = (kind: keyof PromptTaxonomies, id: string, data: Partial<PromptTaxonomies[keyof PromptTaxonomies][number]>) => request.put<any, PromptTaxonomies[keyof PromptTaxonomies][number]>(`/prompt/${kind}/${id}`, data);
export const deletePromptTaxonomy = (kind: keyof PromptTaxonomies, id: string) => request.delete<any, void>(`/prompt/${kind}/${id}`);
