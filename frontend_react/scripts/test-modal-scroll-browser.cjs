// All backend requests use isolated fixtures. No settings are saved.
const {chromium} = require(process.env.ODOC_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.ODOC_MODAL_TEST_URL || 'http://127.0.0.1:5173';
(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.ODOC_CHROMIUM});
    try {
        for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            const context = await browser.newContext({viewport, hasTouch: true});
            await context.addInitScript(() => localStorage.setItem('token', 'isolated-fixture-token'));
            await context.route(`${base}/api/**`, route => {
                const pathname = new URL(route.request().url()).pathname;
                let data = [];
                if (pathname.endsWith('/user/profile')) data = {username: 'isolated', role: 'admin', isAdmin: true, isSuperuser: true};
                else if (pathname.includes('/config/')) data = {};
                else if (pathname.endsWith('/categories/')) data = Array.from({length: 40}, (_, i) => ({id: `fixture-${i}`, name: `分类 ${i}`, enabled: true}));
                return route.fulfill({contentType: 'application/json', body: JSON.stringify({code: 200, msg: '成功', data})});
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(String(error)));
            const wheel = async (locator, delta = 200) => {await locator.hover(); await page.mouse.wheel(0, delta); await page.waitForTimeout(120);};
            await page.goto(`${base}/settings?tab=agent`);
            await page.waitForLoadState('networkidle');
            await page.getByRole('button', {name: '任务分配', exact: true}).click();
            await page.getByRole('button', {name: '配置', exact: true}).nth(1).click();
            await page.getByRole('heading', {name: '配置系统任务'}).waitFor();
            const modal = page.locator('[data-modal-scroll-lock]').filter({has: page.getByRole('heading', {name: '配置系统任务'})});
            await page.waitForFunction(() => document.body.style.overflow === 'hidden');
            const scroll = modal.locator('.overflow-y-auto').first();
            const backgroundY = await page.evaluate(() => window.scrollY);
            await page.mouse.move(3, viewport.height / 2); await page.mouse.wheel(0, 600); await page.waitForTimeout(120);
            assert.equal(await page.evaluate(() => window.scrollY), backgroundY);
            await wheel(scroll);
            assert.ok(await scroll.evaluate(el => el.scrollTop) > 0, 'modal content must scroll');
            await scroll.evaluate(el => {el.scrollTop = el.scrollHeight;}); await wheel(scroll, 600);
            assert.equal(await page.evaluate(() => window.scrollY), backgroundY, 'boundary must not scroll page');
            await modal.getByRole('button', {name: '展开编辑', exact: true}).click();
            const editor = page.getByRole('dialog', {name: '编辑提示词', exact: true}); await editor.waitFor();
            await page.keyboard.press('Escape'); await editor.waitFor({state: 'detached'});
            assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'parent must stay locked');
            await scroll.evaluate(el => {el.scrollTop = 0;});
            await modal.getByRole('button', {name: '添加帖子分类（可多选）', exact: true}).click();
            const menu = page.getByRole('listbox'); await menu.waitFor(); await wheel(menu, 250);
            assert.ok(await menu.evaluate(el => el.scrollTop) > 0, 'portaled menu must scroll');
            await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await modal.waitFor({state: 'detached'});
            await page.waitForFunction(() => document.body.style.overflow !== 'hidden');
            // Real shared WorldDialog above a scrollable background card.
            await page.evaluate(async () => {
                const {default: React} = await import('/node_modules/.vite/deps/react.js');
                const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
                const {default: WorldDialog} = await import('/src/components/AgentWorld/WorldDialog.tsx');
                const background = document.createElement('div'); background.id = 'fixture-background';
                background.style.cssText = 'position:fixed;left:0;top:120px;z-index:95;width:100px;height:100px;overflow:auto';
                background.innerHTML = '<div style="height:2000px">background</div>'; document.body.append(background);
                const host = document.createElement('div'); document.body.append(host); const root = ReactDOM.createRoot(host);
                root.render(React.createElement(WorldDialog, {title: '滚动回归', onClose: () => root.unmount()}, React.createElement('div', {style: {minHeight: '1800px'}}, '可滚动内容')));
            });
            const world = page.getByRole('dialog', {name: '滚动回归', exact: true}); await world.waitFor();
            const worldScroll = world.locator('.overflow-y-auto'); await wheel(worldScroll);
            assert.ok(await worldScroll.evaluate(el => el.scrollTop) > 0);
            const result = await page.evaluate(() => {
                const target = document.getElementById('fixture-background');
                const start = new Touch({identifier: 1, target, clientX: 10, clientY: 80});
                const end = new Touch({identifier: 1, target, clientX: 10, clientY: 20});
                target.dispatchEvent(new TouchEvent('touchstart', {bubbles: true, touches: [start]}));
                const touch = new TouchEvent('touchmove', {bubbles: true, cancelable: true, touches: [end]}); target.dispatchEvent(touch);
                const wheel = new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: 120}); target.dispatchEvent(wheel);
                return {touch: touch.defaultPrevented, wheel: wheel.defaultPrevented, top: target.scrollTop};
            });
            assert.deepEqual(result, {touch: true, wheel: true, top: 0});
            await world.getByRole('button', {name: '关闭面板', exact: true}).click();
            assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'exit animation retains lock');
            await world.waitFor({state: 'detached'}); await page.waitForFunction(() => document.body.style.overflow !== 'hidden');
            await wheel(page.locator('#fixture-background'));
            assert.ok(await page.locator('#fixture-background').evaluate(el => el.scrollTop) > 0, 'background resumes');
            assert.deepEqual(errors, []);
            console.log(`PASS ${viewport.width}x${viewport.height}: task, nested editor, Select, WorldDialog, wheel/touch, exit, restoration`);
            await context.close();
        }
    } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
