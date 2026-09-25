export type PromptType = 'image' | 'html_report' | 'general';
export type PromptFieldType = 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'boolean';

export interface PromptFieldOption { label: string; value: string; }
export interface PromptField {
  key: string;
  label: string;
  type: PromptFieldType;
  required: boolean;
  defaultValue: string | string[] | boolean;
  placeholder: string;
  options?: PromptFieldOption[];
  separator?: string;
  trueValue?: string;
  falseValue?: string;
}

export interface PromptTaxonomy { id: string; name: string; description: string; color: string; sort: number; isValid: boolean; }
export interface PromptResultImage { id: string; assetId: string; imageUrl: string; caption: string; sort: number; createdAt: string; }
export interface PromptUsage {
  id: string; inputValues: Record<string, string | string[] | boolean>; renderedPositive: string; renderedNegative: string;
  modelName: string; note: string; sourceUrl: string; isValid: boolean; deletedAt?: string | null; createdAt: string; resultImages: PromptResultImage[];
}
export interface PromptGenerationResponse {
  status: 'pending' | 'succeeded';
  taskToken?: string;
  usage?: PromptUsage;
}
export interface ArticleIllustrationAsset { id: string; imageUrl: string; }
export interface ImageGenerationOption { value: string; label: string; }
export interface ImageGenerationSettings {
  provider: string;
  modelName: string;
  mode: 'image_size' | 'pixel_dimensions' | 'fixed' | 'automatic';
  aspectRatioOptions: ImageGenerationOption[];
  imageSizeOptions: ImageGenerationOption[];
  imageSizeOptionsByAspectRatio: Record<string, ImageGenerationOption[]>;
  defaultAspectRatio: string;
  defaultImageSize: string;
  customDimensions: {
    enabled: boolean;
    maxEdge: number;
    step: number;
    minPixels: number;
    maxPixels: number;
    maxAspectRatio: number;
  };
  description: string;
}
export interface ImageGenerationRequestOptions {
  aspectRatio?: string;
  imageSize?: string;
  customDimensions?: { width: number; height: number };
}
export interface ArticleIllustrationResponse {
  status: 'pending' | 'download_pending' | 'succeeded';
  taskToken?: string;
  pendingId?: string;
  asset?: ArticleIllustrationAsset;
}
export interface PendingArticleIllustration {
  id: string;
  status: 'generating' | 'download_pending';
  imageUrl: string;
  previewAllowed: boolean;
  errorMessage: string;
  createdAt: string;
}
export interface PromptTemplate {
  id: string; title: string; description: string; promptType: PromptType; positiveTemplate: string; negativeTemplate: string;
  fieldSchemaVersion: number; fieldSchema: PromptField[]; category: PromptTaxonomy | null; themes: PromptTaxonomy[]; tags: PromptTaxonomy[];
  isFavorite: boolean; coverImage: PromptResultImage | null; latestUsage: PromptUsage | null; isValid: boolean; deletedAt?: string | null;
  createdAt: string; updatedAt: string; usages?: PromptUsage[];
}
export interface PromptTemplateInput {
  title: string; description: string; promptType: PromptType; positiveTemplate: string; negativeTemplate: string;
  fieldSchema: PromptField[]; categoryId?: string | null; themeIds: string[]; tagIds: string[]; isFavorite: boolean;
}
export interface PromptListResponse { list: PromptTemplate[]; total: number; page: number; pageSize: number; hasMore: boolean; }
export interface PromptFilters { keyword?: string; type?: PromptType; categoryId?: string; themeIds?: string[]; tagIds?: string[]; favorite?: boolean; ordering?: 'updated' | 'created' | 'title'; }
export interface PromptTaxonomies { categories: PromptTaxonomy[]; themes: PromptTaxonomy[]; tags: PromptTaxonomy[]; }
export interface PromptTrash { templates: PromptTemplate[]; usages: PromptUsage[]; }
