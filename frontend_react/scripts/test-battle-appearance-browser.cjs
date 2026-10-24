// Real Canvas raster regression; blank document, no app startup or real API requests.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.ODOC_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ODOC_APPEARANCE_TEST_URL || 'http://localhost:43127';

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.ODOC_CHROMIUM});
    try {
        const page = await browser.newPage();
        await page.route(`${base}/appearance-pixel-regression`, route => route.fulfill({contentType: 'text/html', body: '<html><body></body></html>'}));
        await page.route(`${base}/api/**`, route => route.abort());
        await page.goto(`${base}/appearance-pixel-regression`);
        const result = await page.evaluate(async () => {
            const {renderCharacterFrame, groundCharacterPlacement, alphaBounds} = await import('/src/components/Settings/agent/battle-appearance/imageProcessing.ts');
            const source = document.createElement('canvas'); source.width = 100; source.height = 100;
            const context = source.getContext('2d'); context.fillRect(17, 13, 63, 73);
            const failures = [];
            // Independently draw the same transformed art into a larger canvas, then
            // inspect everything outside the export rectangle for lost alpha pixels.
            for (const scale of [.1, .34, .5, .997, 1, 1.2, 2.3]) for (const axis of ['x', 'y']) {
                for (const offset of [-550, -500, -200, -101, -40, -1, 0, 1, 2, 14, 38, 39, 69, 90, 200]) {
                    const transform = {x: 0, y: 0, scale, [axis]: offset};
                    const frame = renderCharacterFrame(source, {x: 0, y: 0, width: 100, height: 100}, transform);
                    const reference = document.createElement('canvas'); reference.width = 1000; reference.height = 1400;
                    const g = reference.getContext('2d'); g.imageSmoothingEnabled = false;
                    const size = Math.round(100 * scale);
                    g.drawImage(source, 0, 0, 100, 100, 300 + Math.round((374 - size) / 2 + transform.x), 300 + 528 - size + transform.y, size, size);
                    // Removing the frame leaves exactly the pixels the PNG would lose.
                    g.clearRect(300, 300, 374, 528);
                    const data = g.getImageData(0, 0, 1000, 1400).data;
                    const lost = data.some((alpha, index) => index % 4 === 3 && alpha > 0);
                    // GPU sampling at exact half-pixel ties can differ after translation;
                    // the guard must conservatively protect every pixel seen outside.
                    if (lost && !frame.clipped) failures.push({scale, axis, offset, lost, clipped: frame.clipped});
                }
            }
            const padded = renderCharacterFrame(source, {x: 0, y: 0, width: 100, height: 100}, {x: 0, y: 14, scale: 1});
            if (padded.clipped) failures.push({reason: 'transparent overflow blocked'});
            const pixels = context.getImageData(0, 0, 100, 100);
            const aligned = groundCharacterPlacement(pixels, {x: 0, y: 0, width: 100, height: 100}, {x: 0, y: 36, scale: 1});
            const frame = renderCharacterFrame(source, aligned.crop, aligned.transform);
            // Validate the encoded PNG, not only the pre-export Canvas.
            const bitmap = await createImageBitmap(await new Promise(resolve => frame.canvas.toBlob(resolve)));
            const exported = document.createElement('canvas'); exported.width = 374; exported.height = 528;
            const g = exported.getContext('2d'); g.drawImage(bitmap, 0, 0); bitmap.close();
            const bounds = alphaBounds(g.getImageData(0, 0, 374, 528));
            return {failures, clipped: frame.clipped, bottom: bounds.y + bounds.height};
        });
        assert.deepEqual(result, {failures: [], clipped: false, bottom: 528});
        console.log('Canvas overflow at multiple scales and PNG shoe baseline passed');
    } finally {
        await browser.close();
    }
})().catch(error => {console.error(error); process.exitCode = 1;});
