const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'), assert=require('assert');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const fixture=JSON.parse(fs.readFileSync(process.env.COMBAT_CONTEXT_PATH || '/tmp/combat-acceptance-context.json','utf8'));
 await page.addInitScript(token=>localStorage.setItem('token',token),fixture.token);
 let runUrl='';const errors=[];page.on('pageerror',e=>errors.push(e.message));let reads=0;
 page.on('request',r=>{if(r.method()==='GET'&&r.url().includes('/combat/explorations/')){reads++;runUrl=r.url().split('?')[0];}});
 await page.goto((process.env.COMBAT_UI_URL || 'http://127.0.0.1:43129')+'/scripts/fixtures/combat.html');await page.waitForLoadState('networkidle');
 await page.getByRole('button',{name:'图鉴',exact:true}).click();await page.getByText('苔冠巨兽',{exact:false}).waitFor();
 await page.getByRole('button',{name:'冒险档案',exact:true}).click();
 if(await page.getByRole('button',{name:'观察当前探索'}).count()) await page.getByRole('button',{name:'观察当前探索'}).click(); else await page.getByRole('button',{name:'让居民准备出发'}).click();
 await page.getByText('探索中 · 交战',{exact:true}).waitFor({timeout:15000});
 await page.screenshot({path:'/tmp/combat-active-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'击败记录',exact:true}).click();
 await page.getByRole('button',{name:'战斗动态',exact:true}).click();
 // Closing the observation cancels polling but does not end the database exploration.
 await page.getByRole('button',{name:'关闭'}).last().click();await page.waitForTimeout(400);
 let after=reads;await page.waitForTimeout(2500);assert.equal(reads,after);
 await page.getByRole('button',{name:'观察当前探索'}).click();await page.getByText('探索中 · 交战',{exact:true}).waitFor();
 await page.getByText('普通攻击',{exact:false}).first().waitFor({timeout:30000});
 await page.context().setOffline(true);await page.getByRole('alert').filter({hasText:'连接中断'}).waitFor({timeout:6000});
 await page.context().setOffline(false);await page.getByRole('alert').filter({hasText:'连接中断'}).waitFor({state:'hidden',timeout:6000});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(700);await page.screenshot({path:'/tmp/combat-active-mobile.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 // A coherent response fixture supplies long history to exercise scroll retention.
 const confirmed=(await (await page.request.get(runUrl,{headers:{Authorization:'Token '+fixture.token}})).json()).data;
 const history=Array.from({length:200},(_,i)=>({id:'ui-history-'+i,sequence:1000+i,kind:'round',elapsedSeconds:i*15,payload:{report:'测试历史 '+i},createdAt:new Date().toISOString()}));
 let appended=0;
 await page.route('**/combat/explorations/**',route=>{
  if(route.request().method()!=='GET')return route.continue();
  const cursor=Number(new URL(route.request().url()).searchParams.get('cursor')||0);
  if(cursor>=1199){appended++;history.push({id:'ui-appended-'+appended,sequence:1199+appended,kind:'round',elapsedSeconds:3000+appended*15,payload:{report:'新动态 '+appended},createdAt:new Date().toISOString()});}
  const latest=history[history.length-1].sequence;
  return route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,msg:'success',data:{...confirmed,version:confirmed.version+appended+1,events:history.filter(e=>e.sequence>cursor),latestCursor:latest,nextCursor:latest,hasMore:false}})});
 });
 await page.getByText('测试历史 199',{exact:true}).waitFor({timeout:6000});
 const log=page.getByRole('log',{name:'战报记录'});
 await log.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
 await page.waitForTimeout(2600);assert.equal(await log.evaluate(el=>el.scrollTop),0);
 await page.unroute('**/combat/explorations/**');
 await page.getByRole('button',{name:'提前召回',exact:true}).click();await page.getByText('已召回 · 已结束',{exact:true}).waitFor({timeout:6000});
 await page.getByRole('button',{name:'关闭'}).last().click();await page.waitForTimeout(400);
 await page.getByRole('button',{name:'探索历史',exact:true}).click();await page.getByText('已召回 ·',{exact:false}).first().waitFor();
 await page.reload();await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'探索历史',exact:true}).click();await page.getByText('已召回 ·',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'冒险档案',exact:true}).click();
 await page.getByRole('button',{name:'卸下并预览',exact:true}).click();
 await page.getByRole('button',{name:'确认卸下',exact:true}).click();
 await page.getByRole('dialog',{name:'换装预览',exact:true}).waitFor({state:'hidden'});
 await page.getByRole('button',{name:'穿戴并预览',exact:true}).click();
 await page.getByRole('button',{name:'确认穿戴',exact:true}).click();
 await page.getByRole('button',{name:'卸下并预览',exact:true}).waitFor();
 await page.getByRole('button',{name:'收藏',exact:true}).click();await page.getByRole('button',{name:'取消收藏',exact:true}).waitFor();
 await page.getByRole('button',{name:'图鉴',exact:true}).click();
 for (const name of ['怪物图鉴','材料图鉴','装备图鉴','职业与技能']) {
  await page.getByRole('button',{name:/地牢与怪物|怪物图鉴|材料图鉴|装备图鉴|职业与技能/}).last().click();
  await page.getByRole('option',{name,exact:true}).click();await page.waitForTimeout(200);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 }
 await page.getByRole('button',{name:'探索历史',exact:true}).click();
 await page.getByRole('button',{name:'探险者',exact:true}).click();await page.getByRole('option',{name:'观察员',exact:true}).click();await page.waitForTimeout(700);assert.equal(await page.getByText('已召回 ·',{exact:false}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS desktop/mobile: preparation, persistent real rounds, all atlas tabs, equipment preview/unequip/equip/favorite, polling stop, reopen, offline/reconnect, recall, refresh history, resident switching, history scroll retention');await browser.close();
})().catch(error => {console.error(error);process.exit(1);});
