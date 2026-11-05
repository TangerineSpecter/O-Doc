import {HttpResponse} from 'msw';
import type {QuantEntryDetail, QuantSource} from '../../types/api/quant';
import {mockMemoryMarkdown} from './researchMemory';
import {mockSourceChangeMarkdown} from './sourceChangeReview';
import {persistQuantState, quantId, quantState} from './state';

const fail=(status:number,msg:string)=>HttpResponse.json({code:status,msg,data:null},{status});
const record=(value:unknown):value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
const hasKeys = (value: Record<string, unknown>, expected: string[]) =>
    Object.keys(value).length === expected.length
    && expected.every(key => Object.prototype.hasOwnProperty.call(value, key));

type SharePackage = {
    entry: {title: string; kind: QuantEntryDetail['kind']};
    report: {data: Record<string, unknown>};
};

function validPackage(value: unknown): value is SharePackage {
    if (!record(value) || !hasKeys(value, ['format', 'version', 'entry', 'source', 'report'])
        || value.format !== 'odoc.quant.report' || value.version !== 1) return false;
    const {entry, source, report} = value;
    if (!record(entry) || !hasKeys(entry, ['title', 'kind'])
        || typeof entry.title !== 'string' || !entry.title.trim() || [...entry.title].length > 255
        || !['factor', 'indicator', 'strategy'].some(kind => kind === entry.kind)) return false;
    if (!record(source) || !hasKeys(source, ['code', 'description', 'url', 'language', 'files', 'related'])
        || !['code', 'description', 'url', 'language'].every(key => typeof source[key] === 'string')
        || !Array.isArray(source.files) || !Array.isArray(source.related)) return false;
    return record(report) && hasKeys(report, ['markdown', 'data'])
        && typeof report.markdown === 'string' && record(report.data) && validTree(value);
}

function validTree(value: unknown, depth = 0): boolean {
    if (depth > 128) return false;
    if (Array.isArray(value)) return value.every(item => validTree(item, depth + 1));
    if (record(value)) return Object.entries(value).every(([key, item]) =>
        validTree(key, depth + 1) && validTree(item, depth + 1));
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value !== 'string' || !value.includes(String.fromCharCode(0));
}

function shareSource({code = '', description = '', url = '', language = '', files = []}: QuantSource['payload']) {
    return {code, description, url, language, files};
}

export async function shareRoute(request:Request, collId:string, entry?:QuantEntryDetail, action?:string):Promise<unknown> {
    const state=quantState();
    state.sharedReports ||= {};
    if (action === 'import') {
        if (request.method !== 'POST') return fail(405,'不支持此操作');
        const body = await request.json() as {packageJson?:unknown};
        if (typeof body.packageJson !== 'string' || new TextEncoder().encode(body.packageJson).length > 5*1024*1024) return fail(400,'请选择不超过 5 MB 的报告文件');
        let value: unknown;
        try {value=JSON.parse(body.packageJson);} catch {return fail(400,'报告文件不是有效的 JSON');}
        if (!validPackage(value)) return fail(400, '报告文件格式无效');
        for (const score of [value.report.data.total_score, value.report.data.totalScore]) {
            if (score != null && (typeof score !== 'number' || score < 0 || score > 100)) {
                return fail(400, '研究评分必须为 0 到 100 的数值或空值');
            }
        }
        const id=quantId('shared'), now=new Date().toISOString();
        const created:QuantEntryDetail={id,collId,title:value.entry.title,kind:value.entry.kind,content:'',sourceUrl:'',tags:[],isValid:true,createdAt:now,updatedAt:now,implementations:[],backtests:[],attachments:[],runs:[],reports:[],sources:[]};
        state.entries.unshift(created);state.sharedReports[id]=body.packageJson;persistQuantState();
        return {entryId:id};
    }
    if (!entry) return fail(404,'研究不存在');
    if(action==='read' && request.method==='GET')return {packageJson:state.sharedReports[entry.id]||null};
    if(action==='export' && request.method==='GET') {
        const report = (entry.reports ?? [])
            .filter(row => [1, 2, 3].includes(row.schemaVersion)
                && entry.runs.some(run => run.id === row.runId && run.status === 'completed'))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
        if (!report) {
            if (state.sharedReports[entry.id]) return {packageJson: state.sharedReports[entry.id]};
            return fail(400, '这条研究没有可导出的分析报告');
        }
        const source=entry.sources?.find(row=>row.id===report.sourceId)?.payload;
        if(!source)return fail(400,'报告来源不存在');
        const run = entry.runs.find(row => row.id === report.runId);
        const markdown = report.originalMarkdown
            .replace(run ? mockMemoryMarkdown(run) : '', '')
            .replace(mockSourceChangeMarkdown(report.data), '');
        const historyFields = new Set(['sourceMemoryVersion', 'memoryNote', 'memoryAssessment', 'researchMemoryJson',
            'sourceChangeReviewVersion', 'sourceChangeFactsJson', 'sourceChangeAssessment']);
        const data = Object.fromEntries(Object.entries(report.data).filter(([key]) => !historyFields.has(key)));
        return {packageJson: JSON.stringify({
            format: 'odoc.quant.report', version: 1,
            entry: {title: entry.title, kind: entry.kind},
            source: {...shareSource(source), related: []},
            report: {markdown, data},
        })};
    }
    return fail(405,'不支持此操作');
}
