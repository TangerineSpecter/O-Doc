// API fixtures only: no real Agent or world configuration is written.
const {chromium} = require(process.env.ODOC_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const base = process.env.ODOC_AGENT_TEST_URL || 'http://localhost:43127';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'odoc-agent-role-ui-'));
const profile = {age:'18岁',mbti:'ISTJ',identity:'魔法使',personality:'认真细心',preferences:'喜欢甜点',expression:'轻声提醒',appearance:'紫发紫瞳'};
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.ODOC_CHROMIUM});
 const errors = [];
 try {
  for (const width of [1440,390]) {
   const context = await browser.newContext({viewport:{width,height:1000}});
   await context.addInitScript(() => localStorage.setItem('token','isolated-fixture-token'));
   let saved, slow = false;
   await context.route(`${base}/api/**`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    let data = [];
    if (pathname.endsWith('/user/profile')) data={username:'isolated',role:'admin',isAdmin:true,isSuperuser:true};
    else if (pathname.endsWith('/agent-activities/today-summary/')) data={todayActivityCount:0,todayWorkCount:0,activeAgentCount:0,latest:[],agents:[]};
    else if (pathname.endsWith('/agent-relations/')) data={nodes:[],edges:[]};
    else if (pathname.endsWith('/daily-feed/')) data={items:[],hasMore:false,nextCursor:null};
    else if (pathname.endsWith('/agents/organize-role/')) {
     if(slow) await new Promise(resolve=>setTimeout(resolve,700));
     data={roleProfile:profile,prompt:'公共要求',warnings:['重复姓名已移除']};
    } else if(pathname.endsWith('/agents/generate-prompt/')) data={status:'ready',prompt:'## 身份\n魔法使',roleProfile:profile,question:'',warning:''};
    else if(pathname.endsWith('/agents/') && route.request().method()==='POST') {saved=route.request().postDataJSON();data={...saved,id:'fixture'};}
    else if(pathname.includes('/config/')) data={};
    try{await route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,msg:'成功',data})});}catch{}
   });
   const page = await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error') console.error(message.text())});
   await page.goto(`${base}/settings?tab=agent`);await page.waitForLoadState('networkidle');
   if (!await page.getByRole('button',{name:'创建',exact:true}).count()) {await page.screenshot({path:path.join(output,'initial.png'),fullPage:true});throw new Error('Missing Agent page: '+await page.locator('body').innerText()+' errors='+errors.join(';')+' screenshot='+output);}
   await page.getByRole('button',{name:'创建',exact:true}).click();
   await page.getByPlaceholder('如：写作助手').fill('菲伦');
   await page.locator('#agent-prompt').fill('原角色卡');
   assert.equal(await page.locator('select').count(),0);
   await page.getByRole('button',{name:'整理角色设定',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'角色整理预览'});await dialog.waitFor();
   assert.equal(await page.locator('#agent-prompt').inputValue(),'原角色卡');
   assert.equal(await dialog.getByLabel('性格与判断倾向',{exact:true}).inputValue(),'认真细心');
   await dialog.getByLabel('性格与判断倾向',{exact:true}).fill('认真但有主见');
   await dialog.screenshot({path:path.join(output,`preview-${width}.png`)});
   await dialog.getByRole('button',{name:'确认应用',exact:true}).click();
   assert.equal(await page.getByLabel('性格与判断倾向',{exact:true}).inputValue(),'认真但有主见');
   assert.equal(await page.locator('#agent-prompt').inputValue(),'公共要求');
   await page.getByRole('button',{name:'撤销整理应用',exact:true}).click();
   assert.equal(await page.locator('#agent-prompt').inputValue(),'原角色卡');
   assert.equal(await page.getByLabel('性格与判断倾向',{exact:true}).inputValue(),'');
   await page.locator('details').filter({has:page.locator('summary').filter({hasText:'从零生成角色'})}).locator('summary').click();
   await page.getByRole('button',{name:'从零生成角色',exact:true}).click();
   await page.getByLabel('角色出处',{exact:true}).fill('葬送的芙莉莲');
   await page.getByRole('button',{name:'开始生成',exact:true}).click();
   await dialog.waitFor();
   assert.equal(await page.locator('#agent-prompt').inputValue(),'原角色卡');
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   assert.equal(await page.locator('#agent-prompt').inputValue(),'原角色卡','Escape must close only preview');
   slow=true;
   await Promise.all([page.waitForRequest(request=>request.url().includes('organize-role')),page.getByRole('button',{name:'整理角色设定',exact:true}).click()]);
   await page.getByLabel('性格与判断倾向',{exact:true}).fill('新编辑');
   await page.waitForTimeout(900);assert.equal(await dialog.count(),0,'stale draft must not open');
   slow=false;await page.getByRole('button',{name:'整理角色设定',exact:true}).click();await dialog.waitFor();
   await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.locator('#agent-prompt').inputValue(),'原角色卡');
   await page.getByRole('button',{name:'整理角色设定',exact:true}).click();await dialog.waitFor();await dialog.getByRole('button',{name:'确认应用',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(output,`editor-${width}.png`),fullPage:true});
   assert(await page.locator('textarea').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).resize==='none')));
   await page.getByRole('button',{name:'保存 Agent',exact:true}).click();await page.waitForTimeout(200);
   assert.equal(saved.prompt,'公共要求');assert.deepEqual(saved.roleProfile,profile);
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('Passed role editor desktop/mobile: preview, edit, apply, undo, cancel, stale response, save payload, no native select, no resize/overflow.');console.log('Screenshots:',output);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
