/* Run against VITE_LOCAL_MODE=true. Requires Playwright (or NODE_PATH pointing
 * to its installation). Uses an isolated browser context and synthetic data. */
const {chromium}=require('playwright');
const base=process.env.QUANT_TEST_URL||'http://127.0.0.1:5191';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local server required');
(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.QUANT_TEST_BROWSER?{executablePath:process.env.QUANT_TEST_BROWSER}:{})});
    try {
        const context=await browser.newContext();
        const unexpected=[],errors=[];
        await context.route(/^https?:\/\/[^/]+\/api\//,route=>{unexpected.push(route.request().url());return route.abort();});
        const page=await context.newPage();
        page.on('pageerror',error=>errors.push(String(error)));
        await page.goto(`${base}/quant/local-quant?mockState=sample`);
        await page.getByText('LOCAL · Mock 数据',{exact:true}).waitFor();
        await page.waitForLoadState('networkidle');
        await page.evaluate(async()=>{
            await fetch('/api/quant/local-quant/entries/local-momentum/',{headers:{Authorization:'Token local-demo-token'}});
            const {quantState}=await import('/src/mocks/quant/state.ts');
            const entry=quantState().entries.find(row=>row.id==='local-momentum');
            const impl=entry.implementations[0];
            // Put the associated owner outside the first implementation page.
            entry.implementations=[...Array.from({length:21},(_,i)=>({...structuredClone(impl),id:`filler-${i}`,name:`分页实现 ${i}`,currentVersionId:null,versions:[]})),impl];
        });
        await page.getByRole('button',{name:/区间动量因子/}).click();
        await page.getByRole('button',{name:'查看研究详情',exact:true}).waitFor();
        const bodies=[];
        page.on('request',request=>{if(/\/reading\/versions\/[^/]+\/$/.test(new URL(request.url()).pathname)&&!new URL(request.url()).searchParams.has('metadata'))bodies.push(request.url());});
        await page.getByRole('button',{name:/回测记录/}).click();
        const card=page.locator('article').filter({has:page.getByRole('heading',{name:'日线样本 · 初次核对',exact:true})});
        await card.filter({hasText:'Python · 动量因子 · local-qu'}).waitFor();
        if(bodies.length)throw Error('Backtest metadata loaded code bodies');
        // The associated implementation has now been injected by ID. Open it
        // cold and verify that the history request survives the loaded-state update.
        await page.getByRole('button',{name:/代码实现/}).click();
        await page.locator('section').filter({has:page.getByRole('heading',{name:'多语言实现',exact:true})}).locator('button[aria-haspopup="listbox"]').click();
        await page.getByRole('option',{name:/Python · 动量因子/}).click();
        await page.getByText('验证记录',{exact:true}).waitFor();
        const versions=page.locator('button[aria-haspopup="listbox"]').filter({hasText:'当前版本'});
        await versions.click();
        await page.getByRole('option',{name:/历史版本/}).waitFor();
        await page.getByRole('option',{name:/历史版本/}).click();
        await page.locator('button[aria-haspopup="listbox"]').filter({hasText:'历史版本'}).waitFor();
        if(unexpected.length||errors.length)throw Error(JSON.stringify({unexpected,errors}));
        console.log('PASS: cold history and cross-page backtest associations; no real API traffic');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
