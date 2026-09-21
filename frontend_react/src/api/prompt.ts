import request from '../utils/request';
import type {PromptFilters, PromptListResponse, PromptTaxonomies, PromptTemplate, PromptTemplateInput, PromptTrash, PromptUsage} from '../types/api/prompt';

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
