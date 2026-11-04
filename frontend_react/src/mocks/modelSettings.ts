import type {AIModel, AIProvider, ModelType, ReasoningEffort, SystemAIConfig, ThinkingCapability, ThinkingProtocol} from '../types/api/setting';

const nativeEfforts: Record<string, Exclude<ReasoningEffort, 'default'>[]> = {
    'gpt-6.1-terra': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-6-sol': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-6-luna': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-6.1-sol': ['low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-6-astra': ['low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-5.1': ['none', 'low', 'medium', 'high'],
    'gpt-5.2': ['none', 'low', 'medium', 'high', 'xhigh'],
};

function capability(provider: AIProvider, name: string, type: ModelType, selected: ThinkingProtocol): ThinkingCapability {
    const manual = ['NewAPI', 'custom'].includes(provider.type);
    const efforts = provider.type === 'OpenAi' ? nativeEfforts[name.toLowerCase()] || [] : [];
    const eligible = ['chat', 'image'].includes(type);
    const manualSupported = manual && ['thinking', 'enable_thinking', 'adaptive', 'reasoning_effort'].includes(selected);
    const supported = eligible && (efforts.length > 0 && ['auto', 'reasoning_effort'].includes(selected) || manualSupported);
    return {supported, protocol: supported ? (manual ? selected : 'reasoning_effort') : 'unsupported', manualProtocol: eligible && manual,
        reason: supported ? '此模型支持单独配置思考模式。' : '此模型的思考能力尚未确认，暂不提供开关。', enabledEffort: 'medium', effortOptions: supported ? efforts : []};
}

const provider: AIProvider = {id: 'local-provider', name: '本地样例（不发起模型请求）', type: 'OpenAi', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: []};
provider.models = [
    {id: 'local-model', name: '本地样例模型', type: 'chat', thinkingMode: 'default', thinkingProtocol: 'auto', reasoningEffort: 'default'},
    {id: 'local-openai-terra', name: 'gpt-6.1-terra', type: 'chat', thinkingMode: 'default', thinkingProtocol: 'auto', reasoningEffort: 'default'},
    {id: 'local-openai-image', name: 'gpt-image-2.5-flare', type: 'image_generation', thinkingMode: 'default', thinkingProtocol: 'auto', reasoningEffort: 'default'},
].map(model => ({...model, thinkingCapability: capability(provider, model.name, model.type as ModelType, 'auto')} as AIModel));
const providers: AIProvider[] = [provider];
let systemConfig: SystemAIConfig = {defaultChatModelId: 'local-model', simpleChatModelId: 'local-model',
    defaultImageModelId: '', defaultImageGenerationModelId: '', defaultEmbeddingModelId: '', defaultRerankModelId: ''};
let sequence = 0;
const failure = (message: string, status = 400) => Response.json({code: status, msg: message, data: null}, {status});

export async function resolveModelSettingsRoute(request: Request, empty = false): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    if (path === '/api/settings/providers/' && method === 'GET') return empty ? [] : providers;
    if (path === '/api/settings/providers/' && method === 'POST') {
        const body = await request.json() as Partial<AIProvider>;
        const row: AIProvider = {id: `local-provider-${++sequence}`, name: body.name || '本地服务商', type: body.type || 'OpenAi', baseUrl: body.baseUrl || '', apiKey: body.apiKey || '', models: []};
        providers.push(row); return row;
    }
    if (path === '/api/settings/providers/fetch_favicon/' && method === 'GET') {
        const raw = url.searchParams.get('url') || '';
        try {const origin = new URL(raw.includes('://') ? raw : `https://${raw}`).origin; return {origin, faviconUrl: `${origin}/favicon.ico`};} catch {return failure('无效的 URL');}
    }
    const matchProvider = path.match(/^\/api\/settings\/providers\/([^/]+)\/(?:([^/]+)\/)?$/);
    if (matchProvider) {
        const row = providers.find(item => item.id === decodeURIComponent(matchProvider[1]));
        if (!row) return failure('服务商不存在', 404);
        if (matchProvider[2] === 'thinking_capability' && method === 'GET') return capability(row, url.searchParams.get('name') || '', (url.searchParams.get('type') || 'chat') as ModelType, (url.searchParams.get('protocol') || 'auto') as ThinkingProtocol);
        if (!matchProvider[2] && method === 'GET') return row;
        if (!matchProvider[2] && method === 'PUT') {Object.assign(row, await request.json(), {id: row.id}); return row;}
        if (!matchProvider[2] && method === 'DELETE') {providers.splice(providers.indexOf(row), 1); return null;}
    }
    if (path === '/api/settings/models/' && method === 'POST') {
        const body = await request.json() as AIModel & {provider: string};
        const row = providers.find(item => item.id === body.provider);
        if (!row || !body.name) return failure('请选择服务商并填写模型 ID');
        const model = {...body, id: `local-model-${++sequence}`, thinkingCapability: capability(row, body.name, body.type, body.thinkingProtocol || 'auto')};
        row.models.push(model); return model;
    }
    const matchModel = path.match(/^\/api\/settings\/models\/([^/]+)\/(?:([^/]+)\/)?$/);
    if (matchModel) {
        const row = providers.find(item => item.models.some(model => model.id === decodeURIComponent(matchModel[1])));
        const model = row?.models.find(item => item.id === decodeURIComponent(matchModel[1]));
        if (!row || !model) return failure('模型不存在', 404);
        if (matchModel[2] === 'test_connection' && method === 'POST') return {ok: true, modelId: model.id, modelName: model.name, modelType: model.type, providerName: row.name, elapsedMs: 0, simulated: true, detail: '本地模拟，未连接真实服务'};
        if (!matchModel[2] && method === 'GET') return model;
        if (!matchModel[2] && method === 'PATCH') {
            Object.assign(model, await request.json(), {id: model.id});
            model.thinkingCapability = capability(row, model.name, model.type, model.thinkingProtocol || 'auto');
            return model;
        }
        if (!matchModel[2] && method === 'DELETE') {row.models.splice(row.models.indexOf(model), 1); return null;}
    }
    if (path === '/api/settings/config/get_ai_config/' && method === 'GET') return {...systemConfig};
    if (path === '/api/settings/config/save_ai_config/' && method === 'POST') {
        systemConfig = {...systemConfig, ...await request.json() as Partial<SystemAIConfig>};
        return null;
    }
    return undefined;
}
