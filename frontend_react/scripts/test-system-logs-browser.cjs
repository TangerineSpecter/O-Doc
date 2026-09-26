// API fixtures only; never writes to a real O-Doc server.
// ODOC_PLAYWRIGHT_MODULE, ODOC_LOGS_TEST_URL and ODOC_CHROMIUM may override local runtime paths.
const { chromium } = require(process.env.ODOC_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const baseUrl = process.env.ODOC_LOGS_TEST_URL || 'http://127.0.0.1:5297';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'odoc-system-logs-ui-'));
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.ODOC_CHROMIUM});
  const errors=[];
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const context=await browser.newContext({viewport, acceptDownloads:true});
    await context.addInitScript(()=>localStorage.setItem('token','isolated-test-token'));
    let events=[{id:'a'.repeat(32),created:Date.now()/1000,module:'ai',title:'大模型调用失败 · test-model · http_502',errorType:'http_502',requestId:'b'.repeat(32)}];
    await context.route(`${baseUrl}/api/**`, async route=>{
      const url=new URL(route.request().url()); const path=url.pathname;
      let data=[];
      if(path.endsWith('/user/profile')) data={username:'isolated',nickname:'测试管理员',role:'admin',isAdmin:true,isSuperuser:true};
      else if(path==='/api/system/logs/') data={list:events,total:events.length,page:1,pageSize:20};
      else if(path==='/api/system/logs/overview/') data={total:events.length,latest:events[0]?.created || null,recent:events.length,bytes:24576,policy:{days:30,maxMb:100},modules:['ai']};
      else if(path==='/api/system/logs/download/') {await route.fulfill({contentType:'text/plain',body:'{"httpStatus":502}',headers:{'content-disposition':'attachment; filename="exception.txt"'}});return;}
      else if(path==='/api/system/logs/delete/' || path==='/api/system/logs/clear/') {events=[];data={};}
      else if(path.includes('/api/system/logs/')) data={...events[0],httpStatus:502,stack:'provider.py:123 in call'};
      else if(path.includes('config/')) data={};
      await route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,msg:'成功',data})});
    });
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`${baseUrl}/settings?tab=logs`);
    await page.waitForLoadState('networkidle');
     await page.getByText('大模型调用失败 · test-model · http_502',{exact:true}).waitFor({timeout:5000});
    await page.screenshot({path:`${output}/logs-${viewport.width}.png`,fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    if(overflow)throw new Error('horizontal overflow '+viewport.width);
    await page.getByText('大模型调用失败 · test-model · http_502',{exact:true}).click();
    await page.getByRole('dialog',{name:'异常日志明细'}).waitFor();
    if(!await page.getByRole('dialog').innerText().then(t=>t.includes('HTTP 状态')))throw new Error('missing detail');
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'下载明细'}).click();
    await download;
    await page.keyboard.press('Escape');
    await page.getByRole('dialog',{name:'异常日志明细'}).waitFor({state:'hidden'});
    await page.getByRole('button',{name:'删除日志',exact:true}).click();
    await page.getByRole('button',{name:'确认',exact:true}).click();
    await page.getByText('暂无符合条件的异常日志').waitFor();
    await context.close();
  }
  await browser.close();
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Screenshots:', output);
  console.log('desktop/mobile: list, detail, download, Escape, deletion, empty state and no overflow passed (isolated API fixtures)');
})().catch(e=>{console.error(e);process.exit(1)});
