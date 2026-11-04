import type {ModelType} from '../../types/api/setting';

// Curated from OpenAI's public API catalog, not an account-access guarantee.
const textModels = [
    {value: 'gpt-6.1-terra', label: 'GPT-6.1 Terra'},
    {value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol'},
    {value: 'gpt-6-astra', label: 'GPT-6 Astra'},
    {value: 'gpt-6-sol', label: 'GPT-6 Sol'},
    {value: 'gpt-6-luna', label: 'GPT-6 Luna'},
    {value: 'gpt-5.2', label: 'GPT-5.2'},
    {value: 'gpt-5.1', label: 'GPT-5.1'},
];

export const OPENAI_MODEL_OPTIONS: Record<ModelType, {value: string; label: string}[]> = {
    chat: textModels,
    image: textModels,
    image_generation: [
        {value: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst'},
        {value: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare'},
        {value: 'gpt-image-2', label: 'GPT Image 2'},
        {value: 'gpt-image-1.5', label: 'GPT Image 1.5（即将停用）'},
        {value: 'gpt-image-1-mini', label: 'GPT Image 1 Mini（即将停用）'},
    ],
    embedding: [
        {value: 'text-embedding-3-large', label: 'Text Embedding 3 Large'},
        {value: 'text-embedding-3-small', label: 'Text Embedding 3 Small'},
    ],
    rerank: [],
};
