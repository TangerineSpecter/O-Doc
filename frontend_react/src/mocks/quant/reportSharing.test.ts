import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveQuantRoute} from './routes';
import {initDocument} from './documents';
import {quantState, resetQuantStateForTests} from './state';

const call = async (path:string, method='GET', body?:unknown) => resolveQuantRoute(new Request(`http://localhost/api/quant/local-quant/${path}`, {
    method, headers:{Authorization:'Token local-test','Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}),
}));

test('share report round trip and malformed file rejection', async () => {
    resetQuantStateForTests();
    await call('entries/local-momentum/');
    const entry = quantState().entries.find(row => row.id === 'local-momentum')!;
    const document = initDocument(entry);
    const base = entry.reports!.find(row => row.id === document.sections.reading?.reportId)!;
    const source = entry.sources!.find(row => row.id === base.sourceId)!;
    entry.sources!.push({...source, id: 'other-source', payload: {...source.payload, code: 'N=30'}});
    entry.reports!.push({...base, id: 'other-report', sourceId: 'other-source',
        createdAt: '2099-01-01T00:00:00Z', originalMarkdown: '# 最新原稿', markdown: '# 人工修订',
        data: {...base.data, totalScore: 82, memoryNote: '历史依据'}});
    const exported=await call('entries/local-momentum/report-export/') as {packageJson:string};
    const pkg = JSON.parse(exported.packageJson);
    assert.equal(pkg.format,'odoc.quant.report');
    assert.deepEqual(pkg.source.related, []);
    assert.equal(pkg.source.code, 'N=30');
    assert.equal(pkg.report.markdown, '# 最新原稿');
    assert.equal(pkg.report.data.totalScore, 82);
    assert.equal(pkg.report.data.memoryNote, undefined);
    const imported=await call('report-import/','POST',{packageJson:exported.packageJson}) as {entryId:string};
    const reading=await call(`entries/${imported.entryId}/imported-report/`) as {packageJson:string};
    assert.equal(reading.packageJson,exported.packageJson);
    const rejected=await call('report-import/','POST',{packageJson:'{}'}) as Response;
    assert.equal(rejected.status,400);
});
