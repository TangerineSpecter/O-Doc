import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {decodeAppearancePackage, encodeAppearancePackage} from './appearancePackage.ts';

// Isolated browser decoders: no resource upload or real user data is touched.
Object.assign(globalThis, {
    FileReader: class {
        result = ''; onload?: () => void;
        async readAsDataURL(blob: Blob) {this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onload?.();}
    },
    createImageBitmap: async (file: File) => ({width: file.name === 'character.png' ? 374 : 512, height: file.name === 'character.png' ? 528 : 512, close() {}}),
});
const layer = {x: -14, y: -97, scale: .72, rotation: -.16};
const draft = () => ({source: new File(['original bytes'], 'source.webp', {type: 'image/webp'}),
    cutout: new Blob(['cutout bytes'], {type: 'image/png'}), character: new Blob(['final bytes'], {type: 'image/png'}),
    transform: {x: 0, y: 0, scale: .37, crop: {x: 20, y: 10, width: 450, height: 500}},
    overlays: {leftHand: {...layer, x: 2}, rightHand: {...layer, x: 3}, weapon: {...layer}},
    preview: {jobId: 'job.novice', weaponId: 'equip.sword'}});
const fileFrom = (value: unknown) => new File([JSON.stringify(value)], 'appearance.json');

test('portable roundtrip preserves all bytes and layouts on repeated import', async () => {
    const input = draft(); const encoded = await encodeAppearancePackage(input);
    assert.ok(!(await encoded.text()).includes('AssetId'));
    for (let i = 0; i < 2; i++) {
        const result = await decodeAppearancePackage(new File([encoded], 'appearance.json'));
        for (const key of ['source', 'cutout', 'character'] as const) assert.equal(await result[key].text(), await input[key].text());
        assert.deepEqual(result.transform, input.transform); assert.deepEqual(result.overlays, input.overlays); assert.deepEqual(result.preview, input.preview);
    }
});
test('rejects malformed JSON and unsupported package/renderer versions', async () => {
    await assert.rejects(decodeAppearancePackage(new File(['{'], 'bad.json')));
    const value = JSON.parse(await (await encodeAppearancePackage(draft())).text());
    for (const key of ['version', 'appearanceVersion', 'rendererVersion']) await assert.rejects(decodeAppearancePackage(fileFrom({...value, [key]: 99})));
});
test('rejects incomplete/out-of-range layouts, crop overflow and invalid images', async () => {
    const value = JSON.parse(await (await encodeAppearancePackage(draft())).text());
    for (const mutation of [
        {overlays: {}}, {transform: {...value.transform, scale: 0}},
        {overlays: {...value.overlays, weapon: {...layer, x: 999}}},
        {transform: {...value.transform, crop: {x: 500, y: 0, width: 20, height: 10}}},
        {cutout: {...value.cutout, type: 'text/html'}}, {source: {...value.source, data: '!!!'}},
    ]) await assert.rejects(decodeAppearancePackage(fileFrom({...value, ...mutation})));
});

test('small fitted scales survive package roundtrip and values below the shared minimum are rejected', async()=>{
    const input=draft(); input.transform.scale=338/3900;
    const blob=await encodeAppearancePackage(input);
    const restored=await decodeAppearancePackage(new File([blob],'large-art.json'));
    assert.equal(restored.transform.scale,input.transform.scale);
    const invalid=JSON.parse(await blob.text()); invalid.transform.scale=.009;
    await assert.rejects(decodeAppearancePackage(fileFrom(invalid)));
});
