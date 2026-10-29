import {seedDemoEntry} from './demoSeed';
import {resolveStudyRoute} from './studies';
import {resolveMT4Route} from '../mt4/routes';
import {resolveConnectorRoute} from './connectors';
import {resolveValidationRoute} from './validations';
import {validateMockAudit,mockNativeReviewEvidence,mockNativeContinuationFault} from './nativeReviews';
import {resolveNativePython} from './nativePython';
import {supplementMockSource} from './sourceSupplements';
import {resolveStrategyExport} from './strategyExports';
import {resolveVocabularyRoute} from './vocabulary';
import {workflowEvidence, interruptWorkflow} from './workflows';
import {collectMockFeedback} from './feedback';
import {resolveBatchRoute} from './intake';
import {mockConfiguration} from './parameters';
import {resolveCampaignRoute} from './campaigns';
import {resolveComparisonRoute, resolveFactorMergeRoute} from './comparisons';
import {resolveCorrelation} from './correlation';
import {captureMockVersion, presentMockEntry, setMockMaterialCurrent} from './sourceSnapshots';
import {mockSourceImpact} from './sourceImpact';
import {previewMockExecution} from './platformEvidence';
import {HttpResponse} from 'msw';
import type {QuantAttachment, QuantBacktest, QuantBacktestInput, QuantEntryDetail, QuantEntryInput, QuantImplementationInput, QuantRunInput, QuantVersionInput, QuantVerificationInput} from '../../types/api/quant';
import {quantModels} from './fixtures';
import {detectQuantLanguage} from '../../utils/quantLanguage';
import {ensureSources, acquireMockSources, publishMockReport} from './research';
import {resolveGraphRoute, queueMockIndex} from './graph';
import {resolveExperimentRoute} from './experiments';
import {resolveDatasetRoute} from './datasets';
import {resolveFactorRoute} from './factorRoutes';
import {resolveQuantAnthology} from './anthology';
import {resolveQuantResources} from './resources';
import {adoptRun, advanceRun, createRun, newImplementation, newVersion} from './runs';
import {mockScenario, persistQuantState, quantId, quantState} from './state';
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const findVersion = (entry: QuantEntryDetail, id?: string | null) => entry.implementations.flatMap(row => row.versions).find(row => row.id === id);
const touch = (entry: QuantEntryDetail) => {entry.updatedAt = new Date().toISOString(); persistQuantState();};
const languages = ['python', 'pine', 'mql4'];
const advanceEntry = (entry: QuantEntryDetail) => {
    acquireMockSources(entry);
    entry.runs.forEach(run => advanceRun(run, entry.sources?.find(source => source.id === (run.resolvedSourceId || run.sourceId))));
    const count = entry.reports?.length || 0;
    publishMockReport(entry);
    if ((entry.reports?.length || 0) > count) queueMockIndex(entry.collId, [entry]);
    persistQuantState();
};

export async function resolveQuantRoute(request: Request): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/api/quant/')) {
        const resources = await resolveQuantResources(request);
        if (resources !== undefined) return resources;
        return resolveQuantAnthology(request);
    }
    if (!request.headers.get('Authorization')) return fail(403, '请先登录后访问量化研究');
    if (mockScenario() === 'error') return fail(503, '本地模拟量化接口失败，请切回样例状态重试');
    if (path === '/api/quant/models/' && request.method === 'GET') return quantModels;
    const route = path.slice('/api/quant/'.length).split('/').filter(Boolean).map(decodeURIComponent);
    const [collId, domain, entryId, section, id, action] = route;
    if (domain === 'mt4') return resolveMT4Route(request, collId, route.slice(2));
    const state = quantState();
    const collection = state.collections.find(row => row.collId === collId && row.type === 'quant');
    if (!collection) return fail(404, '量化文集不存在或无权访问');
    if(domain==='ai-studies')return resolveStudyRoute(request,collId,entryId,section);
    if(domain==='connectors')return resolveConnectorRoute(request,collId,entryId,section);
    if(domain==='connector-preview')return resolveConnectorRoute(request,collId,undefined,'preview');
    if(domain==='connector-responses')return resolveConnectorRoute(request,collId,undefined,'responses');
    if (domain==='native-python')return resolveNativePython(request,collId,entryId,section);
    if (domain === 'validations') return resolveValidationRoute(request, collId, entryId, section);
    if (domain === 'vocabulary') return resolveVocabularyRoute(request, collId);
    if (domain === 'comparisons'&&section==='correlation')return !entryId||id||action?fail(501,'尚未提供此统计路径的本地样例'):resolveCorrelation(request,collId,entryId);
    if (domain === 'comparisons'&&section)return fail(501,'尚未提供此对照路径的本地样例');
    if (domain === 'comparisons') return resolveComparisonRoute(request, collId, entryId);
    if (domain === 'factor-merges') return resolveFactorMergeRoute(request, collId, entryId, section);
    if (domain === 'campaigns') return resolveCampaignRoute(request, collId, entryId, section);
    if (domain === 'intake-batches') return resolveBatchRoute(request, collId, entryId, section);
    if (domain === 'experiments' && section === 'strategy-export') return resolveStrategyExport(request, collId, entryId);
    if (domain === 'experiments') return resolveExperimentRoute(request, collId, entryId, section);
    if (domain === 'datasets') return resolveDatasetRoute(request, collId, entryId);
    if (domain === 'graph') {
        const entries = state.entries.filter(row => row.collId === collId && row.isValid);
        entries.forEach(advanceEntry);
        return resolveGraphRoute(request, collId, entries, entryId, section, id);
    }
    if (domain === 'factors') {
        const entries = state.entries.filter(row => row.collId === collId && row.isValid);
        entries.forEach(advanceEntry);
        if (section==='native-python')return resolveNativePython(request,collId,entryId,section,id);
        return resolveFactorRoute(request, entries, entryId, section, id);
    }
    if (domain !== 'entries' && domain !== 'intake') return undefined;
    const writing = !['GET', 'HEAD', 'DELETE'].includes(request.method);
    const rawBody = writing ? await request.text() : '';
    const body: Record<string, unknown> = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
    if (domain === 'intake' && request.method === 'POST') {
        if (![body.code, body.description, body.url].some(value => typeof value === 'string' && value.trim())) return fail(400, '请粘贴代码、说明或来源网址');
        if (typeof body.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(body.requestKey)) return fail(400, '请求标识无效');
        if (body.url && !/^https?:\/\//i.test(String(body.url))) return fail(400, '来源网址只支持 HTTP/HTTPS');
        const identity = `intake-${collId}-${body.requestKey}`;
        const fingerprint = JSON.stringify(['title', 'code', 'description', 'url', 'language', 'platform', 'modelId', 'analyze'].map(key => body[key] ?? (key === 'analyze' ? true : key === 'language' ? 'auto' : '')));
        const existing = state.entries.find(row => row.id === identity);
        if (existing) {
            if (!existing.isValid || existing.sources?.[0]?.payload.requestFingerprint !== fingerprint) return fail(409, '收集请求内容发生变化或资料已删除');
            return {entry: presentMockEntry(existing), notice: ''};
        }
        const now = new Date().toISOString();
        const created: QuantEntryDetail = {id: identity, collId, title: String(body.title || '待分析资料'), kind: 'factor', content: '', sourceUrl: String(body.url || ''), tags: [], isValid: true, createdAt: now, updatedAt: now, implementations: [], backtests: [], attachments: [], runs: [], reports: [], sources: [{id: identity, materialId: identity, codeVersionId: null, createdAt: now, payload: {title: String(body.title || ''), code: String(body.code || ''), description: String(body.description || ''), url: String(body.url || ''), language: String(body.language || 'text'), fetchStatus: 'not_fetched'}}]};
        state.entries.unshift(created);
        created.sources![0].payload.requestFingerprint = fingerprint;
        if (!body.language || body.language === 'auto') created.sources![0].payload.language = detectQuantLanguage(String(body.code || ''));
        setMockMaterialCurrent(created.sources![0]);
        const unavailable = body.modelId && !quantModels.models.some(row => row.id === body.modelId);
        if (body.analyze !== false && !unavailable) createRun(created, {kind: 'analyze', sourceId: identity, requestKey: body.requestKey, modelId: String(body.modelId || '')});
        touch(created); return {entry: presentMockEntry(created), notice: body.analyze !== false && unavailable ? '请选择已配置的对话模型' : ''};
    }
    if (!entryId) {
        if (request.method === 'GET') {
            const query = (url.searchParams.get('q') || '').toLowerCase();
            const kind = url.searchParams.get('kind'), language = url.searchParams.get('language');
            return state.entries.filter(row => row.collId === collId && row.isValid && (!kind || row.kind === kind) && (!language || row.implementations.some(impl => impl.language === language) || row.sources?.some(source => source.payload.language === language)) && (!query || `${row.title} ${row.tags.join(' ')}`.toLowerCase().includes(query))).map(({implementations: _implementations, backtests: _backtests, attachments: _attachments, runs: _runs, sources: _sources, reports: _reports, ...entry}) => entry);
        }
        if (request.method === 'POST') {
            if (typeof body.title !== 'string' || !body.title.trim()) return fail(400, '请填写研究标题');
            const input = body as Partial<QuantEntryInput>;
            const now = new Date().toISOString();
            const entry: QuantEntryDetail = {id: quantId('entry'), collId, title: input.title!.trim(), kind: input.kind || 'factor', content: input.content || '', sourceUrl: input.sourceUrl || '', tags: input.tags || [], isValid: true, createdAt: now, updatedAt: now, implementations: [], backtests: [], attachments: [], runs: []};
            state.entries.unshift(entry); touch(entry); return entry;
        }
        return undefined;
    }
    const entry = state.entries.find(row => row.collId === collId && row.id === entryId && row.isValid);
    if (!entry) return fail(404, '研究条目不存在或已删除');
    if (section === 'source-impact') return mockSourceImpact(request, entry);
    if (section === 'feedback' && id === 'preview') return request.method === 'POST' ? previewMockExecution(body as unknown as import('./platformEvidence').MockExecutionInput) : fail(405, '只支持执行证据预览');
    ensureSources(entry);
    if (section==='sources' && action==='supplements' && id) return request.method==='POST' ? supplementMockSource(entry,id,body as unknown as import('../../types/api/quantSourceSupplement').QuantSourceSupplementInput) : fail(405,'只支持补充依赖源码');
    if (!section) {
        if (request.method === 'GET') {seedDemoEntry(entry); advanceEntry(entry); return presentMockEntry(entry);}
        if (request.method === 'DELETE') {entry.isValid = false; touch(entry); return null;}
        if (request.method === 'PATCH') {
            if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) return fail(400, '请填写研究标题');
            for (const key of ['title', 'kind', 'content', 'sourceUrl', 'tags'] as const) if (body[key] !== undefined) Object.assign(entry, {[key]: body[key]});
            touch(entry); return entry;
        }
    }
    if (section === 'feedback' && !id && request.method === 'POST') return collectMockFeedback(entry, body as unknown as import('../../types/api/quantFeedback').QuantFeedbackInput);
    if (section === 'parameters' && id === 'preview' && request.method === 'POST') {
        const target = entry.sources?.find(row => row.id === body.targetSourceId && row.payload.provenance !== 'external_feedback');
        if (!target || typeof body.document !== 'string') return fail(400, '配置必须关联当前研究的原始来源');
        try {return mockConfiguration(body.document, target);} catch (error) {return fail(400, error instanceof Error ? error.message : '配置无法解析');}
    }
    if (section === 'reports' && id && request.method === 'PATCH') {
        const report = entry.reports?.find(row => row.id === id);
        if (!report) return fail(404, '报告不存在');
        if (typeof body.markdown !== 'string' || body.markdown.length > 200000) return fail(400, '报告正文无效');
        if (body.expectedRevisionId !== report.currentRevisionId) return fail(409, '报告已有新的修订，请刷新');
        const revision = {id: quantId('revision'), markdown: body.markdown, createdAt: new Date().toISOString()};
        report.revisions.push(revision); report.markdown = revision.markdown; report.currentRevisionId = revision.id;
        touch(entry); return report;
    }
    if (section === 'implementations') {
        if (!id && request.method === 'POST') {
            if (!languages.includes(String(body.language)) || !String(body.code || '').trim()) return fail(400, '请选择语言并填写代码');
            const implementation = newImplementation(entry, body as unknown as QuantImplementationInput); touch(entry); return implementation;
        }
        const implementation = entry.implementations.find(row => row.id === id);
        if (!implementation) return fail(404, '代码实现不存在');
        if (!action && request.method === 'PATCH') {implementation.name = String(body.name || implementation.name); touch(entry); return implementation;}
        if (action === 'versions' && request.method === 'POST') {
            if (!String(body.code || '').trim()) return fail(400, '代码内容不能为空');
            if (body.sourceVersionId && !findVersion(entry, String(body.sourceVersionId))) return fail(400, '来源版本必须属于当前研究');
            const version = newVersion(implementation, body as unknown as QuantVersionInput); captureMockVersion(entry, implementation, version); touch(entry); return version;
        }
    }
    if (section === 'versions' && action === 'verification' && request.method === 'PATCH') {
        const version = findVersion(entry, id); if (!version) return fail(404, '代码版本不存在');
        const input = body as Partial<QuantVerificationInput>;
        for (const key of ['compileCheck', 'runCheck', 'resultCheck'] as const) {
            if (input[key] !== undefined && !['pending', 'passed', 'failed'].includes(input[key]!)) return fail(400, '验证状态无效');
            if (input[key]) version[key] = input[key];
        }
        if (input.verificationNotes !== undefined) version.verificationNotes = input.verificationNotes;
        touch(entry); return version;
    }
    if (section === 'backtests') {
        if (!id && request.method === 'GET') return entry.backtests;
        const existing = entry.backtests.find(row => row.id === id);
        if (id && !existing) return fail(404, '回测记录不存在');
        if (id && request.method === 'DELETE') {entry.backtests = entry.backtests.filter(row => row.id !== id); touch(entry); return null;}
        if (request.method === 'POST' || request.method === 'PATCH') {
            const input = body as Partial<QuantBacktestInput>;
            if (input.versionId && !findVersion(entry, input.versionId)) return fail(400, '回测代码版本必须属于当前研究');
            if (input.versionId && existing && entry.attachments.some(row => row.backtestId === existing.id
                && row.versionId && row.versionId !== input.versionId)) {
                return fail(400, '该回测的附件已关联其他代码版本，请先移除冲突的附件关联');
            }
            if (!input.name?.trim() && !existing) return fail(400, '请填写回测名称');
            const now = new Date().toISOString();
            const backtest: QuantBacktest = existing || {id: quantId('backtest'), entryId, name: '', versionId: null, symbol: '', timeframe: '', startDate: '', endDate: '', parameters: '', fees: '', metrics: [], conclusion: '', createdAt: now, updatedAt: now};
            for (const key of ['name', 'versionId', 'symbol', 'timeframe', 'startDate', 'endDate', 'parameters', 'fees', 'metrics', 'conclusion'] as const) if (input[key] !== undefined) Object.assign(backtest, {[key]: input[key]});
            backtest.updatedAt = now; if (!existing) entry.backtests.unshift(backtest); touch(entry); return backtest;
        }
    }
    if (section === 'attachments') {
        if (!id && request.method === 'POST') {
            const asset = state.assets.find(row => row.id === body.assetId); if (!asset) return fail(400, '附件资源不存在或不属于当前用户');
            const implementationId = body.implementationId ? String(body.implementationId) : null;
            const versionId = body.versionId ? String(body.versionId) : null;
            const backtestId = body.backtestId ? String(body.backtestId) : null;
            if (implementationId && !entry.implementations.some(row => row.id === implementationId)) return fail(400, '代码实现不属于当前研究');
            const version = versionId ? findVersion(entry, versionId) : null;
            if (versionId && (!version || (implementationId && version.implementationId !== implementationId))) return fail(400, '代码版本与关联实现不匹配');
            if (backtestId && !entry.backtests.some(row => row.id === backtestId)) return fail(400, '回测记录不属于当前研究');
            const ref: QuantAttachment = {id: quantId('reference'), entryId, assetId: asset.id, name: asset.name, fileType: asset.type, fileExtension: `.${asset.name.split('.').pop() || ''}`, mimeType: asset.mimeType, fileSize: asset.size, url: asset.dataUrl || `/api/resource/download/${asset.id}`, downloadUrl: `/api/resource/download/${asset.id}`, implementationId, versionId, backtestId, createdAt: new Date().toISOString()};
            entry.attachments.push(ref); touch(entry); return ref;
        }
        const attachment = entry.attachments.find(row => row.id === id); if (!attachment) return fail(404, '附件引用不存在');
        if (!action && request.method === 'DELETE') {entry.attachments = entry.attachments.filter(row => row.id !== id); touch(entry); return null;}
        if (action === 'text' && request.method === 'GET') {
            const asset = state.assets.find(row => row.id === attachment.assetId);
            const ext = attachment.fileExtension.toLowerCase().replace(/^\./, '');
            if (!asset || !['py', 'pine', 'mq4', 'mqh'].includes(ext) || asset.size > 1024 * 1024) return fail(400, '仅支持读取不超过 1MiB 的 Python、Pine、MQL4 文本脚本');
            return {code: asset.text, language: ext === 'py' ? 'python' : ext === 'pine' ? 'pine' : 'mql4', name: asset.name};
        }
    }
    if (section === 'runs') {
        if (!id && request.method === 'GET') {advanceEntry(entry); return entry.runs;}
        if (!id && request.method === 'POST') {
            const input = body as unknown as QuantRunInput;
            const auditError=validateMockAudit(entry,input);if(auditError)return fail(400,auditError);
            if (['analyze', 'experiment_review', 'feedback_review'].includes(input.kind) && !entry.sources?.some(row => row.id === input.sourceId)) return fail(404, '当前研究中不存在该来源');
            if (!['analyze', 'experiment_review', 'feedback_review'].includes(input.kind) && !findVersion(entry, input.sourceVersionId)) return fail(400, '请选择当前研究的来源代码版本');
            if (!['explain', 'convert', 'analyze', 'experiment_review', 'feedback_review'].includes(input.kind) || !input.requestKey) return fail(400, 'AI 任务参数不完整');
            if (input.kind === 'experiment_review' && !state.experiments.some(row => row.collection === collId && row.data.reviewContext?.entryId === entry.id && row.data.reviewContext?.sourceId === input.sourceId && row.data.reviewContext?.experimentResultId === input.experimentResultId)) return fail(400, '实验解读来源无效');
            const feedbackSource = entry.sources?.find(row => row.id === input.sourceId)?.payload.provenance === 'external_feedback';
            if ((input.kind === 'feedback_review') !== feedbackSource && ['feedback_review', 'analyze'].includes(input.kind)) return fail(400, '外部反馈须使用反馈分析');
            if (input.kind === 'convert' && !languages.includes(input.targetLanguage || '')) return fail(400, '请选择目标语言');
            if (input.modelId && !quantModels.models.some(row => row.id === input.modelId)) return fail(400, '模型不存在');
            const key = `${entry.id}:${input.requestKey}`, previous = state.requestKeys[key];
            if (previous) {
                if (JSON.stringify(previous.input) !== JSON.stringify(input)) return fail(409, '请求键已用于其他任务');
                return entry.runs.find(row => row.id === previous.runId);
            }
            if(await mockNativeContinuationFault(entry,input))return fail(500,'人工本地续作错误样例：未创建新任务，请再次点击续作重试');
            if (input.restartStage && !input.resumeRunId) return fail(400, '指定重跑阶段时须选择原研究任务');
            if (input.resumeRunId) {
                const old = entry.runs.find(row => row.id === input.resumeRunId && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28].includes(row.workflow?.version || 0));
                if (!old) return fail(404, '阶段研究不存在');
                const allowed = input.restartStage ? ['completed', 'failed', 'cancelled', 'interrupted'] : ['failed', 'cancelled', 'interrupted'];
                const crossSource = old.sourceId !== input.sourceId;
                const baseline = entry.sources?.find(row => row.id === (old.resolvedSourceId || old.sourceId));
                const target = entry.sources?.find(row => row.id === input.sourceId);
                if (input.kind !== 'analyze' || (crossSource ? input.restartStage || old.status !== 'completed' || !target || target.materialId !== baseline?.materialId : !allowed.includes(old.status))) return fail(400, '继续须使用相同来源；跨源码研究须选择同材料的已完成基准');
                if (input.restartStage && !old.workflow?.stages.some(row => row.stage === input.restartStage && row.stepId)) return fail(400, '只能从原研究已开始的阶段重新执行');
            }
            const run = createRun(entry, input); state.requestKeys[key] = {input, runId: run.id}; touch(entry); return run;
        }
        const run = entry.runs.find(row => row.id === id); if (!run) return fail(404, 'AI 任务不存在');
        if (action === 'workflow' && request.method === 'GET') {
            advanceEntry(entry);
            const detail = run.nativeReviewWorkflow?mockNativeReviewEvidence(run,route[6]):workflowEvidence(run, route[6], entry.sources?.find(row => row.id === (run.resolvedSourceId || run.sourceId)));
            return detail || fail(404, '阶段尚未开始');
        }
        if (!action && request.method === 'GET') {advanceEntry(entry); return run;}
        if (action === 'cancel' && request.method === 'POST') {
            if (run.status === 'pending' || run.status === 'running') {run.status = 'cancelled'; interruptWorkflow(run); run.preview = ''; run.updatedAt = new Date().toISOString(); touch(entry);} return run;
        }
        if (action === 'adopt' && request.method === 'POST') {
            advanceEntry(entry);
            if (run.status !== 'completed' || (run.kind === 'convert' && !run.result.code)) return fail(409, '只有完整完成的任务结果可以采用');
            if (['analyze', 'experiment_review', 'feedback_review'].includes(run.kind)) return fail(400, '分析报告已自动保存');
            const adopted = adoptRun(entry, run); touch(entry); return adopted;
        }
    }
    return undefined;
}
