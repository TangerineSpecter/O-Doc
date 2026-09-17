import assert from 'node:assert/strict';
import test from 'node:test';
import {layoutThemes, mapWidth, rootX} from './biographyMindmapLayout.ts';

test('biography mind map places up to five themes and their leaves without box overlap', () => {
    const themes = Array.from({length: 5}, (_, index) => ({title: `主题 ${index}`, summary: '归纳', branches: Array.from({length: 3}, (_, branch) => ({title: `分支 ${branch}`, summary: '说明', chapters: [1]}))}));
    const map = layoutThemes(themes);
    const boxes = [{x: rootX - 94, y: map.rootY - 49, width: 188, height: 98}];
    for (const item of map.items) {
        boxes.push({x: item.x - 110, y: item.y - 38, width: 220, height: 76});
        for (const leaf of item.leaves) boxes.push({x: leaf.x - 125, y: leaf.y - 29, width: 250, height: 58});
    }
    for (let i = 0; i < boxes.length; i++) {
        assert.ok(boxes[i].x >= 0 && boxes[i].x + boxes[i].width <= mapWidth);
        assert.ok(boxes[i].y >= 0 && boxes[i].y + boxes[i].height <= map.height);
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `node boxes ${i} and ${j} overlap`);
        }
    }
});
