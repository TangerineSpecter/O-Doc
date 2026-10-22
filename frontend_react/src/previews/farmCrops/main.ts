import {cropKinds} from '../../types/api/farm';
import catalog from '../../mocks/agentWorld/catalog';
import {CROP_DRAW, CROP_SLOTS} from '../../components/Farm/scene/cropPlants';
import {CROP_ROWS, PLOT_HEAD, drawPlot, type PlotStage} from '../../components/Farm/scene/cropSprites';
import {cx, mk} from '../../components/Farm/scene/pixel';

let stage: PlotStage = 'ripe';
const root = document.querySelector<HTMLDivElement>('#crops')!;
const wet = document.querySelector<HTMLInputElement>('#wet')!;
const buttons = document.querySelectorAll<HTMLButtonElement>('[data-stage]');
const labels = {seedling: '幼苗', growing: '生长中', ripe: '已成熟', empty: '空闲'};

function render() {
    root.replaceChildren();
    for (const kind of cropKinds) {
        const figure = document.createElement('figure');
        const bed = document.createElement('div');
        bed.className = 'bed';
        const sprite = drawPlot(stage, {crop: kind, wet: wet.checked});
        const canvas = document.createElement('canvas');
        canvas.width = sprite.c.width; canvas.height = sprite.c.height;
        canvas.setAttribute('aria-label', `${catalog.farm.crops[kind].name} · ${labels[stage]}`);
        cx(canvas).drawImage(sprite.c, 0, 0);
        bed.append(canvas);
        const caption = document.createElement('figcaption');
        const image = document.createElement('img');
        image.src = `/farm/items/crop.${kind}.png`; image.alt = '收获物';
        const name = document.createElement('strong');
        name.textContent = catalog.farm.crops[kind].name;
        const status = document.createElement('small');
        status.textContent = labels[stage];
        caption.append(image, name, status); figure.append(bed, caption); root.append(figure);
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.stage === stage));
}

for (const button of buttons) button.addEventListener('click', () => {stage = button.dataset.stage as PlotStage; render();});
wet.addEventListener('change', render);
render();

// 使用真实浏览器 Canvas 验证全部品种、三阶段、干湿组合；并检查植株不会被画布裁边。
const errors: string[] = [];
const maturePixels = new Set<string>();
let count = 0;
for (const kind of cropKinds) {
    for (const phase of ['seedling', 'growing', 'ripe'] as const) for (const watered of [false, true]) {
        const sprite = drawPlot(phase, {crop: kind, wet: watered});
        const pixels = cx(sprite.c).getImageData(0, 0, sprite.c.width, sprite.c.height).data;
        if (!pixels.some((v, i) => i % 4 === 3 && v > 0)) errors.push(`${kind}/${phase}为空`);
        if (phase === 'ripe' && watered) maturePixels.add(pixels.toString());
        count++;
    }
    for (const phase of [1, 2, 3]) {
        const c = mk(40, 40), g = cx(c);
        CROP_DRAW[kind](g, 20, 22, phase);
        const pixels = g.getImageData(0, 0, 40, 40).data;
        const sprite = drawPlot('ripe', {crop: kind});
        for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
            if (!pixels[(y * 40 + x) * 4 + 3]) continue;
            for (const slot of CROP_SLOTS[kind]) for (const row of CROP_ROWS) {
                const sx = slot + 2 + x - 20, sy = row + PLOT_HEAD + 1 + y - 22;
                if (sx < 0 || sx >= sprite.c.width || sy < 0 || sy >= sprite.c.height) errors.push(`${kind}/${phase}超出植株安全范围`);
            }
        }
    }
}
if (maturePixels.size !== cropKinds.length) errors.push('存在重复的成熟外观');
document.querySelector('#checks')!.textContent = errors.length
    ? `检查失败：${[...new Set(errors)].join('；')}`
    : `已验证 ${count} 种干湿生长组合，16 种成熟外观均不同，植株未裁边。`;
