import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getFishArtProfile} from '../src/components/Fishing/fishVisuals.ts';
import {fishBodyMask} from '../src/components/Fishing/fishAnatomy.ts';
import {rasterFishArt, silhouette} from './fish-art-raster.mjs';

const {fishing} = JSON.parse(readFileSync(new URL('../src/mocks/agentWorld/catalog.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const crownless = id => rasterFishArt({...getFishArtProfile(id), king: false});

test('all fifty fish produce different actual pixels, with and without crowns', () => {
    for (const withoutCrown of [false, true]) {
        const seen = new Map();
        for (const [id, fish] of Object.entries(fishing.fish)) {
            const pixels = withoutCrown ? crownless(id) : rasterFishArt(getFishArtProfile(id));
            assert.ok(silhouette(pixels).filter(alpha => alpha > 0).length > 65, fish.name);
            const key = hash(pixels);
            assert.equal(seen.get(key), undefined, `${fish.name} duplicates ${seen.get(key)} (without crown: ${withoutCrown})`);
            seen.set(key, fish.name);
        }
    }
});

test('reported lookalikes and every king differ structurally without relying on a crown or palette', () => {
    const pairs = [
        ['loach', 'marsh_eel'], ['red_drum', 'spotted_grouper'], ['tuskfish', 'reef_king'],
        ['abyss_angler', 'trench_king'], ['catfish', 'frost_cod'], ['catfish', 'abyss_cod'],
        ['dace', 'silverfish'], ['dace', 'ayu'], ['mandarin', 'featherback'],
        ['rainbow_trout', 'ice_whitefish'], ['silver_grayling', 'red_spotted_trout'],
        ['golden_carp', 'carp'], ['river_king', 'catfish'], ['moon_king', 'bitterling'],
        ['stream_king', 'red_spotted_trout'], ['wetland_king', 'catfish'], ['bay_king', 'black_seabream'],
        ['frost_king', 'northern_char'], ['spring_king', 'obsidian_eel'],
    ];
    for (const [first, second] of pairs) {
        const a = silhouette(crownless(first)), b = silhouette(crownless(second));
        const changed = a.filter((value, index) => value !== b[index]).length;
        assert.ok(changed >= 16, `${first} vs ${second}: only ${changed} silhouette pixels differ`);
    }
});

test('loach and eel bodies remain one connected solid ribbon, with no forked body', () => {
    for (const shape of ['loach', 'eel', 'royal_eel']) {
        const body = fishBodyMask(shape), remaining = new Set(body), queue = [remaining.values().next().value];
        remaining.delete(queue[0]);
        for (let i = 0; i < queue.length; i++) {
            const [x, y] = queue[i].split(',').map(Number);
            for (const key of [`${x-1},${y}`, `${x+1},${y}`, `${x},${y-1}`, `${x},${y+1}`]) {
                if (remaining.delete(key)) queue.push(key);
            }
        }
        assert.equal(remaining.size, 0, `${shape} body is disconnected`);
        for (let x = 5; x < 29; x++) {
            const ys = [...body].map(key => key.split(',').map(Number)).filter(([px]) => px === x).map(([, y]) => y);
            assert.equal(ys.length, Math.max(...ys) - Math.min(...ys) + 1, `${shape} has a hollow or fork at x=${x}`);
        }
    }
});
