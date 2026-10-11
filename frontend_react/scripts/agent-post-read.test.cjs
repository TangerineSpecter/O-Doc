// Run against a local Vite server. All backend requests are mocked; no real data is read or written.
// VERIFY_BASELINE=1 also reproduces the old late-list overwrite before checking the fix.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
 try {
 for (const baseline of (process.env.VERIFY_BASELINE === '1' ? [true, false] : [false])) {
 const page = await browser.newPage();
 await page.addInitScript(() => localStorage.setItem('token','isolated-test-token'));
 const post = {articleId:'read-test',collId:'read-coll',title:'阅读竞态测试',content:'这是测试正文',createdAt:'2026-10-11T10:00:00Z',agentPostHasBeenRead:false};
 let readRequests = 0, releaseList;
 const listGate = new Promise(resolve => releaseList = resolve);
 if (baseline) await page.route('**/src/views/ArticleOutline.tsx',async route => {
  const response = await route.fetch();
  const body = await response.text();
  assert(body.includes('readPostIds.current.has(post.articleId)'));
  await route.fulfill({response,body:body.replace('readPostIds.current.has(post.articleId)','false')});
 });
 await page.route('**/api/**',async route => {
  const path = new URL(route.request().url()).pathname; if (!path.startsWith('/api/')) return route.continue();
  let data = [];
  if(path === '/api/user/profile') data={id:'tester',username:'测试用户'};
  else if(path === '/api/anthology/detail/read-coll') data={collId:'read-coll',title:'测试帖子',type:'agent',canManage:true};
  else if(path === '/api/article/list') {await listGate; data=[post];}
  else if(path === '/api/article/detail/read-test') data=post;
  else if(path === '/api/article/agent-posts/read-test/read') {assert.equal(route.request().method(),'POST'); readRequests++; data={articleId:post.articleId,agentPostHasBeenRead:true};}
  else if(path.endsWith('/comments') || path.endsWith('/latest-comments')) data={comments:[]};
  else if(path.includes('/photo')) data={status:'abandoned'};
  await route.fulfill({json:{code:200,msg:'ok',data}});
 });
 await page.goto(`${process.env.POST_READ_UI_URL || 'http://127.0.0.1:43131'}/article/read-coll/read-test`);
 await page.getByText('这是测试正文',{exact:true}).waitFor();
 for(let i=0; i<100 && readRequests===0; i++) await page.waitForTimeout(25); assert(readRequests>0);
 // Let the read response commit before releasing the old list snapshot.
 await page.waitForTimeout(200);
 releaseList();
 await page.waitForLoadState('networkidle');
 await page.getByRole('button',{name:'返回帖子列表'}).click(); await page.waitForURL('**/article/read-coll'); await page.waitForLoadState('networkidle');
 await page.getByText('阅读竞态测试',{exact:true}).waitFor();
 assert.equal(await page.getByText('NEW',{exact:true}).count(), baseline ? 1 : 0);
 assert.equal(readRequests,1);
 console.log(baseline ? 'BASELINE reproduced: late unread list restores NEW' : 'PASS: direct detail entry marks read and late list cannot restore NEW');
 await page.close();
 }
 } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1)});
