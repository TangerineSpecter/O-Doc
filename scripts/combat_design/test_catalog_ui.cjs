const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright'),fs=require('fs'),assert=require('assert');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const context=JSON.parse(fs.readFileSync(process.env.COMBAT_CONTEXT_PATH || '/tmp/combat-acceptance-context.json','utf8'));await page.addInitScript(t=>localStorage.setItem('token',t),context.token);
 await page.goto((process.env.COMBAT_UI_URL || 'http://127.0.0.1:43129')+'/agent-world');await page.waitForLoadState('networkidle');
 assert.equal(await page.getByRole('button',{name:'物品图鉴',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'食谱图鉴',exact:true}).count(),0);
 const opener=page.getByRole('button',{name:'世界图鉴',exact:true});assert.equal(await opener.locator('svg.lucide-book-open-text').count(),1);await opener.click();
 const dialog=page.getByRole('dialog',{name:'世界图鉴',exact:true});await dialog.getByRole('textbox',{name:'搜索物品'}).waitFor();await page.waitForLoadState('networkidle');
 assert.equal(await page.getByRole('dialog').count(),1);await page.screenshot({path:'/tmp/world-catalog-items-desktop.png'});
 const items=page.getByRole('region',{name:'物品图鉴内容',exact:true});const itemScroll=items.locator('div.h-full.overflow-y-auto').first();
 await itemScroll.evaluate(el=>el.scrollTop=160);const itemTop=await itemScroll.evaluate(el=>el.scrollTop);
 await dialog.getByRole('button',{name:'冒险',exact:true}).click();await dialog.getByRole('button',{name:'职业与技能',exact:false}).waitFor();
 const category=dialog.getByLabel('冒险图鉴分类');assert.equal(await category.getByRole('button').count(),5);assert.equal(await category.getByRole('button',{name:/全部/}).count(),0);
 for(const name of ['地牢与怪物','怪物图鉴','材料图鉴','装备图鉴','职业与技能'])await category.getByRole('button',{name:new RegExp(name)}).click();
 const adventure=page.getByRole('region',{name:'冒险图鉴内容',exact:true});const adventureScroll=adventure.locator('div.overflow-y-auto').first();await adventureScroll.evaluate(el=>el.scrollTop=240);
 await category.getByRole('button',{name:/装备图鉴/}).click();await category.getByRole('button',{name:/职业与技能/}).click();assert.equal(await adventureScroll.evaluate(el=>el.scrollTop),240);
 await adventureScroll.evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/tmp/world-catalog-adventure-desktop.png'});await adventureScroll.evaluate(el=>el.scrollTop=240);
 await dialog.getByRole('button',{name:'物品',exact:true}).click();assert.equal(await itemScroll.evaluate(el=>el.scrollTop),itemTop);
 await dialog.getByRole('textbox',{name:'搜索物品'}).fill('萝卜');await dialog.getByRole('button',{name:'食谱',exact:true}).click();await dialog.getByRole('textbox',{name:'搜索食谱'}).waitFor();await dialog.getByText('烤土豆',{exact:true}).first().waitFor();
 await page.screenshot({path:'/tmp/world-catalog-recipes-desktop.png'});await dialog.getByRole('textbox',{name:'搜索食谱'}).fill('烤');
 await dialog.getByRole('button',{name:'冒险',exact:true}).click();assert.equal(await adventureScroll.evaluate(el=>el.scrollTop),240);
 await dialog.getByRole('button',{name:'食谱',exact:true}).click();assert.equal(await dialog.getByRole('textbox',{name:'搜索食谱'}).inputValue(),'烤');
 await dialog.getByRole('button',{name:'物品',exact:true}).click();assert.equal(await dialog.getByRole('textbox',{name:'搜索物品'}).inputValue(),'萝卜');
 // Nested editors remain independent and return to the same world atlas.
 await dialog.getByRole('button',{name:/从图库设置|从图库选择/}).click();await page.getByRole('dialog').nth(1).waitFor();await page.getByRole('dialog').nth(1).getByRole('button',{name:'关闭面板',exact:true}).click();await page.waitForTimeout(250);assert.equal(await page.getByRole('dialog').count(),1);
 await page.setViewportSize({width:390,height:844});await dialog.getByRole('button',{name:'冒险',exact:true}).click();await category.getByRole('button',{name:/地牢与怪物/}).click();await page.waitForTimeout(300);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/world-catalog-adventure-mobile.png'});await dialog.getByRole('button',{name:'食谱',exact:true}).click();await page.waitForTimeout(300);assert.equal(await dialog.getByRole('button',{name:'食谱',exact:true}).getAttribute('aria-pressed'),'true');await page.screenshot({path:'/tmp/world-catalog-recipes-mobile.png'});await dialog.getByRole('button',{name:'冒险',exact:true}).click();
 await category.getByRole('button',{name:/职业与技能/}).click();await page.keyboard.press('Tab');assert(await page.evaluate(()=>!document.activeElement.closest('[inert]')));
 await dialog.getByRole('button',{name:'关闭面板',exact:true}).click();await page.waitForTimeout(300);assert.equal(await page.getByRole('dialog').count(),0);
 // Reference-data failure must offer retry without pretending the catalog is still loading.
 await page.route('**/combat/catalog/',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:503,msg:'图鉴暂不可用'})}));
 await opener.click();await page.getByRole('dialog',{name:'世界图鉴',exact:true}).getByRole('button',{name:'冒险',exact:true}).click();
 const failed=page.getByRole('region',{name:'冒险图鉴内容',exact:true});await failed.getByRole('alert').waitFor();assert.equal(await failed.getByText('正在翻开冒险图鉴…',{exact:true}).count(),0);
 await page.unroute('**/combat/catalog/');await failed.getByRole('button',{name:'重新加载',exact:true}).click();await failed.getByLabel('冒险图鉴分类').waitFor();
 await page.getByRole('dialog',{name:'世界图鉴',exact:true}).getByRole('button',{name:'关闭面板',exact:true}).click();await page.waitForTimeout(300);
 assert.deepEqual(errors,[]);console.log('PASS actual AgentWorldPage: unified SVG entry, one dialog, original items/recipes, five adventure tabs, no All, per-category and main-panel scroll/filter preservation, nested editor, mobile overflow, keyboard, failure/retry, close');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
