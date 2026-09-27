// All API requests use isolated fixtures; this script never saves real Agents.
const {chromium} = require(process.env.ODOC_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const base = process.env.ODOC_AGENT_TEST_URL || 'http://localhost:43127';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'odoc-agent-prompt-ui-'));
const generated = '# 姓名：菲伦 / Fern\n\n## 身份\n你是魔法使。\n\n## 人格倾向\nISTJ，这是创作倾向。';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVxkAAAAASUVORK5CYII=', 'base64');

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.ODOC_CHROMIUM});
    const errors = [];
    try {
        for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
            const context = await browser.newContext({viewport});
            await context.addInitScript(() => localStorage.setItem('token', 'isolated-fixture-token'));
            let avatarFails = false;
            let visionCalls = 0;
            let saved = null;
            const generationRequests = [];
            await context.route(`${base}/api/**`, async route => {
                const url = new URL(route.request().url());
                const pathname = url.pathname;
                let data = [];
                if (pathname.endsWith('/user/profile')) data = {username: 'isolated', role: 'admin', isAdmin: true, isSuperuser: true};
                else if (pathname.includes('/resource/view/')) {
                    await route.fulfill({contentType: 'image/png', body: png}); return;
                } else if (pathname.endsWith('/resource/upload')) data = {id: 'avatar-fixture'};
                else if (pathname.endsWith('/agents/describe-avatar/')) {
                    visionCalls++;
                    data = avatarFails ? {description: '', avatarUsed: false, warning: '本次未参考头像'} : {description: '紫色头发与紫色眼睛', avatarUsed: true, warning: ''};
                } else if (pathname.endsWith('/agents/generate-prompt/')) {
                    const body = route.request().postDataJSON();
                    generationRequests.push(body);
                    if (body.source === '延迟作品') await new Promise(resolve => setTimeout(resolve, 800));
                    data = body.characterName === '未知角色'
                        ? {status: 'needs_information', prompt: '', question: '请补充角色经历', avatarUsed: false, warning: ''}
                        : {status: 'ready', prompt: generated, question: '', avatarUsed: Boolean(body.avatarDescription), warning: ''};
                } else if (pathname.endsWith('/agents/') && route.request().method() === 'POST') {
                    saved = route.request().postDataJSON(); data = {...saved, id: 'created-fixture'};
                } else if (pathname.includes('/config/')) data = {};
                try {await route.fulfill({contentType: 'application/json', body: JSON.stringify({code: 200, msg: '成功', data})});} catch {/* cancelled stale request */}
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(String(error)));
            await page.goto(`${base}/settings?tab=agent`);
            await page.waitForLoadState('networkidle');
            if (!await page.getByRole('button', {name: '创建 Agent', exact: true}).count()) {
                await page.screenshot({path: path.join(output, 'initial-state.png'), fullPage: true});
                throw new Error(`Agent settings not rendered: ${await page.locator('body').innerText()} ${errors.join('; ')}. Screenshot: ${output}`);
            }
            await page.getByRole('button', {name: '创建 Agent', exact: true}).click();
            await page.getByPlaceholder('如：写作助手').fill('菲伦');
            const originalPrompt = await page.locator('#agent-prompt').inputValue();
            await page.getByRole('button', {name: '生成角色提示词', exact: true}).click();
            await page.getByLabel('角色姓名', {exact: true}).fill('菲伦');
            await page.getByLabel('角色出处', {exact: true}).fill('葬送的芙莉莲');
            await page.locator('input[type=file]').setInputFiles({name: 'avatar.png', mimeType: 'image/png', buffer: png});
            await page.getByText('头像已上传', {exact: true}).waitFor();
            await page.getByRole('button', {name: '开始生成', exact: true}).click();
            await page.locator('#agent-prompt-preview').waitFor();
            assert.equal(visionCalls, 1);
            assert.equal(generationRequests.at(-1).avatarDescription, '紫色头发与紫色眼睛');
            assert.equal(await page.locator('#agent-prompt').inputValue(), originalPrompt, 'preview must not overwrite draft');
            await page.locator('#agent-prompt-preview').fill('');
            assert.equal(await page.locator('#agent-prompt-preview').count(), 1, 'clearing preview must keep editor visible');
            assert.equal(await page.getByRole('button', {name: '应用到提示词', exact: true}).isEnabled(), false);
            await page.locator('#agent-prompt-preview').fill(generated + '\n我喜欢甜点。');
            await page.getByRole('button', {name: '应用到提示词', exact: true}).click();
            await page.getByRole('button', {name: '应用到提示词', exact: true}).click();
            await page.getByRole('button', {name: '撤销应用', exact: true}).click();
            assert.equal(await page.locator('#agent-prompt').inputValue(), originalPrompt, 'repeated apply must preserve original');

            avatarFails = true;
            await page.getByRole('button', {name: '重新生成', exact: true}).click();
            await page.locator('#agent-prompt-preview').waitFor();
            await page.getByText('本次未参考头像', {exact: true}).waitFor();
            await page.getByLabel('角色姓名', {exact: true}).fill('未知角色');
            await page.getByRole('button', {name: '开始生成', exact: true}).click();
            await page.getByText('请补充角色经历', {exact: false}).waitFor();
            assert.equal(await page.locator('#agent-prompt-preview').count(), 0);

            await page.getByLabel('角色姓名', {exact: true}).fill('菲伦');
            await page.getByLabel('角色出处', {exact: true}).fill('延迟作品');
            await page.getByRole('checkbox', {name: /参考当前头像/}).uncheck();
            await Promise.all([
                page.waitForRequest(request => request.url().includes('/generate-prompt/')),
                page.getByRole('button', {name: '开始生成', exact: true}).click(),
            ]);
            await page.getByLabel('角色出处', {exact: true}).fill('新作品');
            await page.waitForTimeout(1000);
            assert.equal(await page.locator('#agent-prompt-preview').count(), 0, 'stale response must be discarded');

            await page.getByLabel('角色出处', {exact: true}).fill('延迟作品');
            await Promise.all([
                page.waitForRequest(request => request.url().includes('/generate-prompt/')),
                page.getByRole('button', {name: '开始生成', exact: true}).click(),
            ]);
            await page.getByRole('button', {name: '收起生成面板', exact: true}).click();
            await page.getByRole('button', {name: '生成角色提示词', exact: true}).click();
            assert.equal(await page.getByRole('button', {name: '开始生成', exact: true}).isEnabled(), true, 'reopening cancelled generation must not stay busy');
            await page.waitForTimeout(1000);
            assert.equal(await page.locator('#agent-prompt-preview').count(), 0);

            await page.getByRole('button', {name: '原创角色', exact: true}).click();
            await page.getByLabel('原创角色设定', {exact: true}).fill('一位内向的魔法使，喜欢甜点。');
            await page.getByRole('button', {name: '开始生成', exact: true}).click();
            await page.locator('#agent-prompt-preview').waitFor();
            assert.equal(generationRequests.at(-1).characterType, 'original');
            await page.screenshot({path: path.join(output, `preview-${viewport.width}.png`), fullPage: true});
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'horizontal overflow');
            await page.getByRole('button', {name: '应用到提示词', exact: true}).click();
            const save = page.getByRole('button', {name: /保存 Agent|创建并保存|保存配置/});
            if (await save.count()) {
                await save.first().click();
                await page.waitForTimeout(200);
                assert.equal(saved?.prompt, generated, 'save must include applied prompt');
            } else {
                throw new Error('Agent save button not found');
            }
            await page.getByTitle('编辑 Agent', {exact: true}).click();
            assert.equal(await page.locator('#agent-prompt').inputValue(), generated);
            await page.getByRole('button', {name: '生成角色提示词', exact: true}).click();
            assert.equal(await page.getByLabel('角色姓名', {exact: true}).inputValue(), '菲伦');
            await page.getByLabel('角色出处', {exact: true}).fill('延迟作品');
            await page.getByRole('checkbox', {name: /参考当前头像/}).uncheck();
            await Promise.all([
                page.waitForRequest(request => request.url().includes('/generate-prompt/')),
                page.getByRole('button', {name: '开始生成', exact: true}).click(),
            ]);
            await page.getByRole('button', {name: '取消', exact: true}).click();
            await page.getByRole('button', {name: '创建 Agent', exact: true}).click();
            await page.getByPlaceholder('如：写作助手').fill('新的角色');
            await page.getByRole('button', {name: '生成角色提示词', exact: true}).click();
            await page.waitForTimeout(1000);
            assert.equal(await page.locator('#agent-prompt-preview').count(), 0, 'closed Agent request must not populate new Agent');
            assert.equal(await page.getByLabel('角色姓名', {exact: true}).inputValue(), '新的角色');
            await context.close();
        }
        assert.deepEqual(errors, []);
        console.log('Passed desktop/mobile: avatar, fallback, preview/edit, apply/undo, original character, clarification, stale response, save, no overflow.');
        console.log('Screenshots:', output);
    } finally {await browser.close();}
})().catch(error => {console.error(error); process.exit(1);});
