// Run against local Vite. Every API is intercepted, including in pure local mode.
// POST_READ_UI_URL=http://127.0.0.1:43133 PLAYWRIGHT_MODULE=/path/to/playwright
// CHROME_PATH=/path/to/chrome node scripts/agent-post-workspace.test.cjs
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const baseUrl = process.env.POST_READ_UI_URL || 'http://127.0.0.1:43131';
const missingTitle = '这篇帖子已经遗失在辽阔的宇宙中';
const post = (index = 1) => ({
 articleId:`post-${index}`,collId:'workspace-coll',title:`帖子${String(index).padStart(3,'0')}`,
 content:`正文${index}`,createdAt:new Date(Date.UTC(2026,9,22,0,0,76-index)).toISOString(),
 agentPostCategoryId:index%2 ? 'cat-b' : 'cat-a',agentPostCategoryName:index%2 ? '专栏B' : '专栏A',
 agentPostHasBeenRead:false,agentPostCreatorName:'测试 Agent',
});

async function fixture(browser, options = {}) {
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(15000);
 const errors = [], counts = {detail:0,tree:0,list:0,read:0};
 page.on('pageerror',error => {errors.push(error.message); console.error('Page error:',error.message);});
 await page.route('**/src/mocks/browser.ts*',route => route.fulfill({contentType:'application/javascript',body:'export const worker = {start: async () => undefined};'}));
 await page.addInitScript(() => localStorage.setItem('token','isolated-test-token'));
 await page.route('**/api/**',async route => {
  const path = new URL(route.request().url()).pathname;
  if(!path.startsWith('/api/')) return route.continue();
  let data = [], status = 200;
  if(path === '/api/user/profile') data=options.anonymous ? null : {id:'tester',username:'测试用户'};
  else if(path === '/api/anthology/detail/workspace-coll') {
   if(options.metadataGate) await options.metadataGate;
   status=options.metadataStatus || 200;
   data={collId:'workspace-coll',title:'工作区验证',type:options.collectionType || 'agent',canManage:true};
  }
  else if(path === '/api/article/tree-list') {counts.tree++; data=(options.posts || [post()]).map(item => ({id:item.articleId,title:item.title,type:'article',children:[]}));}
  else if(path === '/api/article/list') {counts.list++; data=options.posts || [post()];}
  else if(path.startsWith('/api/article/detail/')) {
   counts.detail++;
   status=options.detailStatus || 200;
   const id=path.split('/').at(-1);
   data=(options.posts || [post()]).find(item => item.articleId === id) || post();
   if(options.polling) data={...data,content:counts.detail <= 2 ? '![配图生成中](odoc-illustration:task-test)' : '配图已更新'};
   if(options.detailResponse) {
    const response=await options.detailResponse(id,data);
    data=response.data; status=response.status || 200;
   }
  }
  else if(path.endsWith('/read')) {assert.equal(route.request().method(),'POST'); counts.read++; data={articleId:path.split('/').at(-2),agentPostHasBeenRead:true};}
  else if(path.endsWith('/comments')) {
   status=options.commentsStatus || 200; data={comments:options.comments || []};
   if(options.commentResponse) data=await options.commentResponse(path.split('/').at(-2),route.request().method());
  }
  else if(path.endsWith('/rating') && options.ratingResponse) data=await options.ratingResponse(path.split('/').at(-2));
  else if(path.endsWith('/latest-comments')) data={comments:[]};
  else if(path.endsWith('/ranking/')) data={posts:[],awards:[],frozen:false};
  else if(path.includes('/photo')) data={status:'abandoned'};
  await route.fulfill({status,json:{code:status,msg:status===404 ? 'not found' : status===500 ? 'Internal Server Error' : 'ok',data}});
 });
 return {page,counts,check:() => assert.deepEqual(errors,[])};
}
async function until(page, condition) {
 for(let attempt=0; attempt<100; attempt++) {
  if(await condition()) return;
  await page.waitForTimeout(50);
 }
 assert.fail('condition did not become true');
}
async function bodyReady(page, content='正文1') {await page.getByText(content,{exact:true}).first().waitFor();}
async function navigateTo(page, path) {
 await page.evaluate(path => {history.pushState({},'',path); window.dispatchEvent(new PopStateEvent('popstate'));},path);
 await page.waitForURL(url => url.pathname===path);
}
function deferred() {
 let resolve;
 const promise=new Promise(done => resolve=done);
 return {promise,resolve};
}

(async () => {
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
 try {
  let releaseMetadata;
  const metadataGate=new Promise(resolve => releaseMetadata=resolve);
  const gate=await fixture(browser,{metadataGate});
  await gate.page.goto(`${baseUrl}/article/workspace-coll/post-1`);
  await gate.page.getByText('正在加载知识库...',{exact:true}).waitFor().catch(async error => {
   console.error(await gate.page.locator('body').innerText());
   releaseMetadata();
   throw error;
  });
  assert.deepEqual(gate.counts,{detail:0,tree:0,list:0,read:0});
  releaseMetadata();
  await bodyReady(gate.page);
  await until(gate.page,() => gate.counts.read===1);
  assert.deepEqual(gate.counts,{detail:2,tree:0,list:2,read:1});
  gate.check(); await gate.page.close();
  console.log('PASS: collection type gate prevents premature article requests; StrictMode detail=2/tree=0/list=2/read=1');

  for(const status of [404,500]) {
   const f=await fixture(browser,{detailStatus:status});
   await f.page.goto(`${baseUrl}/article/workspace-coll/post-1`);
   if(status===404) await f.page.getByRole('heading',{name:missingTitle,exact:true}).waitFor();
   else {
    await f.page.getByRole('heading',{name:'服务响应异常 (500)',exact:true}).waitFor();
    assert.equal(await f.page.getByRole('heading',{name:missingTitle,exact:true}).count(),0);
    assert.equal(await f.page.getByRole('button',{name:'重新加载',exact:true}).count(),1);
   }
   assert.equal(f.counts.read,0);
   assert.equal(f.counts.tree,0);
   f.check(); await f.page.close();
   console.log(`PASS: detail HTTP ${status} retains its distinct state and never marks read`);
  }

  const comments=await fixture(browser,{commentsStatus:500});
  await comments.page.goto(`${baseUrl}/article/workspace-coll/post-1`);
  await bodyReady(comments.page);
  await comments.page.getByText('暂无评论',{exact:true}).waitFor();
  assert.equal(await comments.page.getByRole('heading',{name:missingTitle,exact:true}).count(),0);
  await until(comments.page,() => comments.counts.read===1);
  comments.check(); await comments.page.close();
  console.log('PASS: comments HTTP 500 preserves readable article and independent comment fallback');

  for(const collectionType of ['agent','markdown']) {
   const oldDetail=deferred(),newDetail=deferred();
   let startedOld=0,startedNew=0;
   const switched=await fixture(browser,{collectionType,posts:[post(),post(2)],detailResponse:async(id,data) => {
    if(id==='post-1') {startedOld++; await oldDetail.promise; return {data,status:500};}
    startedNew++; await newDetail.promise; return {data};
   }});
   await switched.page.goto(`${baseUrl}/article/workspace-coll/post-1`);
   await until(switched.page,() => startedOld===2);
   await navigateTo(switched.page,'/article/workspace-coll/post-2');
   await until(switched.page,() => startedNew===1);
   oldDetail.resolve();
   await switched.page.waitForTimeout(700);
   assert.equal(await switched.page.getByText('正文1',{exact:true}).count(),0);
   assert.equal(await switched.page.getByRole('heading',{name:'服务响应异常 (500)',exact:true}).count(),0);
   if(collectionType==='agent') await switched.page.getByText('正在加载帖子...',{exact:true}).waitFor();
   else assert((await switched.page.locator('#right-content-window > div').first().getAttribute('class')).includes('opacity-100 visible'));
   newDetail.resolve();
   await bodyReady(switched.page,'正文2');
   switched.check(); await switched.page.close();
   console.log(`PASS: ${collectionType} delayed A error cannot overwrite B or end B loading`);
  }

  const oldComments=deferred();
  let requestedComments=false;
  const commentSwitch=await fixture(browser,{posts:[post(),post(2)],commentResponse:async id => {
   if(id==='post-1') {requestedComments=true; await oldComments.promise;}
   return {comments:[{commentId:id,creatorId:'tester',creatorName:'测试用户',content:`评论${id}`,createdAt:'2026-10-22T00:00:00Z'}]};
  }});
  await commentSwitch.page.goto(`${baseUrl}/article/workspace-coll/post-1`);
  await until(commentSwitch.page,() => requestedComments);
  await navigateTo(commentSwitch.page,'/article/workspace-coll/post-2');
  await bodyReady(commentSwitch.page,'正文2');
  await commentSwitch.page.getByText('评论post-2',{exact:true}).waitFor();
  oldComments.resolve();
  await commentSwitch.page.waitForTimeout(200);
  assert.equal(await commentSwitch.page.getByText('评论post-1',{exact:true}).count(),0);
  assert.equal(await commentSwitch.page.getByText('评论post-2',{exact:true}).count(),1);
  commentSwitch.check(); await commentSwitch.page.close();
  console.log('PASS: delayed A comments cannot replace B comments');

  const commentWrite=deferred(),ratingWrite=deferred(),nextCommentWrite=deferred(),nextRatingWrite=deferred();
  let commentStarted=false,ratingStarted=false,nextCommentStarted=false,nextRatingStarted=false;
  const mutation=await fixture(browser,{posts:[post(),post(2)],commentResponse:async(id,method) => {
   if(method==='GET') return {comments:[]};
   if(id==='post-1') {commentStarted=true; await commentWrite.promise;}
   else {nextCommentStarted=true; await nextCommentWrite.promise;}
   return {comment:{commentId:`created-${id}`,creatorId:'tester',creatorName:'测试用户',content:id==='post-1' ? 'A的新评论' : 'B未发布的草稿',createdAt:'2026-10-22T00:00:00Z'}};
  },ratingResponse:async id => {
   if(id==='post-1') {ratingStarted=true; await ratingWrite.promise;}
   else {nextRatingStarted=true; await nextRatingWrite.promise;}
   return {rating:id==='post-1' ? 9 : 5,ratingCount:1,myRating:id==='post-1' ? 9 : 5};
  }});
  await mutation.page.goto(`${baseUrl}/article/workspace-coll/post-1`);
  await bodyReady(mutation.page);
  await mutation.page.getByPlaceholder('写一条评论...').fill('A的新评论');
  await mutation.page.getByRole('button',{name:'发布评论',exact:true}).click();
  await mutation.page.getByRole('button',{name:/^为本篇打分/}).click();
  await mutation.page.getByRole('button',{name:'9',exact:true}).click();
  await until(mutation.page,() => commentStarted && ratingStarted);
  await navigateTo(mutation.page,'/article/workspace-coll/post-2');
  await bodyReady(mutation.page,'正文2');
  const draft=mutation.page.getByPlaceholder('写一条评论...');
  await draft.fill('B未发布的草稿');
  await mutation.page.getByRole('button',{name:/^为本篇打分/}).click();
  assert.equal(await mutation.page.getByRole('button',{name:'9',exact:true}).isEnabled(),true);
  await mutation.page.getByRole('button',{name:'发布评论',exact:true}).click();
  await mutation.page.getByRole('button',{name:'5',exact:true}).click();
  await until(mutation.page,() => nextCommentStarted && nextRatingStarted);
  commentWrite.resolve(); ratingWrite.resolve();
  await mutation.page.waitForTimeout(300);
  assert.equal(await draft.inputValue(),'B未发布的草稿');
  assert.equal(await mutation.page.getByText('A的新评论',{exact:true}).count(),0);
  assert.equal(await mutation.page.getByRole('button',{name:'9',exact:true}).count(),1);
  assert.equal(await mutation.page.getByRole('button',{name:'9',exact:true}).isDisabled(),true);
  assert.equal(await mutation.page.getByText('9.0 / 10',{exact:true}).count(),0);
  assert.equal(await mutation.page.getByRole('button',{name:'发布中...',exact:true}).isDisabled(),true);
  nextCommentWrite.resolve(); nextRatingWrite.resolve();
  await mutation.page.getByText('B未发布的草稿',{exact:true}).waitFor();
  await mutation.page.getByText('5.0 / 10',{exact:true}).waitFor();
  assert.equal(await draft.inputValue(),'');
  assert.equal(await mutation.page.getByRole('button',{name:'9',exact:true}).count(),0);
  mutation.check(); await mutation.page.close();
  console.log('PASS: delayed A comment/rating keeps B detail, draft, picker and submission controls intact');

  const linked=await fixture(browser,{comments:[
   {commentId:'root',creatorId:'tester',creatorName:'评论者',content:'根评论',createdAt:'2026-10-22T00:00:00Z'},
   {commentId:'linked',creatorId:'tester',creatorName:'回复者',content:'深链回复',createdAt:'2026-10-22T00:00:00Z',parentCommentId:'root',rootCommentId:'root'},
  ]});
  await linked.page.goto(`${baseUrl}/article/workspace-coll/post-1#comment-linked`);
  await linked.page.locator('#comment-linked').waitFor({state:'visible'});
  assert.equal(new URL(linked.page.url()).hash,'#comment-linked');
  assert.equal(await linked.page.getByRole('button',{name:'收起 1 条回复',exact:true}).count(),1);
  linked.check(); await linked.page.close();
  console.log('PASS: direct reply deep link preserves hash and expands the containing thread');

  const list=await fixture(browser,{posts:Array.from({length:75},(_,index) => post(index+1))});
  const page=list.page, cards=page.locator('article.group');
  await page.goto(`${baseUrl}/article/workspace-coll`);
  await until(page,async () => await cards.count()===30);
  await page.evaluate(() => window.scrollTo(0,document.documentElement.scrollHeight));
  await until(page,async () => await cards.count()>=45);
  await page.waitForTimeout(700);
  const loadedCount=await cards.count();
  await page.getByRole('heading',{name:'帖子001',level:2,exact:true}).click();
  await bodyReady(page);
  await page.getByRole('button',{name:'返回帖子列表',exact:true}).click();
  await page.getByRole('heading',{name:'帖子001',level:2,exact:true}).waitFor();
  assert((await cards.count())>=loadedCount,'returning from detail must preserve loaded pages');
  await page.getByRole('button',{name:'专栏A 37',exact:true}).click();
  const search=page.getByPlaceholder('搜索本专栏帖子...');
  await search.fill('帖子002');
  await until(page,async () => await cards.count()===1);
  await page.getByRole('heading',{name:'帖子002',level:2,exact:true}).click();
  await bodyReady(page,'正文2');
  await until(page,() => list.counts.read===2);
  await page.getByRole('button',{name:'返回帖子列表',exact:true}).click();
  await page.getByRole('heading',{name:'帖子002',level:2,exact:true}).waitFor();
  assert.equal(await search.inputValue(),'帖子002');
  assert.equal(await cards.count(),1);
  assert((await page.getByRole('button',{name:'专栏A 37',exact:true}).getAttribute('class')).includes('text-white'));
  assert.equal(await cards.getByText('NEW',{exact:true}).count(),0);
  assert.equal(list.counts.list,2);
  assert.equal(list.counts.tree,0);
  list.check(); await page.close();
  console.log(`PASS: ${loadedCount} loaded cards, category and search survive detail return; list requests stay at 2`);

  const anonymous=await fixture(browser,{anonymous:true});
  await anonymous.page.goto(`${baseUrl}/article/workspace-coll/post-1`);
  await bodyReady(anonymous.page);
  await anonymous.page.waitForLoadState('networkidle');
  assert.equal(await anonymous.page.getByRole('button',{name:/^为本篇打分/}).count(),0);
  assert.equal(await anonymous.page.getByPlaceholder('写一条评论...').count(),0);
  assert.equal(anonymous.counts.read,0);
  anonymous.check(); await anonymous.page.close();
  console.log('PASS: unauthenticated detail stays readable without management/comment/rating or read mutation');

  const polling=await fixture(browser,{polling:true});
  await polling.page.goto(`${baseUrl}/article/workspace-coll/post-1`);
  await bodyReady(polling.page,'配图已更新');
  assert.equal(polling.counts.detail,3);
  assert.equal(polling.counts.read,1);
  await polling.page.waitForTimeout(5500);
  assert.equal(polling.counts.detail,3);
  assert.equal(polling.counts.read,1);
  polling.check(); await polling.page.close();
  console.log('PASS: pending illustration polls once, keeps read state and stops after completion');
 } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1)});
