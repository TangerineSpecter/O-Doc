import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getCropPixelCoords,
    getInitialSquareCrop,
    moveSquareCrop,
    resizeSquareCrop,
    zoomSquareCrop,
} from './avatarCrop';

test('getInitialSquareCrop centers a 1:1 crop on wide images', () => {
    // 宽 800, 高 400 => 横图
    const crop = getInitialSquareCrop(800, 400);
    assert.equal(crop.height, 1);
    assert.equal(crop.width, 0.5);
    assert.equal(crop.x, 0.25);
    assert.equal(crop.y, 0);

    const pixels = getCropPixelCoords(crop, 800, 400);
    assert.equal(pixels.sWidth, 400);
    assert.equal(pixels.sHeight, 400);
    assert.equal(pixels.sx, 200);
    assert.equal(pixels.sy, 0);
});

test('getInitialSquareCrop centers a 1:1 crop on tall images', () => {
    // 宽 300, 高 600 => 竖图
    const crop = getInitialSquareCrop(300, 600);
    assert.equal(crop.width, 1);
    assert.equal(crop.height, 0.5);
    assert.equal(crop.x, 0);
    assert.equal(crop.y, 0.25);

    const pixels = getCropPixelCoords(crop, 300, 600);
    assert.equal(pixels.sWidth, 300);
    assert.equal(pixels.sHeight, 300);
    assert.equal(pixels.sx, 0);
    assert.equal(pixels.sy, 150);
});

test('getInitialSquareCrop covers 100% on square images', () => {
    const crop = getInitialSquareCrop(500, 500);
    assert.equal(crop.x, 0);
    assert.equal(crop.y, 0);
    assert.equal(crop.width, 1);
    assert.equal(crop.height, 1);

    const pixels = getCropPixelCoords(crop, 500, 500);
    assert.equal(pixels.sWidth, 500);
    assert.equal(pixels.sHeight, 500);
    assert.equal(pixels.sx, 0);
    assert.equal(pixels.sy, 0);
});

test('moveSquareCrop respects boundaries', () => {
    // 视口宽 400, 高 400, 初始选区 200x200 居中 (100, 100)
    const current = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

    // 尝试向右移 500px，应被限制在边缘 x = 200px (0.5)
    const movedRight = moveSquareCrop(current, 400, 400, 500, 0);
    assert.equal(movedRight.x, 0.5);
    assert.equal(movedRight.y, 0.25);
    assert.equal(movedRight.width, 0.5);
    assert.equal(movedRight.height, 0.5);

    // 尝试向左上移 -300px，应被限制在 (0, 0)
    const movedTopLeft = moveSquareCrop(current, 400, 400, -300, -300);
    assert.equal(movedTopLeft.x, 0);
    assert.equal(movedTopLeft.y, 0);
});

test('resizeSquareCrop keeps 1:1 ratio and clamps within viewport', () => {
    // 视口 400x400，初始在 (50, 50) 大小 200x200
    const current = { x: 50 / 400, y: 50 / 400, width: 200 / 400, height: 200 / 400 };

    // 拖动右下角 'se' 增加 50px
    const resizedSe = resizeSquareCrop(current, 400, 400, 'se', 50, 50);
    assert.equal(resizedSe.x, 50 / 400);
    assert.equal(resizedSe.y, 50 / 400);
    assert.equal(resizedSe.width, 250 / 400);
    assert.equal(resizedSe.height, 250 / 400);

    // 拖动右下角过大，应被限制在最大 350px (400 - 50)
    const resizedMax = resizeSquareCrop(current, 400, 400, 'se', 500, 500);
    assert.equal(resizedMax.width, 350 / 400);
    assert.equal(resizedMax.height, 350 / 400);
});

test('zoomSquareCrop zooms from center and clamps', () => {
    // 视口 400x400，选区 200x200 (x=100, y=100)
    const current = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const zoomedIn = zoomSquareCrop(current, 400, 400, 1.2);
    // 新边长 240, 中心仍为 200 => x=80, y=80
    assert.equal(zoomedIn.width, 240 / 400);
    assert.equal(zoomedIn.height, 240 / 400);
    assert.equal(zoomedIn.x, 80 / 400);
    assert.equal(zoomedIn.y, 80 / 400);
});

test('getCropPixelCoords correctly mirrors horizontal coordinates when flipHorizontal is true', () => {
    // 宽 1000, 高 1000
    // 视觉上用户把选区放在左侧 x = 0.1, width = 0.4
    // 翻转后，原图上对应的有效 X 应为 1 - 0.1 - 0.4 = 0.5
    const crop = { x: 0.1, y: 0.2, width: 0.4, height: 0.4 };
    const coords = getCropPixelCoords(crop, 1000, 1000, true);
    assert.equal(coords.sx, 500);
    assert.equal(coords.sy, 200);
    assert.equal(coords.sWidth, 400);
    assert.equal(coords.sHeight, 400);

    // 未翻转时：有效 X 为 0.1
    const normalCoords = getCropPixelCoords(crop, 1000, 1000, false);
    assert.equal(normalCoords.sx, 100);
    assert.equal(normalCoords.sy, 200);
});

