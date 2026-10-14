// Isolated world settings fixtures; never saves real configuration.
const {chromium}=require(process.env.ODOC_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const base=process.env.ODOC_AGENT_TEST_URL || 'http://localhost:43127';
const output=fs.mkdtempSync(path.join(os.tmpdir(),'odoc-world-decision-ui-'));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ODOC_CHROMIUM});
 try{
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:1000}});
   await context.addInitScript(()=>localStorage.setItem('token','isolated-fixture-token'));
   let saved;
   const settings={agentIds:[],mode:'fixed',period:'daily',count:12,intervalMinutes:60,activeStart:'00:00',activeEnd:'24:00',minGapMinutes:15,minRemainingMinutes:240,decisionModelId:'',jevEnabled:false,jevExcludedScenes:[]};
   await context.route(`${base}/api/**`,async route=>{
    const pathname=new URL(route.request().url()).pathname;let data=[];
    if(pathname.endsWith('/user/profile'))data={username:'isolated',role:'admin',isAdmin:true,isSuperuser:true};
    else if(pathname.endsWith('/agent-activities/today-summary/'))data={todayActivityCount:0,todayWorkCount:0,activeAgentCount:0,latest:[],agents:[]};
    else if(pathname.endsWith('/agent-relations/'))data={nodes:[],edges:[]};
    else if(pathname.endsWith('/daily-feed/'))data={items:[],hasMore:false,nextCursor:null};
    else if(pathname.endsWith('/agent-world/life/config/')){
     if(route.request().method()==='POST'){saved=route.request().postDataJSON();Object.assign(settings,saved.settings);}
     data={settings,pausedAgents:[],migrated:true,activeCycle:[]};
    }else if(pathname.endsWith('/decision-models/'))data={providers:[{id:'jev',name:'JEV',configured:false}]};
    else if(pathname.endsWith('/income/'))data={enabled:false,postAmount:'0',commentAmount:'0',prizeEnabled:false,firstAmount:'0',secondAmount:'0',thirdAmount:'0'};
    else if(pathname.includes('/config/'))data={};
    await route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,msg:'成功',data})});
   });
   const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));
   await page.goto(`${base}/agent-world`);await page.waitForLoadState('networkidle');
   await page.getByRole('button',{name:'世界管理',exact:true}).click();
   await page.getByRole('button',{name:'决策模型',exact:true}).click();
   await page.getByText('优先使用 JEV 处理有限候选决策',{exact:true}).click();
   assert(await page.getByRole('checkbox',{name:'优先使用 JEV 处理有限候选决策',exact:true}).isChecked());
   await page.getByText('社交行为选择',{exact:true}).click();
   assert.equal(await page.locator('select').count(),0);
   await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.waitForTimeout(200);
   assert.equal(saved.settings.jevEnabled,true);assert.deepEqual(saved.settings.jevExcludedScenes,['social_action']);
   assert.equal(saved.settings.mode,'fixed');
   await page.screenshot({path:path.join(output,`world-${width}.png`),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Passed unified JEV settings desktop/mobile: enable, exclusions, save, legacy schedule preservation, no native select/overflow.');console.log('Screenshots:',output);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
